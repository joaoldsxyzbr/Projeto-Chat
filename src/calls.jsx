import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

const ICE_FALLBACK = [{ urls: ['stun:stun.cloudflare.com:3478'] }]
const TEMPO_CHAMANDO_MS = 30_000
const TEMPO_DESCONECTADO_MS = 10_000

function formatarDuracao(segundos = 0) {
  const total = Math.max(0, Math.floor(segundos))
  const horas = Math.floor(total / 3600)
  const minutos = Math.floor((total % 3600) / 60)
  const resto = total % 60

  if (horas > 0) {
    return `${horas}:${String(minutos).padStart(2, '0')}:${String(resto).padStart(2, '0')}`
  }

  return `${minutos}:${String(resto).padStart(2, '0')}`
}

function obterIniciais(nome = '') {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join('') || 'US'
}

function chamadaAtiva(chamada) {
  return chamada?.estado === 'chamando' || chamada?.estado === 'aceita'
}

function pararStream(stream) {
  stream?.getTracks().forEach((track) => track.stop())
}

export function useVoiceCalls({ usuarioId, onErro }) {
  const [chamada, setChamada] = useState(null)
  const [preparando, setPreparando] = useState(false)
  const [conectando, setConectando] = useState(false)
  const [mutado, setMutado] = useState(false)
  const [duracao, setDuracao] = useState(0)
  const [relayDisponivel, setRelayDisponivel] = useState(false)

  const chamadaRef = useRef(null)
  const streamLocalRef = useRef(null)
  const peerRef = useRef(null)
  const canalSinalRef = useRef(null)
  const canalSinalIdRef = useRef(null)
  const canalProntoRef = useRef(false)
  const geracaoCanalRef = useRef(0)
  const candidatosPendentesRef = useRef([])
  const ofertaEnviadaRef = useRef(false)
  const timeoutChamadaRef = useRef(null)
  const timeoutDesconexaoRef = useRef(null)
  const timerDuracaoRef = useRef(null)
  const remoteAudioRef = useRef(null)

  const definirChamada = useCallback((valor) => {
    chamadaRef.current = valor
    setChamada(valor)
  }, [])

  const enviarSinal = useCallback(async (evento, payload) => {
    const canal = canalSinalRef.current
    if (!canal || !canalProntoRef.current) throw new Error('Canal da ligação ainda não está pronto.')

    const resposta = await canal.send({
      type: 'broadcast',
      event: evento,
      payload,
    })

    if (resposta !== 'ok') throw new Error('Não foi possível sincronizar a ligação.')
  }, [])

  const limparPeer = useCallback(() => {
    clearTimeout(timeoutDesconexaoRef.current)
    timeoutDesconexaoRef.current = null

    if (peerRef.current) {
      peerRef.current.onicecandidate = null
      peerRef.current.ontrack = null
      peerRef.current.onconnectionstatechange = null
      peerRef.current.close()
      peerRef.current = null
    }

    candidatosPendentesRef.current = []
    ofertaEnviadaRef.current = false
    setConectando(false)

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null
    }
  }, [])

  const limparMidia = useCallback(() => {
    pararStream(streamLocalRef.current)
    streamLocalRef.current = null
    setMutado(false)
  }, [])

  const removerCanalSinal = useCallback(() => {
    geracaoCanalRef.current += 1
    canalProntoRef.current = false
    canalSinalIdRef.current = null

    const canal = canalSinalRef.current
    canalSinalRef.current = null
    if (canal) supabase.removeChannel(canal)
  }, [])

  const limparLigacaoLocal = useCallback(() => {
    clearTimeout(timeoutChamadaRef.current)
    timeoutChamadaRef.current = null
    clearInterval(timerDuracaoRef.current)
    timerDuracaoRef.current = null
    setDuracao(0)
    limparPeer()
    limparMidia()
    removerCanalSinal()
  }, [limparMidia, limparPeer, removerCanalSinal])

  const atualizarEstado = useCallback(async (estado, chamadaEsperada = chamadaRef.current) => {
    if (!chamadaEsperada?.id) return null

    const { data, error } = await supabase
      .from('chamadas')
      .update({ estado })
      .eq('id', chamadaEsperada.id)
      .eq('estado', chamadaEsperada.estado)
      .select('id,conversa_id,chamador_id,destinatario_id,estado,criada_em,atendida_em,encerrada_em')
      .maybeSingle()

    if (error) throw error
    if (data) definirChamada(data)
    return data
  }, [definirChamada])

  const flushCandidatos = useCallback(async () => {
    const peer = peerRef.current
    if (!peer?.remoteDescription) return

    const pendentes = candidatosPendentesRef.current.splice(0)
    for (const candidato of pendentes) {
      try {
        await peer.addIceCandidate(new RTCIceCandidate(candidato))
      } catch (error) {
        console.error('Falha ao aplicar candidato ICE:', error)
      }
    }
  }, [])

  const criarPeer = useCallback(async () => {
    if (peerRef.current) return peerRef.current
    if (!streamLocalRef.current) throw new Error('O microfone ainda não está disponível.')

    let iceServers = ICE_FALLBACK
    try {
      const { data, error } = await supabase.functions.invoke('obter-ice', { body: {} })
      if (!error && Array.isArray(data?.iceServers) && data.iceServers.length) {
        iceServers = data.iceServers
        setRelayDisponivel(Boolean(data.relay))
      } else {
        setRelayDisponivel(false)
      }
    } catch {
      setRelayDisponivel(false)
    }

    const peer = new RTCPeerConnection({ iceServers })
    peerRef.current = peer
    setConectando(true)

    streamLocalRef.current.getTracks().forEach((track) => {
      peer.addTrack(track, streamLocalRef.current)
    })

    peer.onicecandidate = (event) => {
      if (!event.candidate) return
      enviarSinal('ice', { candidato: event.candidate.toJSON() }).catch((error) => {
        console.error('Falha ao enviar candidato ICE:', error)
      })
    }

    peer.ontrack = (event) => {
      const stream = event.streams?.[0]
      if (!stream || !remoteAudioRef.current) return

      remoteAudioRef.current.srcObject = stream
      remoteAudioRef.current.play().catch(() => {})
    }

    peer.onconnectionstatechange = () => {
      const estado = peer.connectionState

      if (estado === 'connected') {
        clearTimeout(timeoutDesconexaoRef.current)
        timeoutDesconexaoRef.current = null
        setConectando(false)
        return
      }

      if (estado === 'connecting' || estado === 'new') {
        setConectando(true)
        return
      }

      if (estado === 'disconnected' || estado === 'failed') {
        setConectando(true)
        clearTimeout(timeoutDesconexaoRef.current)
        timeoutDesconexaoRef.current = setTimeout(async () => {
          const atual = chamadaRef.current
          if (!atual || atual.estado !== 'aceita') return

          const conexaoAtual = peerRef.current?.connectionState
          if (conexaoAtual === 'connected' || conexaoAtual === 'connecting') return

          try {
            await atualizarEstado('encerrada', atual)
          } catch (error) {
            onErro?.(error.message || 'A ligação perdeu a conexão.')
          }
        }, TEMPO_DESCONECTADO_MS)
      }
    }

    return peer
  }, [atualizarEstado, enviarSinal, onErro])

  const aoPronto = useCallback(async () => {
    const atual = chamadaRef.current
    if (!atual || atual.chamador_id !== usuarioId || ofertaEnviadaRef.current) return

    try {
      const peer = await criarPeer()
      ofertaEnviadaRef.current = true
      const oferta = await peer.createOffer({ offerToReceiveAudio: true })
      await peer.setLocalDescription(oferta)
      await enviarSinal('oferta', { sdp: peer.localDescription })
    } catch (error) {
      ofertaEnviadaRef.current = false
      onErro?.(error.message || 'Não foi possível iniciar a ligação.')
    }
  }, [criarPeer, enviarSinal, onErro, usuarioId])

  const aoOferta = useCallback(async ({ payload }) => {
    const atual = chamadaRef.current
    if (!atual || atual.destinatario_id !== usuarioId || atual.estado !== 'aceita' || !payload?.sdp) return

    try {
      const peer = await criarPeer()
      await peer.setRemoteDescription(new RTCSessionDescription(payload.sdp))
      await flushCandidatos()
      const resposta = await peer.createAnswer()
      await peer.setLocalDescription(resposta)
      await enviarSinal('resposta', { sdp: peer.localDescription })
    } catch (error) {
      onErro?.(error.message || 'Não foi possível responder à ligação.')
    }
  }, [criarPeer, enviarSinal, flushCandidatos, onErro, usuarioId])

  const aoResposta = useCallback(async ({ payload }) => {
    const atual = chamadaRef.current
    const peer = peerRef.current
    if (!atual || atual.chamador_id !== usuarioId || !peer || !payload?.sdp) return

    try {
      await peer.setRemoteDescription(new RTCSessionDescription(payload.sdp))
      await flushCandidatos()
    } catch (error) {
      onErro?.(error.message || 'Não foi possível completar a ligação.')
    }
  }, [flushCandidatos, onErro, usuarioId])

  const aoIce = useCallback(async ({ payload }) => {
    if (!payload?.candidato) return

    const peer = peerRef.current
    if (!peer?.remoteDescription) {
      candidatosPendentesRef.current.push(payload.candidato)
      return
    }

    try {
      await peer.addIceCandidate(new RTCIceCandidate(payload.candidato))
    } catch (error) {
      console.error('Falha ao receber candidato ICE:', error)
    }
  }, [])

  const garantirCanalSinal = useCallback(async (chamadaAlvo) => {
    if (!chamadaAlvo?.id) throw new Error('Ligação inválida.')
    if (canalSinalIdRef.current === chamadaAlvo.id && canalProntoRef.current && canalSinalRef.current) {
      return canalSinalRef.current
    }

    removerCanalSinal()
    await supabase.realtime.setAuth()

    const geracao = ++geracaoCanalRef.current
    const canal = supabase
      .channel(`chamada:${chamadaAlvo.id}`, {
        config: { private: true, broadcast: { ack: true } },
      })
      .on('broadcast', { event: 'pronto' }, aoPronto)
      .on('broadcast', { event: 'oferta' }, aoOferta)
      .on('broadcast', { event: 'resposta' }, aoResposta)
      .on('broadcast', { event: 'ice' }, aoIce)

    canalSinalRef.current = canal
    canalSinalIdRef.current = chamadaAlvo.id

    return new Promise((resolve, reject) => {
      canal.subscribe((status, error) => {
        if (geracao !== geracaoCanalRef.current) return

        if (status === 'SUBSCRIBED') {
          canalProntoRef.current = true
          resolve(canal)
          return
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          canalProntoRef.current = false
          reject(error || new Error('Não foi possível abrir o canal da ligação.'))
        }
      })
    })
  }, [aoIce, aoOferta, aoPronto, aoResposta, removerCanalSinal])

  const prepararMicrofone = useCallback(async () => {
    if (streamLocalRef.current) return streamLocalRef.current

    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
      throw new Error('Este navegador não oferece suporte à ligação de voz.')
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })

    streamLocalRef.current = stream
    return stream
  }, [])

  const iniciarChamada = useCallback(async (conversa) => {
    if (!conversa?.id || !conversa.outroId || chamadaAtiva(chamadaRef.current) || preparando) return false

    setPreparando(true)
    setRelayDisponivel(false)

    try {
      await prepararMicrofone()

      const { data: ativa, error: buscaError } = await supabase
        .from('chamadas')
        .select('id')
        .in('estado', ['chamando', 'aceita'])
        .limit(1)
        .maybeSingle()

      if (buscaError) throw buscaError
      if (ativa) throw new Error('Você já está em outra ligação.')

      const { data, error } = await supabase
        .from('chamadas')
        .insert({
          conversa_id: conversa.id,
          chamador_id: usuarioId,
          destinatario_id: conversa.outroId,
          estado: 'chamando',
        })
        .select('id,conversa_id,chamador_id,destinatario_id,estado,criada_em,atendida_em,encerrada_em')
        .single()

      if (error) throw error

      definirChamada(data)
      await garantirCanalSinal(data)

      clearTimeout(timeoutChamadaRef.current)
      timeoutChamadaRef.current = setTimeout(async () => {
        const atual = chamadaRef.current
        if (!atual || atual.id !== data.id || atual.estado !== 'chamando') return

        try {
          await atualizarEstado('perdida', atual)
        } catch (error) {
          console.error('Falha ao encerrar chamada não atendida:', error)
        }
      }, TEMPO_CHAMANDO_MS)

      return true
    } catch (error) {
      limparPeer()
      limparMidia()
      onErro?.(
        error?.name === 'NotAllowedError'
          ? 'Permita o acesso ao microfone para fazer ligações.'
          : error.message || 'Não foi possível iniciar a ligação.',
      )
      return false
    } finally {
      setPreparando(false)
    }
  }, [atualizarEstado, definirChamada, garantirCanalSinal, limparMidia, limparPeer, onErro, preparando, prepararMicrofone, usuarioId])

  const aceitarChamada = useCallback(async () => {
    const atual = chamadaRef.current
    if (!atual || atual.estado !== 'chamando' || atual.destinatario_id !== usuarioId || preparando) return

    setPreparando(true)

    try {
      await garantirCanalSinal(atual)
      await prepararMicrofone()
      await criarPeer()

      const aceita = await atualizarEstado('aceita', atual)
      if (!aceita) throw new Error('A ligação não está mais disponível.')

      await enviarSinal('pronto', { usuario_id: usuarioId })
    } catch (error) {
      limparPeer()
      limparMidia()
      onErro?.(
        error?.name === 'NotAllowedError'
          ? 'Permita o acesso ao microfone para atender a ligação.'
          : error.message || 'Não foi possível atender a ligação.',
      )
    } finally {
      setPreparando(false)
    }
  }, [atualizarEstado, criarPeer, enviarSinal, garantirCanalSinal, limparMidia, limparPeer, onErro, preparando, prepararMicrofone, usuarioId])

  const recusarChamada = useCallback(async () => {
    const atual = chamadaRef.current
    if (!atual || atual.estado !== 'chamando' || atual.destinatario_id !== usuarioId) return

    try {
      await atualizarEstado('recusada', atual)
    } catch (error) {
      onErro?.(error.message || 'Não foi possível recusar a ligação.')
    }
  }, [atualizarEstado, onErro, usuarioId])

  const desligarChamada = useCallback(async () => {
    const atual = chamadaRef.current
    if (!atual) return

    try {
      if (atual.estado === 'aceita') {
        await atualizarEstado('encerrada', atual)
      } else if (atual.estado === 'chamando' && atual.chamador_id === usuarioId) {
        await atualizarEstado('cancelada', atual)
      } else if (atual.estado === 'chamando' && atual.destinatario_id === usuarioId) {
        await atualizarEstado('recusada', atual)
      }
    } catch (error) {
      onErro?.(error.message || 'Não foi possível encerrar a ligação.')
    }
  }, [atualizarEstado, onErro, usuarioId])

  const alternarMudo = useCallback(() => {
    const stream = streamLocalRef.current
    if (!stream) return

    const novoMutado = !mutado
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !novoMutado
    })
    setMutado(novoMutado)
  }, [mutado])

  useEffect(() => {
    if (!usuarioId) return undefined

    let cancelado = false

    async function carregarAtiva() {
      const { data, error } = await supabase
        .from('chamadas')
        .select('id,conversa_id,chamador_id,destinatario_id,estado,criada_em,atendida_em,encerrada_em')
        .in('estado', ['chamando', 'aceita'])
        .order('criada_em', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (cancelado) return
      if (error) {
        onErro?.(error.message || 'Não foi possível verificar as ligações.')
        return
      }
      if (!data) return

      if (data.estado === 'chamando' && Date.now() - new Date(data.criada_em).getTime() > 45_000) {
        try {
          await atualizarEstado('perdida', data)
        } catch {
          definirChamada(data)
        }
        return
      }

      definirChamada(data)
      garantirCanalSinal(data).catch((erro) => onErro?.(erro.message || 'Não foi possível preparar a ligação.'))
    }

    carregarAtiva()

    const canal = supabase
      .channel(`chamadas:${usuarioId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chamadas' }, (evento) => {
        const proxima = evento.new
        if (!proxima?.id) return

        const atual = chamadaRef.current
        if (chamadaAtiva(proxima)) {
          if (!atual || atual.id === proxima.id || !chamadaAtiva(atual)) {
            definirChamada(proxima)
            garantirCanalSinal(proxima).catch((erro) => onErro?.(erro.message || 'Não foi possível preparar a ligação.'))
          }
          return
        }

        if (atual?.id === proxima.id) definirChamada(proxima)
      })
      .subscribe()

    return () => {
      cancelado = true
      supabase.removeChannel(canal)
    }
  }, [atualizarEstado, definirChamada, garantirCanalSinal, onErro, usuarioId])

  useEffect(() => {
    clearTimeout(timeoutChamadaRef.current)

    if (!chamada) return undefined

    if (chamada.estado === 'chamando' && chamada.chamador_id === usuarioId) {
      const restante = Math.max(0, TEMPO_CHAMANDO_MS - (Date.now() - new Date(chamada.criada_em).getTime()))
      timeoutChamadaRef.current = setTimeout(async () => {
        const atual = chamadaRef.current
        if (!atual || atual.estado !== 'chamando') return

        try {
          await atualizarEstado('perdida', atual)
        } catch (error) {
          console.error('Falha ao encerrar chamada não atendida:', error)
        }
      }, restante)
    }

    if (chamada.estado === 'aceita') {
      clearTimeout(timeoutChamadaRef.current)
      const inicio = new Date(chamada.atendida_em || Date.now()).getTime()

      const atualizarDuracao = () => setDuracao(Math.max(0, Math.floor((Date.now() - inicio) / 1000)))
      atualizarDuracao()
      clearInterval(timerDuracaoRef.current)
      timerDuracaoRef.current = setInterval(atualizarDuracao, 1000)
    } else {
      clearInterval(timerDuracaoRef.current)
      timerDuracaoRef.current = null
      setDuracao(0)
    }

    if (!chamadaAtiva(chamada)) {
      limparLigacaoLocal()
      const timer = setTimeout(() => definirChamada(null), 450)
      return () => clearTimeout(timer)
    }

    return undefined
  }, [atualizarEstado, chamada, definirChamada, limparLigacaoLocal, usuarioId])

  useEffect(() => {
    return () => {
      clearTimeout(timeoutChamadaRef.current)
      clearTimeout(timeoutDesconexaoRef.current)
      clearInterval(timerDuracaoRef.current)
      limparPeer()
      limparMidia()
      removerCanalSinal()
    }
  }, [limparMidia, limparPeer, removerCanalSinal])

  return {
    chamada,
    preparando,
    conectando,
    mutado,
    duracao,
    duracaoFormatada: formatarDuracao(duracao),
    relayDisponivel,
    remoteAudioRef,
    iniciarChamada,
    aceitarChamada,
    recusarChamada,
    desligarChamada,
    alternarMudo,
  }
}

export function CallOverlay({
  chamada,
  usuarioId,
  nomeOutro,
  preparando,
  conectando,
  mutado,
  duracaoFormatada,
  relayDisponivel,
  remoteAudioRef,
  onAceitar,
  onRecusar,
  onDesligar,
  onMudo,
}) {
  if (!chamada) return null

  const recebendo = chamada.estado === 'chamando' && chamada.destinatario_id === usuarioId
  const chamando = chamada.estado === 'chamando' && chamada.chamador_id === usuarioId
  const ativa = chamada.estado === 'aceita'

  let status = 'Ligação de voz'
  if (recebendo) status = 'Ligação recebida'
  if (chamando) status = 'Chamando…'
  if (ativa && conectando) status = 'Conectando…'
  if (ativa && !conectando) status = duracaoFormatada

  return (
    <div className="call-backdrop" role="presentation">
      <section className="call-card" role="dialog" aria-modal="true" aria-label="Ligação de voz">
        <audio ref={remoteAudioRef} autoPlay playsInline />

        <div className="call-avatar">{obterIniciais(nomeOutro)}</div>
        <h2>{nomeOutro || 'Usuário'}</h2>
        <p className="call-status" aria-live="polite">{preparando ? 'Preparando…' : status}</p>

        {ativa && (
          <span className={`call-network ${relayDisponivel ? 'relay' : ''}`}>
            {relayDisponivel ? 'Conexão protegida por relay quando necessário' : 'Conexão direta disponível'}
          </span>
        )}

        <div className="call-actions">
          {recebendo ? (
            <>
              <button className="call-action danger" type="button" onClick={onRecusar} disabled={preparando} aria-label="Recusar ligação">
                <span>✕</span>
                <small>Recusar</small>
              </button>
              <button className="call-action accept" type="button" onClick={onAceitar} disabled={preparando} aria-label="Atender ligação">
                <span>●</span>
                <small>Atender</small>
              </button>
            </>
          ) : chamando ? (
            <button className="call-action danger" type="button" onClick={onDesligar} disabled={preparando} aria-label="Cancelar ligação">
              <span>✕</span>
              <small>Cancelar</small>
            </button>
          ) : ativa ? (
            <>
              <button className={`call-action neutral ${mutado ? 'active' : ''}`} type="button" onClick={onMudo} aria-label={mutado ? 'Ativar microfone' : 'Silenciar microfone'}>
                <span>{mutado ? '⌁' : '●'}</span>
                <small>{mutado ? 'Ativar' : 'Mudo'}</small>
              </button>
              <button className="call-action danger" type="button" onClick={onDesligar} aria-label="Desligar">
                <span>✕</span>
                <small>Desligar</small>
              </button>
            </>
          ) : null}
        </div>
      </section>
    </div>
  )
}
