import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

const BUCKET_AUDIO = 'audios-chat'
const LIMITE_MP4_SEGUNDOS = 600
const LIMITE_WAV_SEGUNDOS = 300
const TAXA_WAV = 16000
const VELOCIDADES = [1, 1.5, 2]

let audioAtivo = null

function extensaoParaMime(tipo = '') {
  if (tipo.includes('mp4')) return 'm4a'
  if (tipo.includes('wav')) return 'wav'
  if (tipo.includes('ogg')) return 'ogg'
  if (tipo.includes('mpeg')) return 'mp3'
  return 'webm'
}

function formatarDuracao(segundos = 0) {
  const total = Math.max(0, Math.floor(Number(segundos) || 0))
  const minutos = Math.floor(total / 60)
  const resto = total % 60
  return `${minutos}:${String(resto).padStart(2, '0')}`
}

function escreverTexto(view, offset, texto) {
  for (let i = 0; i < texto.length; i += 1) view.setUint8(offset + i, texto.charCodeAt(i))
}

function reduzirAmostras(amostras, taxaOrigem, taxaDestino) {
  if (taxaOrigem <= taxaDestino) return { amostras, taxa: taxaOrigem }

  const proporcao = taxaOrigem / taxaDestino
  const tamanho = Math.floor(amostras.length / proporcao)
  const saida = new Float32Array(tamanho)

  for (let i = 0; i < tamanho; i += 1) {
    const inicio = Math.floor(i * proporcao)
    const fim = Math.min(amostras.length, Math.floor((i + 1) * proporcao))
    let soma = 0
    let quantidade = 0

    for (let j = inicio; j < fim; j += 1) {
      soma += amostras[j]
      quantidade += 1
    }

    saida[i] = quantidade ? soma / quantidade : 0
  }

  return { amostras: saida, taxa: taxaDestino }
}

