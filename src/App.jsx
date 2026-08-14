import { useMemo, useState } from 'react'

const conversasIniciais = [
  {
    id: 1,
    nome: 'Marina',
    iniciais: 'MA',
    status: 'online',
    ultimaMensagem: 'Fechado, te aviso quando sair daqui.',
    horario: '14:42',
    naoLidas: 2,
    mensagens: [
      { id: 1, texto: 'Vai conseguir chegar por volta das 18h?', horario: '14:35', propria: false },
      { id: 2, texto: 'Consigo sim. Acho que até um pouco antes.', horario: '14:37', propria: true, lida: true },
      { id: 3, texto: 'Perfeito. Me chama quando estiver saindo.', horario: '14:39', propria: false },
      { id: 4, texto: 'Fechado, te aviso quando sair daqui.', horario: '14:42', propria: false },
    ],
  },
  {
    id: 2,
    nome: 'Lucas',
    iniciais: 'LU',
    status: 'visto há 12 min',
    ultimaMensagem: 'Aquele layout ficou bem melhor.',
    horario: '13:18',
    naoLidas: 0,
    mensagens: [
      { id: 1, texto: 'Aquele layout ficou bem melhor.', horario: '13:18', propria: false },
    ],
  },
  {
    id: 3,
    nome: 'Grupo da Galera',
    iniciais: 'GG',
    status: '5 participantes',
    ultimaMensagem: 'Rafa: sábado então?',
    horario: '12:51',
    naoLidas: 5,
    mensagens: [
      { id: 1, texto: 'sábado então?', horario: '12:51', propria: false, autor: 'Rafa' },
    ],
  },
  {
    id: 4,
    nome: 'Ana',
    iniciais: 'AN',
    status: 'visto ontem às 22:10',
    ultimaMensagem: 'Boa noite 👋',
    horario: 'Ontem',
    naoLidas: 0,
    mensagens: [
      { id: 1, texto: 'Boa noite 👋', horario: '22:10', propria: false },
    ],
  },
]

function Icon({ children, label }) {
  return (
    <button className="icon-button" type="button" aria-label={label}>
      {children}
    </button>
  )
}

function App() {
  const [conversas, setConversas] = useState(conversasIniciais)
  const [selecionadaId, setSelecionadaId] = useState(1)
  const [busca, setBusca] = useState('')
  const [texto, setTexto] = useState('')
  const [chatAbertoMobile, setChatAbertoMobile] = useState(false)

  const selecionada = conversas.find((conversa) => conversa.id === selecionadaId) ?? conversas[0]

  const conversasFiltradas = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR')
    if (!termo) return conversas

    return conversas.filter((conversa) =>
      `${conversa.nome} ${conversa.ultimaMensagem}`.toLocaleLowerCase('pt-BR').includes(termo),
    )
  }, [busca, conversas])

  function abrirConversa(id) {
    setSelecionadaId(id)
    setChatAbertoMobile(true)
    setConversas((atuais) =>
      atuais.map((conversa) => (conversa.id === id ? { ...conversa, naoLidas: 0 } : conversa)),
    )
  }

  function enviarMensagem(event) {
    event.preventDefault()
    const mensagem = texto.trim()
    if (!mensagem) return

    const agora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

    setConversas((atuais) =>
      atuais.map((conversa) =>
        conversa.id === selecionadaId
          ? {
              ...conversa,
              ultimaMensagem: mensagem,
              horario: agora,
              mensagens: [
                ...conversa.mensagens,
                { id: Date.now(), texto: mensagem, horario: agora, propria: true, lida: false },
              ],
            }
          : conversa,
      ),
    )
    setTexto('')
  }

  return (
    <main className={`app-shell ${chatAbertoMobile ? 'chat-open' : ''}`}>
      <aside className="sidebar">
        <header className="sidebar-header">
          <div>
            <span className="eyebrow">Mensagens</span>
            <h1>Conversas</h1>
          </div>
          <Icon label="Nova conversa">＋</Icon>
        </header>

        <label className="search-box">
          <span aria-hidden="true">⌕</span>
          <input
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Buscar conversas"
            aria-label="Buscar conversas"
          />
        </label>

        <div className="conversation-list">
          {conversasFiltradas.map((conversa) => (
            <button
              key={conversa.id}
              type="button"
              className={`conversation-item ${conversa.id === selecionadaId ? 'active' : ''}`}
              onClick={() => abrirConversa(conversa.id)}
            >
              <div className="avatar">{conversa.iniciais}</div>
              <div className="conversation-content">
                <div className="conversation-topline">
                  <strong>{conversa.nome}</strong>
                  <time>{conversa.horario}</time>
                </div>
                <div className="conversation-preview">
                  <span>{conversa.ultimaMensagem}</span>
                  {conversa.naoLidas > 0 && <b>{conversa.naoLidas}</b>}
                </div>
              </div>
            </button>
          ))}
        </div>

        <footer className="sidebar-footer">
          <div className="avatar avatar-me">JO</div>
          <div>
            <strong>João</strong>
            <span>Disponível</span>
          </div>
          <Icon label="Configurações">⚙</Icon>
        </footer>
      </aside>

      <section className="chat-panel">
        <header className="chat-header">
          <button className="back-button" type="button" onClick={() => setChatAbertoMobile(false)} aria-label="Voltar">
            ‹
          </button>
          <div className="avatar">{selecionada.iniciais}</div>
          <div className="chat-person">
            <strong>{selecionada.nome}</strong>
            <span>{selecionada.status}</span>
          </div>
          <div className="chat-actions">
            <Icon label="Pesquisar na conversa">⌕</Icon>
            <Icon label="Mais opções">•••</Icon>
          </div>
        </header>

        <div className="messages-area">
          <div className="date-pill">Hoje</div>
          <div className="messages-column">
            {selecionada.mensagens.map((mensagem) => (
              <div key={mensagem.id} className={`message-row ${mensagem.propria ? 'mine' : ''}`}>
                <div className="message-bubble">
                  {mensagem.autor && <span className="message-author">{mensagem.autor}</span>}
                  <p>{mensagem.texto}</p>
                  <div className="message-meta">
                    <time>{mensagem.horario}</time>
                    {mensagem.propria && <span aria-label={mensagem.lida ? 'Lida' : 'Enviada'}>{mensagem.lida ? '✓✓' : '✓'}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <form className="composer" onSubmit={enviarMensagem}>
          <button type="button" className="composer-button" aria-label="Adicionar anexo">＋</button>
          <input
            value={texto}
            onChange={(event) => setTexto(event.target.value)}
            placeholder="Digite uma mensagem"
            aria-label="Mensagem"
          />
          <button className="send-button" type="submit" aria-label="Enviar mensagem">➤</button>
        </form>
      </section>
    </main>
  )
}

export default App
