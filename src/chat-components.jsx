import { memo, useEffect, useRef, useState } from 'react'
import { AudioMessage } from './audio'
import { AttachmentDraft, AttachmentMessage } from './attachments'

function formatarHorario(data) {
  if (!data) return ''
  return new Date(data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

const Mensagem = memo(function Mensagem({ mensagem, usuarioId }) {
  const propria = mensagem.remetente_id === usuarioId
  const lida = Boolean(mensagem.lida_em)
  const entregue = lida || Boolean(mensagem.entregue_em)
  const recibo = lida ? '✓✓✓' : entregue ? '✓✓' : '✓'
  const reciboRotulo = lida ? 'Mensagem lida' : entregue ? 'Mensagem entregue' : 'Mensagem enviada'

  return (
    <div className={`message-row ${propria ? 'mine' : ''}`}>
      <div className="message-bubble">
        {mensagem.tipo === 'audio' ? (
          <AudioMessage caminho={mensagem.arquivo_caminho} duracao={mensagem.duracao_segundos} />
        ) : mensagem.tipo === 'imagem' || mensagem.tipo === 'arquivo' ? (
          <AttachmentMessage mensagem={mensagem} />
        ) : (
          <p>{mensagem.conteudo}</p>
        )}
        <div className="message-meta">
          <time>{formatarHorario(mensagem.criada_em)}</time>
          {propria && (
            <span
              className={`read-receipt ${lida ? 'read' : entregue ? 'delivered' : ''}`}
              title={lida ? 'Lida' : entregue ? 'Entregue' : 'Enviada'}
              aria-label={reciboRotulo}
            >
              {recibo}
            </span>
          )}
        </div>
      </div>
    </div>
  )
})

export const MessageList = memo(function MessageList({
  mensagens,
  usuarioId,
  nome,
  mensagensAreaRef,
  fimMensagensRef,
  seguirFimRef,
  scrollFrameRef,
}) {
  function acompanharScroll() {
    if (scrollFrameRef.current !== null) return

    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null
      const area = mensagensAreaRef.current
      if (!area) return

      const distanciaDoFim = area.scrollHeight - area.scrollTop - area.clientHeight
      seguirFimRef.current = distanciaDoFim < 120
    })
  }

  return (
    <div className="messages-area" ref={mensagensAreaRef} onScroll={acompanharScroll}>
      <div className="messages-column">
        {mensagens.length === 0 && (
          <div className="conversation-start">Envie a primeira mensagem para {nome}.</div>
        )}

        {mensagens.map((mensagem) => (
          <Mensagem key={mensagem.id} mensagem={mensagem} usuarioId={usuarioId} />
        ))}
        <div ref={fimMensagensRef} />
      </div>
    </div>
  )
})

export function Composer({
  conversaId,
  anexo,
  enviando,
  enviandoAudio,
  enviandoAnexo,
  gravando,
  tempoFormatado,
  selecionarAnexo,
  cancelarAnexo,
  enviarAnexo,
  iniciarGravacao,
  enviarGravacao,
  cancelarGravacao,
  onAlterarTexto,
  onEnviarTexto,
  onErro,
}) {
  const [texto, setTexto] = useState('')
  const [menuAnexoAberto, setMenuAnexoAberto] = useState(false)
  const fotoInputRef = useRef(null)
  const arquivoInputRef = useRef(null)
  const enviandoAlgo = enviando || enviandoAudio || enviandoAnexo

  useEffect(() => {
    setMenuAnexoAberto(false)
  }, [conversaId])

  useEffect(() => {
    const fecharMenu = () => setMenuAnexoAberto(false)
    window.addEventListener('popstate', fecharMenu)
    return () => window.removeEventListener('popstate', fecharMenu)
  }, [])

  function alterarTexto(valor) {
    setTexto(valor)
    onAlterarTexto(valor)
  }

  function aoTeclarMensagem(event) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    if (window.matchMedia('(max-width: 740px)').matches) return

    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  function escolherAnexo(event, tipo) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (selecionarAnexo(file, tipo)) {
      setMenuAnexoAberto(false)
      onErro('')
    }
  }

  async function enviar(event) {
    event.preventDefault()

    if (anexo) {
      if (!conversaId || enviandoAlgo || gravando) return
      onErro('')
      await enviarAnexo()
      return
    }

    const conteudo = texto.trim()
    if (!conteudo || !conversaId || enviandoAlgo || gravando) return

    const enviado = await onEnviarTexto(conteudo)
    if (enviado) {
      setTexto('')
      onAlterarTexto('')
    }
  }

  return (
    <form className="composer composer-simple composer-with-audio" onSubmit={enviar} aria-busy={enviandoAlgo}>
      {gravando ? (
        <div className="audio-recording-status" aria-live="polite">
          <span className="audio-recording-dot" aria-hidden="true" />
          <span>Gravando {tempoFormatado}</span>
        </div>
      ) : anexo ? (
        <AttachmentDraft anexo={anexo} onCancel={cancelarAnexo} />
      ) : (
        <textarea
          value={texto}
          onChange={(event) => alterarTexto(event.target.value)}
          onKeyDown={aoTeclarMensagem}
          placeholder="Digite uma mensagem"
          aria-label="Mensagem"
          rows="1"
          maxLength={4000}
          disabled={enviandoAudio || enviandoAnexo}
        />
      )}

      {!gravando && (
        <div className="attachment-menu-wrap">
          <button
            className="attachment-button"
            type="button"
            onClick={() => setMenuAnexoAberto((aberto) => !aberto)}
            aria-label="Anexar foto ou arquivo"
            aria-expanded={menuAnexoAberto}
            disabled={enviandoAlgo || Boolean(texto.trim()) || Boolean(anexo)}
          >
            📎
          </button>
          {menuAnexoAberto && (
            <div className="attachment-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => fotoInputRef.current?.click()}>
                <span aria-hidden="true">🖼️</span> Foto
              </button>
              <button type="button" role="menuitem" onClick={() => arquivoInputRef.current?.click()}>
                <span aria-hidden="true">📄</span> Arquivo
              </button>
            </div>
          )}
          <input
            ref={fotoInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => escolherAnexo(event, 'imagem')}
          />
          <input
            ref={arquivoInputRef}
            type="file"
            hidden
            onChange={(event) => escolherAnexo(event, 'arquivo')}
          />
        </div>
      )}

      {gravando ? (
        <button className="audio-cancel-button" type="button" onClick={cancelarGravacao} aria-label="Cancelar gravação">×</button>
      ) : (
        <button
          className="audio-record-button"
          type="button"
          onClick={() => {
            setMenuAnexoAberto(false)
            iniciarGravacao()
          }}
          aria-label="Gravar áudio"
          disabled={enviandoAlgo || Boolean(texto.trim()) || Boolean(anexo)}
        >
          🎙️
        </button>
      )}

      <button
        className={`send-button ${enviandoAlgo ? 'is-sending' : ''}`}
        type={gravando ? 'button' : 'submit'}
        onClick={gravando ? enviarGravacao : undefined}
        aria-label={gravando ? 'Enviar áudio' : anexo ? 'Enviar anexo' : 'Enviar mensagem'}
        disabled={gravando ? false : enviandoAlgo || (!anexo && !texto.trim())}
      >
        {enviandoAlgo ? '…' : '➤'}
      </button>
    </form>
  )
}
