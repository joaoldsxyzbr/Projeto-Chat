import fixWebmDuration from 'fix-webm-duration'
import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

const BUCKET_AUDIO = 'audios-chat'
const LIMITE_GRAVACAO_SEGUNDOS = 600

function extensaoParaMime(tipo = '') {
  if (tipo.includes('ogg')) return 'ogg'
  if (tipo.includes('mp4')) return 'm4a'
  if (tipo.includes('mpeg')) return 'mp3'
  if (tipo.includes('wav')) return 'wav'
  return 'webm'
}

function formatarDuracao(segundos = 0) {
  const total = Math.max(0, Math.floor(segundos))
  const minutos = Math.floor(total / 60)
  const resto = total % 60
  return `${minutos}:${String(resto).padStart(2, '0')}`
}

function arquivoWebm(caminho = '', tipo = '') {
  return tipo.includes('webm') || caminho.toLowerCase().endsWith('.webm')
}

async function corrigirWebm(blob, duracaoMs) {
  if (!blob?.size || !duracaoMs) return blob
  return fixWebmDuration(blob, duracaoMs, { logger: false })
}

export function AudioMessage({ caminho, duracao, tipo = '' }) {
  const [url, setUrl] = useState('')
  const [erro, setErro] = useState('')

  useEffect(() => {
    let ativo = true
    let objectUrl = ''

    async function carregar() {
      if (!caminho) return

      setErro('')
      setUrl('')

      if (arquivoWebm(caminho, tipo)) {
        const { data, error } = await supabase.storage
          .from(BUCKET_AUDIO)
          .download(caminho)

        if (!ativo) return

        if (error) {
          setErro('Não foi possível carregar o áudio.')
          return
        }

        try {
          const blobCorrigido = await corrigirWebm(data, Math.max(1, Number(duracao) || 1) * 1000)
          if (!ativo) return

          objectUrl = URL.createObjectURL(blobCorrigido)
          setUrl(objectUrl)
        } catch {
          if (ativo) setErro('Não foi possível preparar o áudio para reprodução.')
        }

        return
      }

      const { data, error } = await supabase.storage
        .from(BUCKET_AUDIO)
        .createSignedUrl(caminho, 21600)

      if (!ativo) return

      if (error) {
        setErro('Não foi possível carregar o áudio.')
        return
      }

      setUrl(data.signedUrl)
    }

    carregar()

    return () => {
      ativo = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [caminho, duracao, tipo])

  if (erro) return <span className="audio-message-status audio-message-error">{erro}</span>

  return (
    <div className="audio-message">
      {url ? <audio controls preload="metadata" src={url} /> : <span className="audio-message-status">Carregando áudio...</span>}
      {duracao ? <span className="audio-message-status">{formatarDuracao(duracao)}</span> : null}
    </div>
  )
}

export function useAudioRecorder({ conversaId, usuarioId, onEnviado, onErro }) {
  const [gravando, setGravando] = useState(false)
  const [enviandoAudio, setEnviandoAudio] = useState(false)
  const [tempoGravacao, setTempoGravacao] = useState(0)

  const gravadorRef = useRef(null)
  const fluxoRef = useRef(null)
  const partesRef = useRef([])
  const inicioRef = useRef(0)
  const timerRef = useRef(null)
  const acaoRef = useRef('cancelar')
  const conversaRef = useRef(conversaId)

  useEffect(() => {
    conversaRef.current = conversaId
  }, [conversaId])

  function liberarMicrofone() {
    clearInterval(timerRef.current)
    timerRef.current = null
    fluxoRef.current?.getTracks().forEach((track) => track.stop())
    fluxoRef.current = null
  }

  async function enviarBlob(blob, tipo, duracao, duracaoMs, conversaDaGravacao) {
    if (!conversaDaGravacao || !usuarioId) return

    setEnviandoAudio(true)
    const extensao = extensaoParaMime(tipo)
    const identificador = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const caminho = `${conversaDaGravacao}/${usuarioId}/${identificador}.${extensao}`

    try {
      const blobParaUpload = arquivoWebm('', tipo)
        ? await corrigirWebm(blob, duracaoMs)
        : blob

      const { error: erroUpload } = await supabase.storage
        .from(BUCKET_AUDIO)
        .upload(caminho, blobParaUpload, {
          contentType: tipo,
          cacheControl: '3600',
          upsert: false,
        })

      if (erroUpload) throw erroUpload

      const { error: erroMensagem } = await supabase.from('mensagens').insert({
        conversa_id: conversaDaGravacao,
        remetente_id: usuarioId,
        conteudo: 'Mensagem de áudio',
        tipo: 'audio',
        arquivo_caminho: caminho,
        arquivo_tipo: tipo,
        duracao_segundos: duracao,
      })

      if (erroMensagem) {
        await supabase.storage.from(BUCKET_AUDIO).remove([caminho]).catch(() => {})
        throw erroMensagem
      }

      await onEnviado?.()
    } catch (error) {
      onErro?.(error.message || 'Não foi possível enviar o áudio.')
    } finally {
      setEnviandoAudio(false)
    }
  }

  async function iniciarGravacao() {
    if (gravando || enviandoAudio || !conversaId) return

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      onErro?.('Este navegador não oferece suporte à gravação de áudio.')
      return
    }

    try {
      const fluxo = await navigator.mediaDevices.getUserMedia({ audio: true })
      fluxoRef.current = fluxo

      const candidatos = [
        'audio/mp4;codecs=mp4a.40.2',
        'audio/mp4; codecs=mp4a.40.2',
        'audio/mp4;codecs=opus',
        'audio/mp4; codecs=opus',
        'audio/mp4',
        'audio/webm;codecs=opus',
        'audio/webm; codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
      ]
      const mimeType = candidatos.find((valor) => MediaRecorder.isTypeSupported?.(valor))
      const gravador = mimeType ? new MediaRecorder(fluxo, { mimeType }) : new MediaRecorder(fluxo)
      const conversaDaGravacao = conversaId

      gravadorRef.current = gravador
      partesRef.current = []
      acaoRef.current = 'cancelar'
      inicioRef.current = Date.now()
      setTempoGravacao(0)

      gravador.addEventListener('dataavailable', (event) => {
        if (event.data?.size) partesRef.current.push(event.data)
      })

      gravador.addEventListener('stop', () => {
        const acao = acaoRef.current
        const duracaoMs = Math.max(
          1,
          Math.min(LIMITE_GRAVACAO_SEGUNDOS * 1000, Date.now() - inicioRef.current),
        )
        const duracao = Math.max(1, Math.round(duracaoMs / 1000))
        const tipo = gravador.mimeType || partesRef.current[0]?.type || 'audio/webm'
        const blob = new Blob(partesRef.current, { type: tipo })

        liberarMicrofone()
        gravadorRef.current = null
        partesRef.current = []
        setGravando(false)
        setTempoGravacao(0)

        if (acao === 'enviar' && blob.size > 0) {
          enviarBlob(blob, tipo, duracao, duracaoMs, conversaDaGravacao)
        }
      })

      gravador.start()
      setGravando(true)

      timerRef.current = setInterval(() => {
        const segundos = Math.min(LIMITE_GRAVACAO_SEGUNDOS, Math.floor((Date.now() - inicioRef.current) / 1000))
        setTempoGravacao(segundos)

        if (segundos >= LIMITE_GRAVACAO_SEGUNDOS && gravador.state !== 'inactive') {
          acaoRef.current = 'enviar'
          gravador.stop()
        }
      }, 500)
    } catch (error) {
      liberarMicrofone()
      onErro?.(
        error?.name === 'NotAllowedError'
          ? 'Permita o acesso ao microfone para enviar áudio.'
          : error.message || 'Não foi possível iniciar a gravação.',
      )
    }
  }

  function pararGravacao(enviar) {
    const gravador = gravadorRef.current
    if (!gravador || gravador.state === 'inactive') return

    acaoRef.current = enviar ? 'enviar' : 'cancelar'
    gravador.stop()
  }

  useEffect(() => {
    return () => {
      acaoRef.current = 'cancelar'
      clearInterval(timerRef.current)
      if (gravadorRef.current && gravadorRef.current.state !== 'inactive') {
        gravadorRef.current.stop()
      }
      fluxoRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  return {
    gravando,
    enviandoAudio,
    tempoGravacao,
    tempoFormatado: formatarDuracao(tempoGravacao),
    iniciarGravacao,
    enviarGravacao: () => pararGravacao(true),
    cancelarGravacao: () => pararGravacao(false),
  }
}
