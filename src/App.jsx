import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase'

function obterIniciais(nome = '') {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join('') || 'US'
}

function formatarHorario(data) {
  if (!data) return ''
  return new Date(data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatarDataLista(data) {
  if (!data) return ''

  const valor = new Date(data)
  const hoje = new Date()
  const mesmoDia = valor.toDateString() === hoje.toDateString()

  if (mesmoDia) return formatarHorario(data)

  return valor.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function Icon({ children, label, onClick, disabled = false }) {
  return (
    <button className="icon-button" type="button" aria-label={label} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

function TelaAutenticacao() {
  const [modo, setModo] = useState('entrar')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  async function enviar(event) {
    event.preventDefault()
    setErro('')
    setAviso('')
    setCarregando(true)

    try {
      if (modo === 'cadastro') {
        if (!nome.trim()) throw new Error('Informe seu nome.')

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: senha,
          options: { data: { nome: nome.trim() } },
        })

        if (error) throw error

        if (!data.session) {
          setAviso('Conta criada. Confirme o email para entrar, caso a confirmação esteja habilitada no Supabase.')
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: senha,
        })

        if (error) throw error
      }
    } catch (error) {
      setErro(error.message || 'Não foi possível autenticar.')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand">PC</div>
        <span className="eyebrow">Projeto Chat</span>
        <h1>{modo === 'entrar' ? 'Entrar' : 'Criar conta'}</h1>
        <p className="auth-subtitle">Converse em tempo real com seus contatos.</p>

        <form className="auth-form" onSubmit={enviar}>
          {modo === 'cadastro' && (
            <label>
              <span>Nome</span>
              <input value={nome} onChange={(event) => setNome(event.target.value)} autoComplete="name" required />
            </label>
          )}

          <label>
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <label>
            <span>Senha</span>
            <input
              type="password"
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
              autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
              minLength={6}
              required
            />
          </label>

          {erro && <div className="form-message error">{erro}</div>}
          {aviso && <div className="form-message success">{aviso}</div>}

          <button className="primary-button" type="submit" disabled={carregando}>
            {carregando ? 'Aguarde...' : modo === 'entrar' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>

        <button
          className="text-button"
          type="button"
          onClick={() => {
            setModo((atual) => (atual === 'entrar' ? 'cadastro' : 'entrar'))
            setErro('')
            setAviso('')
          }}
        >
          {modo === 'entrar' ? 'Ainda não tenho conta' : 'Já tenho uma conta'}
        </button>
      </section>
    </main>
  )
}

function ModalNovaConversa({ perfis, usuarioId, onClose, onSelect }) {
  const [busca, setBusca] = useState('')

  const disponiveis = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR')

    return perfis
      .filter((perfil) => perfil.id !== usuarioId)
      .filter((perfil) => !termo || perfil.nome.toLocaleLowerCase('pt-BR').includes(termo))
  }, [busca, perfis, usuarioId])

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-label="Nova conversa" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="eyebrow">Novo chat</span>
            <h2>Escolha uma pessoa</h2>
          </div>
          <Icon label="Fechar" onClick={onClose}>×</Icon>
        </div>

        <label className="search-box modal-search">
          <span aria-hidden="true">⌕</span>
          <input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar pessoa" autoFocus />
        </label>

        <div className="people-list">
          {disponiveis.length === 0 ? (
            <div className="empty-list">Nenhum outro usuário disponível.</div>
          ) : (
            disponiveis.map((perfil) => (
              <button className="person-item" type="button" key={perfil.id} onClick={() => onSelect(perfil.id)}>
                <div className="avatar">{obterIniciais(perfil.nome)}</div>
                <strong>{perfil.nome}</strong>
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  )
}

function Chat({ usuario }) {
  const [perfis, setPerfis] = useState([])
  const [conversas, setConversas] = useState([])
  const [mensagens, setMensagens] = useState([])
  const [selecionadaId, setSelecionadaId] = useState(null)
  const [busca, setBusca] = useState('')
  const [texto, setTexto] = useState('')
  const [chatAbertoMobile, setChatAbertoMobile] = useState(false)
  const [novaConversaAberta, setNovaConversaAberta] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const fimMensagensRef = useRef(null)

  const carregarDados = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true)

    const [resPerfis, resConversas, resMensagens] = await Promise.all([
      supabase.from('perfis').select('id,nome,criado_em').order('nome'),
      supabase.from('conversas').select('id,usuario_1_id,usuario_2_id,criada_em').order('criada_em', { ascending: false }),
      supabase.from('mensagens').select('id,conversa_id,remetente_id,conteudo,criada_em').order('criada_em'),
    ])

    const falha = resPerfis.error || resConversas.error || resMensagens.error

    if (falha) {
      setErro(falha.message)
    } else {
      setErro('')
      setPerfis(resPerfis.data || [])
      setConversas(resConversas.data || [])
      setMensagens(resMensagens.data || [])
    }

    if (!silencioso) setCarregando(false)
  }, [])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  useEffect(() => {
    const canal = supabase
      .channel(`mensagens:${usuario.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensagens' },
        () => carregarDados(true),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(canal)
    }
  }, [carregarDados, usuario.id])

  const perfisPorId = useMemo(
    () => new Map(perfis.map((perfil) => [perfil.id, perfil])),
    [perfis],
  )

  const conversasMontadas = useMemo(() => {
    return conversas
      .map((conversa) => {
        const outroId = conversa.usuario_1_id === usuario.id ? conversa.usuario_2_id : conversa.usuario_1_id
        const perfil = perfisPorId.get(outroId)
        const mensagensDaConversa = mensagens.filter((mensagem) => mensagem.conversa_id === conversa.id)
        const ultima = mensagensDaConversa.at(-1)

        return {
          ...conversa,
          perfil,
          nome: perfil?.nome || 'Usuário',
          ultimaMensagem: ultima?.conteudo || 'Comece a conversa',
          ultimaData: ultima?.criada_em || conversa.criada_em,
        }
      })
      .sort((a, b) => new Date(b.ultimaData) - new Date(a.ultimaData))
  }, [conversas, mensagens, perfisPorId, usuario.id])

  useEffect(() => {
    if (!conversasMontadas.length) {
      setSelecionadaId(null)
      return
    }

    const selecionadaExiste = conversasMontadas.some((conversa) => conversa.id === selecionadaId)
    if (!selecionadaExiste) setSelecionadaId(conversasMontadas[0].id)
  }, [conversasMontadas, selecionadaId])

  const conversasFiltradas = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR')
    if (!termo) return conversasMontadas

    return conversasMontadas.filter((conversa) =>
      `${conversa.nome} ${conversa.ultimaMensagem}`.toLocaleLowerCase('pt-BR').includes(termo),
    )
  }, [busca, conversasMontadas])

  const selecionada = conversasMontadas.find((conversa) => conversa.id === selecionadaId) || null
  const mensagensSelecionadas = mensagens.filter((mensagem) => mensagem.conversa_id === selecionadaId)
  const meuPerfil = perfisPorId.get(usuario.id)
  const meuNome = meuPerfil?.nome || usuario.user_metadata?.nome || usuario.email?.split('@')[0] || 'Usuário'

  useEffect(() => {
    fimMensagensRef.current?.scrollIntoView({ block: 'end' })
  }, [mensagensSelecionadas.length, selecionadaId])

  function abrirConversa(id) {
    setSelecionadaId(id)
    setChatAbertoMobile(true)
  }

  async function criarConversa(outroUsuarioId) {
    setErro('')
    const [usuario1, usuario2] = [usuario.id, outroUsuarioId].sort()

    const { data: existente, error: erroBusca } = await supabase
      .from('conversas')
      .select('id')
      .eq('usuario_1_id', usuario1)
      .eq('usuario_2_id', usuario2)
      .maybeSingle()

    if (erroBusca) {
      setErro(erroBusca.message)
      return
    }

    let conversaId = existente?.id

    if (!conversaId) {
      const { data, error } = await supabase
        .from('conversas')
        .insert({ usuario_1_id: usuario1, usuario_2_id: usuario2 })
        .select('id')
        .single()

      if (error) {
        setErro(error.message)
        return
      }

      conversaId = data.id
    }

    await carregarDados(true)
    setSelecionadaId(conversaId)
    setNovaConversaAberta(false)
    setChatAbertoMobile(true)
  }

  async function enviarMensagem(event) {
    event.preventDefault()
    const conteudo = texto.trim()

    if (!conteudo || !selecionadaId || enviando) return

    setEnviando(true)
    setErro('')

    const { error } = await supabase.from('mensagens').insert({
      conversa_id: selecionadaId,
      remetente_id: usuario.id,
      conteudo,
    })

    if (error) {
      setErro(error.message)
    } else {
      setTexto('')
      await carregarDados(true)
    }

    setEnviando(false)
  }

  async function sair() {
    await supabase.auth.signOut()
  }

  if (carregando) {
    return <div className="loading-screen">Carregando conversas...</div>
  }

  return (
    <main className={`app-shell ${chatAbertoMobile ? 'chat-open' : ''}`}>
      <aside className="sidebar">
        <header className="sidebar-header">
          <div>
            <span className="eyebrow">Projeto Chat</span>
            <h1>Conversas</h1>
          </div>
          <Icon label="Nova conversa" onClick={() => setNovaConversaAberta(true)}>＋</Icon>
        </header>

        <label className="search-box">
          <span aria-hidden="true">⌕</span>
          <input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar conversas" />
        </label>

        {erro && <div className="inline-error">{erro}</div>}

        <div className="conversation-list">
          {conversasFiltradas.length === 0 ? (
            <div className="empty-list conversation-empty">Nenhuma conversa ainda. Use o botão + para começar.</div>
          ) : (
            conversasFiltradas.map((conversa) => (
              <button
                key={conversa.id}
                type="button"
                className={`conversation-item ${conversa.id === selecionadaId ? 'active' : ''}`}
                onClick={() => abrirConversa(conversa.id)}
              >
                <div className="avatar">{obterIniciais(conversa.nome)}</div>
                <div className="conversation-content">
                  <div className="conversation-topline">
                    <strong>{conversa.nome}</strong>
                    <time>{formatarDataLista(conversa.ultimaData)}</time>
                  </div>
                  <div className="conversation-preview">
                    <span>{conversa.ultimaMensagem}</span>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        <footer className="sidebar-footer">
          <div className="avatar avatar-me">{obterIniciais(meuNome)}</div>
          <div>
            <strong>{meuNome}</strong>
            <span>{usuario.email}</span>
          </div>
          <Icon label="Sair" onClick={sair}>↪</Icon>
        </footer>
      </aside>

      <section className={`chat-panel ${!selecionada ? 'chat-panel-empty' : ''}`}>
        {selecionada ? (
          <>
            <header className="chat-header">
              <button className="back-button" type="button" onClick={() => setChatAbertoMobile(false)} aria-label="Voltar">‹</button>
              <div className="avatar">{obterIniciais(selecionada.nome)}</div>
              <div className="chat-person">
                <strong>{selecionada.nome}</strong>
                <span>Conversa direta</span>
              </div>
            </header>

            <div className="messages-area">
              <div className="messages-column">
                {mensagensSelecionadas.length === 0 && (
                  <div className="conversation-start">Envie a primeira mensagem para {selecionada.nome}.</div>
                )}

                {mensagensSelecionadas.map((mensagem) => {
                  const propria = mensagem.remetente_id === usuario.id

                  return (
                    <div key={mensagem.id} className={`message-row ${propria ? 'mine' : ''}`}>
                      <div className="message-bubble">
                        <p>{mensagem.conteudo}</p>
                        <div className="message-meta">
                          <time>{formatarHorario(mensagem.criada_em)}</time>
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div ref={fimMensagensRef} />
              </div>
            </div>

            <form className="composer composer-simple" onSubmit={enviarMensagem}>
              <input
                value={texto}
                onChange={(event) => setTexto(event.target.value)}
                placeholder="Digite uma mensagem"
                aria-label="Mensagem"
                maxLength={4000}
              />
              <button className="send-button" type="submit" aria-label="Enviar mensagem" disabled={enviando || !texto.trim()}>➤</button>
            </form>
          </>
        ) : (
          <div className="empty-chat">
            <div className="empty-chat-icon">💬</div>
            <h2>Projeto Chat</h2>
            <p>Escolha uma conversa ou crie uma nova para começar.</p>
            <button className="primary-button compact" type="button" onClick={() => setNovaConversaAberta(true)}>Nova conversa</button>
          </div>
        )}
      </section>

      {novaConversaAberta && (
        <ModalNovaConversa
          perfis={perfis}
          usuarioId={usuario.id}
          onClose={() => setNovaConversaAberta(false)}
          onSelect={criarConversa}
        />
      )}
    </main>
  )
}

function App() {
  const [sessao, setSessao] = useState(null)
  const [carregandoSessao, setCarregandoSessao] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session)
      setCarregandoSessao(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
      setSessao(novaSessao)
      setCarregandoSessao(false)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  if (carregandoSessao) return <div className="loading-screen">Abrindo Projeto Chat...</div>
  if (!sessao) return <TelaAutenticacao />

  return <Chat usuario={sessao.user} />
}

export default App