function criarWav(partes, taxaOrigem) {
  const total = partes.reduce((soma, parte) => soma + parte.length, 0)
  const unidas = new Float32Array(total)
  let offset = 0

  partes.forEach((parte) => {
    unidas.set(parte, offset)
    offset += parte.length
  })

  const { amostras, taxa } = reduzirAmostras(unidas, taxaOrigem, TAXA_WAV)
  const buffer = new ArrayBuffer(44 + amostras.length * 2)
  const view = new DataView(buffer)

  escreverTexto(view, 0, 'RIFF')
  view.setUint32(4, 36 + amostras.length * 2, true)
  escreverTexto(view, 8, 'WAVE')
  escreverTexto(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, taxa, true)
  view.setUint32(28, taxa * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  escreverTexto(view, 36, 'data')
  view.setUint32(40, amostras.length * 2, true)

  let posicao = 44
  for (let i = 0; i < amostras.length; i += 1) {
    const valor = Math.max(-1, Math.min(1, amostras[i]))
    view.setInt16(posicao, valor < 0 ? valor * 0x8000 : valor * 0x7fff, true)
    posicao += 2
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

function mimeMp4Suportado() {
  if (!window.MediaRecorder?.isTypeSupported) return ''

  return [
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4; codecs=mp4a.40.2',
    'audio/mp4',
  ].find((tipo) => MediaRecorder.isTypeSupported(tipo)) || ''
}

export function AudioMessage({ caminho, duracao }) {
  const [url, setUrl] = useState('')
  const [erro, setErro] = useState('')
  const [tocando, setTocando] = useState(false)
  const [tempoAtual, setTempoAtual] = useState(0)
  const [duracaoReal, setDuracaoReal] = useState(Number(duracao) || 0)
  const [velocidade, setVelocidade] = useState(1)
  const audioRef = useRef(null)

  useEffect(() => {
    let ativo = true

    async function carregar() {
      if (!caminho) return

      setErro('')
      setUrl('')
      setTocando(false)
      setTempoAtual(0)
      setDuracaoReal(Number(duracao) || 0)

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
    }
  }, [caminho, duracao])

  useEffect(() => {
    const audio = audioRef.current

    return () => {
      audio?.pause()
      if (audioAtivo === audio) audioAtivo = null
    }
  }, [url])

  function atualizarDuracao() {
    const audio = audioRef.current
    if (!audio) return

    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      setDuracaoReal(audio.duration)
    }
  }

  async function alternarReproducao() {
    const audio = audioRef.current
    if (!audio || !url) return

    setErro('')

    if (!audio.paused) {
      audio.pause()
      return
    }

    if (audioAtivo && audioAtivo !== audio) audioAtivo.pause()
    if (duracaoReal > 0 && audio.currentTime >= duracaoReal - 0.05) audio.currentTime = 0

    audioAtivo = audio

    try {
      await audio.play()
    } catch {
      if (audioAtivo === audio) audioAtivo = null
      setErro('Não foi possível reproduzir este áudio.')
    }
  }

  function alterarProgresso(event) {
    const audio = audioRef.current
    if (!audio) return

    const novoTempo = Number(event.target.value)
    audio.currentTime = novoTempo
    setTempoAtual(novoTempo)
  }

  function alternarVelocidade() {
    const indiceAtual = VELOCIDADES.indexOf(velocidade)
    const proxima = VELOCIDADES[(indiceAtual + 1) % VELOCIDADES.length]
    setVelocidade(proxima)
    if (audioRef.current) audioRef.current.playbackRate = proxima
  }

  if (erro && !url) return <span className="audio-message-status audio-message-error">{erro}</span>

  const limite = Math.max(1, duracaoReal || Number(duracao) || 1)

  return (
    <div className="audio-message">
      <audio
        ref={audioRef}
        className="audio-native"
        preload="metadata"
        src={url || undefined}
        onLoadedMetadata={atualizarDuracao}
        onDurationChange={atualizarDuracao}
        onTimeUpdate={(event) => setTempoAtual(event.currentTarget.currentTime)}
        onPlay={() => setTocando(true)}
        onPause={() => setTocando(false)}
        onEnded={() => {
          setTocando(false)
          setTempoAtual(0)
          if (audioAtivo === audioRef.current) audioAtivo = null
        }}
        onError={() => url && setErro('Este áudio não pôde ser reproduzido.')}
      />

      <button
        className="audio-play-button"
        type="button"
        onClick={alternarReproducao}
        disabled={!url}
        aria-label={tocando ? 'Pausar áudio' : 'Reproduzir áudio'}
      >
        {url ? (tocando ? '❚❚' : '▶') : '…'}
      </button>

      <div className="audio-track">
        <input
          type="range"
          min="0"
          max={limite}
          step="0.1"
          value={Math.min(tempoAtual, limite)}
          onChange={alterarProgresso}
          disabled={!url}
          aria-label="Progresso do áudio"
        />
        <div className="audio-time">
          <span>{formatarDuracao(tempoAtual)}</span>
          <span>{formatarDuracao(limite)}</span>
        </div>
      </div>

      <button
        className="audio-speed-button"
        type="button"
        onClick={alternarVelocidade}
        disabled={!url}
        aria-label={`Velocidade ${String(velocidade).replace('.', ',')} vezes`}
      >
        {String(velocidade).replace('.', ',')}×
      </button>

      {erro && <span className="audio-message-status audio-message-error audio-message-error-inline">{erro}</span>}
    </div>
  )
}

export function useAudioRecorder({ conversaId, usuarioId, onEnviado, onErro }) {
  const [gravando, setGravando] = useState(false)
  const [enviandoAudio, setEnviandoAudio] = useState(false)
  const [tempoGravacao, setTempoGravacao] = useState(0)

  const gravadorRef = useRef(null)
  const wavRef = useRef(null)
  const fluxoRef = useRef(null)
  const partesRef = useRef([])
  const inicioRef = useRef(0)
  const timerRef = useRef(null)
  const limiteRef = useRef(LIMITE_MP4_SEGUNDOS)
  const acaoRef = useRef('cancelar')

  function limparTimer() {
    clearInterval(timerRef.current)
    timerRef.current = null
  }

  function pararFluxo() {
    fluxoRef.current?.getTracks().forEach((track) => track.stop())
    fluxoRef.current = null
  }

  function limparWav() {
    const atual = wavRef.current
    if (!atual) return

    atual.processador.onaudioprocess = null
    atual.fonte.disconnect()
    atual.processador.disconnect()
    atual.silencio.disconnect()
    atual.contexto.close().catch(() => {})
    wavRef.current = null
  }

  function encerrarCaptura() {
    limparTimer()
    limparWav()
    pararFluxo()
    gravadorRef.current = null
    partesRef.current = []
    setGravando(false)
    setTempoGravacao(0)
  }

  async function enviarBlob(blob, tipo, duracao, conversaDaGravacao) {
    if (!conversaDaGravacao || !usuarioId || !blob?.size) return

    setEnviandoAudio(true)
    const extensao = extensaoParaMime(tipo)
    const identificador = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const caminho = `${conversaDaGravacao}/${usuarioId}/${identificador}.${extensao}`

    try {
      const { error: erroUpload } = await supabase.storage
        .from(BUCKET_AUDIO)
        .upload(caminho, blob, {
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

  function duracaoAtual() {
    return Math.max(1, Math.round((Date.now() - inicioRef.current) / 1000))
  }

  function finalizarWav(enviar) {
    const atual = wavRef.current
    if (!atual) return

    const partes = atual.partes
    const taxa = atual.contexto.sampleRate
    const conversaDaGravacao = atual.conversaId
    const duracao = Math.min(LIMITE_WAV_SEGUNDOS, duracaoAtual())

    encerrarCaptura()

    if (!enviar || !partes.length) return

    try {
      const blob = criarWav(partes, taxa)
      enviarBlob(blob, 'audio/wav', duracao, conversaDaGravacao)
    } catch (error) {
      onErro?.(error.message || 'Não foi possível preparar o áudio.')
    }
  }

  function iniciarTimer() {
    timerRef.current = setInterval(() => {
      const segundos = Math.min(limiteRef.current, Math.floor((Date.now() - inicioRef.current) / 1000))
      setTempoGravacao(segundos)

      if (segundos >= limiteRef.current) pararGravacao(true)
    }, 500)
  }

  async function iniciarGravacao() {
    if (gravando || enviandoAudio || !conversaId) return

    if (!navigator.mediaDevices?.getUserMedia) {
      onErro?.('Este navegador não oferece suporte à gravação de áudio.')
      return
    }

    try {
      const fluxo = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })

      fluxoRef.current = fluxo
      inicioRef.current = Date.now()
      setTempoGravacao(0)

      const mimeMp4 = mimeMp4Suportado()

      if (mimeMp4) {
        limiteRef.current = LIMITE_MP4_SEGUNDOS
        const gravador = new MediaRecorder(fluxo, { mimeType: mimeMp4 })
        const conversaDaGravacao = conversaId

        gravadorRef.current = gravador
        partesRef.current = []
        acaoRef.current = 'cancelar'

        gravador.addEventListener('dataavailable', (event) => {
          if (event.data?.size) partesRef.current.push(event.data)
        })

        gravador.addEventListener('stop', () => {
          const enviar = acaoRef.current === 'enviar'
          const tipo = gravador.mimeType || mimeMp4
          const blob = new Blob(partesRef.current, { type: tipo })
          const duracao = Math.min(LIMITE_MP4_SEGUNDOS, duracaoAtual())

          encerrarCaptura()
          if (enviar && blob.size) enviarBlob(blob, tipo, duracao, conversaDaGravacao)
        })

        gravador.start()
      } else {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext
        if (!AudioContextClass) throw new Error('Este navegador não oferece um formato de áudio compatível.')

        limiteRef.current = LIMITE_WAV_SEGUNDOS

        let contexto
        try {
          contexto = new AudioContextClass({ sampleRate: TAXA_WAV })
        } catch {
          contexto = new AudioContextClass()
        }

        await contexto.resume()

        const fonte = contexto.createMediaStreamSource(fluxo)
        const processador = contexto.createScriptProcessor(4096, 1, 1)
        const silencio = contexto.createGain()
        silencio.gain.value = 0

        const partes = []
        processador.onaudioprocess = (event) => {
          partes.push(new Float32Array(event.inputBuffer.getChannelData(0)))
        }

        fonte.connect(processador)
        processador.connect(silencio)
        silencio.connect(contexto.destination)

        wavRef.current = {
          contexto,
          fonte,
          processador,
          silencio,
          partes,
          conversaId,
        }
      }

      setGravando(true)
      iniciarTimer()
    } catch (error) {
      limparTimer()
      limparWav()
      pararFluxo()
      onErro?.(
        error?.name === 'NotAllowedError'
          ? 'Permita o acesso ao microfone para enviar áudio.'
          : error.message || 'Não foi possível iniciar a gravação.',
      )
    }
  }

  function pararGravacao(enviar) {
    if (wavRef.current) {
      finalizarWav(enviar)
      return
    }

    const gravador = gravadorRef.current
    if (!gravador || gravador.state === 'inactive') return

    acaoRef.current = enviar ? 'enviar' : 'cancelar'
    gravador.stop()
  }

  useEffect(() => {
    return () => {
      acaoRef.current = 'cancelar'
      limparTimer()

      if (gravadorRef.current && gravadorRef.current.state !== 'inactive') {
        gravadorRef.current.stop()
      }

      limparWav()
      pararFluxo()
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
