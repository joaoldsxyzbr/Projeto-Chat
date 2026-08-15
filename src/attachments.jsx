import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

const BUCKET_ANEXOS = 'anexos-chat'
const DURACAO_URL_ASSINADA_SEGUNDOS = 3600
const MARGEM_CACHE_URL_MS = 2 * 60 * 1000
export const LIMITE_ANEXO_BYTES = 20 * 1024 * 1024

const cacheUrlsAnexos = new Map()

async function obterUrlAnexo(caminho) {
  const agora = Date.now()
  const existente = cacheUrlsAnexos.get(caminho)

  if (existente && existente.expiraEm > agora + MARGEM_CACHE_URL_MS) {
    return existente.url
  }

  const { data, error } = await supabase.storage
    .from(BUCKET_ANEXOS)
    .createSignedUrl(caminho, DURACAO_URL_ASSINADA_SEGUNDOS)

  if (error) throw error

  cacheUrlsAnexos.set(caminho, {
    url: data.signedUrl,
    expiraEm: agora + DURACAO_URL_ASSINADA_SEGUNDOS * 1000,
  })

  return data.signedUrl
}

export function formatarTamanho(bytes = 0) {
  const valor = Number(bytes) || 0
  if (valor < 1024) return `${valor} B`
  if (valor < 1024 * 1024) return `${(valor / 1024).toFixed(valor < 10 * 1024 ? 1 : 0)} KB`
  return `${(valor / (1024 * 1024)).toFixed(valor < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

function extensaoSegura(nome = '') {
  const extensao = nome.split('.').pop()?.toLowerCase() || ''
  return /^[a-z0-9]{1,10}$/.test(extensao) ? `.${extensao}` : ''
}

function nomeSeguro(nome = 'arquivo') {
  const limpo = nome.trim().replace(/[\u0000-\u001f\u007f]/g, '')
  return (limpo || 'arquivo').slice(0, 255)
}

export function AttachmentMessage({ mensagem }) {
  const imagem = mensagem.tipo === 'imagem'
  const [url, setUrl] = useState('')
  const [erro, setErro] = useState('')
  const [baixando, setBaixando] = useState(false)
  const [imagemFalhou, setImagemFalhou] = useState(false)

  useEffect(() => {
    let ativo = true

    async function carregarImagem() {
      if (!imagem || !mensagem.arquivo_caminho) return

      setErro('')
      setImagemFalhou(false)

      try {
        const signedUrl = await obterUrlAnexo(mensagem.arquivo_caminho)
        if (ativo) setUrl(signedUrl)
      } catch {
        if (ativo) setErro('Não foi possível carregar a foto.')
      }
    }

    carregarImagem()
    return () => {
      ativo = false
    }
  }, [imagem, mensagem.arquivo_caminho])

  async function baixar() {
    if (!mensagem.arquivo_caminho || baixando) return

    setBaixando(true)
    setErro('')

    try {
      const { data, error } = await supabase.storage
        .from(BUCKET_ANEXOS)
        .download(mensagem.arquivo_caminho)

      if (error) throw error

      const objectUrl = URL.createObjectURL(data)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = mensagem.arquivo_nome || 'arquivo'
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    } catch {
      setErro('Não foi possível baixar o arquivo.')
    } finally {
      setBaixando(false)
    }
  }

  if (imagem && url && !imagemFalhou) {
    return (
      <div className="attachment-image-message">
        <a href={url} target="_blank" rel="noreferrer" aria-label="Abrir foto">
          <img
            src={url}
            alt={mensagem.arquivo_nome || 'Foto enviada'}
            loading="lazy"
            decoding="async"
            onError={() => setImagemFalhou(true)}
          />
        </a>
        {mensagem.arquivo_tamanho ? (
          <span className="attachment-caption">{formatarTamanho(mensagem.arquivo_tamanho)}</span>
        ) : null}
      </div>
    )
  }

  return (
    <div className="attachment-file-message">
      <div className="attachment-file-icon" aria-hidden="true">{imagem ? '🖼️' : '📄'}</div>
      <div className="attachment-file-info">
        <strong>{mensagem.arquivo_nome || (imagem ? 'Foto' : 'Arquivo')}</strong>
        <span>{mensagem.arquivo_tamanho ? formatarTamanho(mensagem.arquivo_tamanho) : 'Anexo'}</span>
      </div>
      <button type="button" onClick={baixar} disabled={baixando} aria-label="Baixar arquivo">
        {baixando ? '…' : '↓'}
      </button>
      {erro && <span className="attachment-error">{erro}</span>}
    </div>
  )
}

export function AttachmentDraft({ anexo, onCancel }) {
  if (!anexo) return null

  return (
    <div className="attachment-draft">
      {anexo.previewUrl ? (
        <img src={anexo.previewUrl} alt="Prévia da foto" />
      ) : (
        <div className="attachment-draft-icon" aria-hidden="true">📄</div>
      )}
      <div className="attachment-draft-info">
        <strong>{anexo.file.name}</strong>
        <span>{formatarTamanho(anexo.file.size)}</span>
      </div>
      <button type="button" onClick={onCancel} aria-label="Remover anexo">×</button>
    </div>
  )
}

export function useAttachmentUpload({ conversaId, usuarioId, onEnviado, onErro }) {
  const [anexo, setAnexo] = useState(null)
  const [enviandoAnexo, setEnviandoAnexo] = useState(false)
  const previewRef = useRef('')

  function liberarPreview() {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    previewRef.current = ''
  }

  function cancelarAnexo() {
    liberarPreview()
    setAnexo(null)
  }

  function selecionarAnexo(file, tipoSolicitado) {
    if (!file) return false

    if (file.size < 1) {
      onErro?.('O arquivo está vazio.')
      return false
    }

    if (file.size > LIMITE_ANEXO_BYTES) {
      onErro?.('O limite por foto ou arquivo é de 20 MB.')
      return false
    }

    const nome = nomeSeguro(file.name)
    if (tipoSolicitado === 'imagem') {
      if (!file.type?.startsWith('image/') || file.type.toLowerCase() === 'image/svg+xml') {
        onErro?.('Escolha uma foto em um formato de imagem compatível.')
        return false
      }
    }

    liberarPreview()
    const previewUrl = tipoSolicitado === 'imagem' ? URL.createObjectURL(file) : ''
    previewRef.current = previewUrl
    setAnexo({
      file,
      nome,
      tipo: tipoSolicitado === 'imagem' ? 'imagem' : 'arquivo',
      previewUrl,
    })
    return true
  }

  async function enviarAnexo() {
    if (!anexo || !conversaId || !usuarioId || enviandoAnexo) return false

    const { file, nome, tipo } = anexo
    const identificador = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const caminho = `${conversaId}/${usuarioId}/${identificador}${extensaoSegura(nome)}`
    const mime = file.type || 'application/octet-stream'

    setEnviandoAnexo(true)

    try {
      const { error: erroUpload } = await supabase.storage
        .from(BUCKET_ANEXOS)
        .upload(caminho, file, {
          contentType: mime,
          cacheControl: '3600',
          upsert: false,
        })

      if (erroUpload) throw erroUpload

      const { error: erroMensagem } = await supabase.from('mensagens').insert({
        conversa_id: conversaId,
        remetente_id: usuarioId,
        conteudo: tipo === 'imagem' ? 'Foto' : `Arquivo: ${nome}`,
        tipo,
        arquivo_caminho: caminho,
        arquivo_tipo: mime,
        arquivo_nome: nome,
        arquivo_tamanho: file.size,
      })

      if (erroMensagem) {
        await supabase.storage.from(BUCKET_ANEXOS).remove([caminho]).catch(() => {})
        throw erroMensagem
      }

      cancelarAnexo()
      await onEnviado?.()
      return true
    } catch (error) {
      onErro?.(error.message || 'Não foi possível enviar o anexo.')
      return false
    } finally {
      setEnviandoAnexo(false)
    }
  }

  useEffect(() => {
    return () => liberarPreview()
  }, [])

  return {
    anexo,
    enviandoAnexo,
    selecionarAnexo,
    cancelarAnexo,
    enviarAnexo,
  }
}
