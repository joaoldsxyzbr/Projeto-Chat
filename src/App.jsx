import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase'
import { useAudioRecorder } from './audio'
import { useAttachmentUpload } from './attachments'
import { CallOverlay, useVoiceCalls } from './calls'
import { Composer, MessageList } from './chat-components'

const LISTA_VAZIA = []
const CAMPOS_MENSAGEM = 'id,conversa_id,remetente_id,conteudo,criada_em,entregue_em,lida_em,tipo,arquivo_caminho,arquivo_tipo,arquivo_nome,arquivo_tamanho,duracao_segundos'

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

function resumoMensagem(mensagem) {
  if (!mensagem) return 'Comece a conversa'
  if (mensagem.tipo === 'audio') return '🎙️ Mensagem de áudio'
  if (mensagem.tipo === 'imagem') return '📷 Foto'
  if (mensagem.tipo === 'arquivo') return `📎 ${mensagem.arquivo_nome || 'Arquivo'}`
  return mensagem.conteudo || 'Comece a conversa'
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
  const [chatAbertoMobile, setChatAbertoMobile] = useState(false)
  const [novaConversaAberta, setNovaConversaAberta] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [usuariosOnline, setUsuariosOnline] = useState(() => new Set())
  const [estaDigitando, setEstaDigitando] = useState(false)
  const fimMensagensRef = useRef(null)
  const mensagensAreaRef = useRef(null)
  const seguirFimRef = useRef(true)
  const conversaScrollRef = useRef(null)
  const cargaSequenciaRef = useRef(0)
  const deepLinkAplicadoRef = useRef(false)
  const canalDigitacaoRef = useRef(null)
  const digitacaoProntaRef = useRef(false)
  const digitandoEnviadoRef = useRef(false)
  const digitandoTimerRef = useRef(null)
  const scrollFrameRef = useRef(null)

  const carregarDados = useCallback(async (silencioso = false) => {
    const sequencia = ++cargaSequenciaRef.current
    if (!silencioso) setCarregando(true)

    const [resPerfis, resConversas, resMensagens] = await Promise.all([
      supabase.from('perfis').select('id,nome,criado_em').order('nome'),
      supabase.from('conversas').select('id,usuario_1_id,usuario_2_id,criada_em').order('criada_em', { ascending: false }),
      supabase
        .from('mensagens')
        .select(CAMPOS_MENSAGEM)
        .order('criada_em'),
    ])

    if (sequencia !== cargaSequenciaRef.current) return

    const falha = resPerfis.error || resConversas.error || resMensagens.error

    if (falha) {
      setErro(falha.message)
    } else {
      setErro('')
      setPerfis(resPerfis.data || [])
      setConversas(resConversas.data || [])
      setMensagens(resMensagens.data || [])
    }

    setCarregando(false)
  }, [])

  const atualizarMensagemLocal = useCallback((mensagem) => {
    if (!mensagem?.id) return

    setMensagens((atuais) => {
      const indice = atuais.findIndex((item) => item.id === mensagem.id)

      if (indice >= 0) {
        const atual = atuais[indice]
        const atualizada = { ...atual, ...mensagem }

        if (Object.keys(atualizada).every((chave) => atualizada[chave] === atual[chave])) return atuais

        const proximas = [...atuais]
        proximas[indice] = atualizada
        return proximas
      }

      const ultima = atuais.at(-1)
      if (!ultima?.criada_em || !mensagem.criada_em || mensagem.criada_em >= ultima.criada_em) {
        return [...atuais, mensagem]
      }

      return [...atuais, mensagem].sort((a, b) => String(a.criada_em).localeCompare(String(b.criada_em)))
    })
  }, [])

  const removerMensagemLocal = useCallback((id) => {
    if (!id) return
    setMensagens((atuais) => atuais.filter((mensagem) => mensagem.id !== id))
  }, [])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  useEffect(() => {
    const sincronizar = () => {
      if (navigator.onLine && document.visibilityState === 'visible') carregarDados(true)
    }

    window.addEventListener('online', sincronizar)
    document.addEventListener('visibilitychange', sincronizar)

    return () => {
      window.removeEventListener('online', sincronizar)
      document.removeEventListener('visibilitychange', sincronizar)
    }
  }, [carregarDados])

  useEffect(() => {
    const canal = supabase
      .channel(`chat:${usuario.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mensagens' }, (evento) => {
        if (evento.eventType === 'DELETE') {
          removerMensagemLocal(evento.old?.id)
          return
        }

        atualizarMensagemLocal(evento.new)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversas' }, () => {
        carregarDados(true)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(canal)
    }
  }, [atualizarMensagemLocal, carregarDados, removerMensagemLocal, usuario.id])

  useEffect(() => {
    let canal
    let cancelado = false

    async function iniciarPresenca() {
      try {
        await supabase.realtime.setAuth()
        if (cancelado) return

        canal = supabase
          .channel('presenca:global', { config: { private: true } })
          .on('presence', { event: 'sync' }, () => {
            const estado = canal.presenceState()
            const idsOnline = new Set(
              Object.values(estado)
                .flat()
                .map((presenca) => presenca.usuario_id)
                .filter(Boolean),
            )
            setUsuariosOnline(idsOnline)
          })
          .subscribe(async (status) => {
            if (status !== 'SUBSCRIBED') return

            await canal.track({
              usuario_id: usuario.id,
              online_em: new Date().toISOString(),
            })
          })
      } catch (error) {
        if (!cancelado) setErro(error.message || 'Não foi possível ativar a presença em tempo real.')
      }
    }

    iniciarPresenca()

    return () => {
      cancelado = true
      setUsuariosOnline(new Set())
      if (canal) {
        canal.untrack()
        supabase.removeChannel(canal)
      }
    }
  }, [usuario.id])

  const perfisPorId = useMemo(
    () => new Map(perfis.map((perfil) => [perfil.id, perfil])),
    [perfis],
  )

  const { mensagensPorConversa, resumoPorConversa } = useMemo(() => {
    const agrupadas = new Map()
    const resumos = new Map()

    mensagens.forEach((mensagem) => {
      let grupo = agrupadas.get(mensagem.conversa_id)
      if (!grupo) {
        grupo = []
        agrupadas.set(mensagem.conversa_id, grupo)
      }
      grupo.push(mensagem)

      let resumo = resumos.get(mensagem.conversa_id)
      if (!resumo) {
        resumo = { ultima: null, naoLidas: 0 }
        resumos.set(mensagem.conversa_id, resumo)
      }

      resumo.ultima = mensagem
      if (mensagem.remetente_id !== usuario.id && !mensagem.lida_em) resumo.naoLidas += 1
    })

    return { mensagensPorConversa: agrupadas, resumoPorConversa: resumos }
  }, [mensagens, usuario.id])

  const conversasMontadas = useMemo(() => {
    return conversas
      .map((conversa) => {
        const outroId = conversa.usuario_1_id === usuario.id ? conversa.usuario_2_id : conversa.usuario_1_id
        const perfil = perfisPorId.get(outroId)
        const nome = perfil?.nome || 'Usuário'
        const resumo = resumoPorConversa.get(conversa.id)
        const ultima = resumo?.ultima
        const ultimaMensagem = resumoMensagem(ultima)

        return {
          ...conversa,
          outroId,
          perfil,
          nome,
          iniciais: obterIniciais(nome),
          ultimaMensagem,
          ultimaData: ultima?.criada_em || conversa.criada_em,
          naoLidas: resumo?.naoLidas || 0,
          textoBusca: `${nome} ${ultimaMensagem}`.toLocaleLowerCase('pt-BR'),
        }
      })
      .sort((a, b) => new Date(b.ultimaData) - new Date(a.ultimaData))
  }, [conversas, perfisPorId, resumoPorConversa, usuario.id])

  const conversasPorId = useMemo(
    () => new Map(conversasMontadas.map((conversa) => [conversa.id, conversa])),
    [conversasMontadas],
  )

  useEffect(() => {
    if (!conversasMontadas.length) {
      setSelecionadaId(null)
      return
    }

    if (!conversasPorId.has(selecionadaId)) setSelecionadaId(conversasMontadas[0].id)
  }, [conversasMontadas, conversasPorId, selecionadaId])

  useEffect(() => {
    if (deepLinkAplicadoRef.current || carregando) return
    deepLinkAplicadoRef.current = true

    const conversaId = new URLSearchParams(window.location.search).get('conversa')
    if (!conversaId) return

    window.history.replaceState({}, '', window.location.pathname)

    if (!conversasPorId.has(conversaId)) return

    setSelecionadaId(conversaId)
    setChatAbertoMobile(true)
    seguirFimRef.current = true

    if (window.matchMedia('(max-width: 740px)').matches) {
      window.history.pushState({ projetoChatConversa: true, conversaId }, '')
    }
  }, [carregando, conversasPorId])

  useEffect(() => {
    const aoNavegarHistorico = () => {
      if (!window.matchMedia('(max-width: 740px)').matches) return

      const estado = window.history.state
      if (estado?.projetoChatConversa && estado.conversaId) {
        setSelecionadaId(estado.conversaId)
        setChatAbertoMobile(true)
        seguirFimRef.current = true
      } else {
        setChatAbertoMobile(false)
      }
    }

    window.addEventListener('popstate', aoNavegarHistorico)
    return () => window.removeEventListener('popstate', aoNavegarHistorico)
  }, [])

  const conversasFiltradas = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR')
    if (!termo) return conversasMontadas

    return conversasMontadas.filter((conversa) => conversa.textoBusca.includes(termo))
  }, [busca, conversasMontadas])

  const selecionada = conversasPorId.get(selecionadaId) || null
  const mensagensSelecionadas = mensagensPorConversa.get(selecionadaId) || LISTA_VAZIA
  const temNaoLidasSelecionadas = (resumoPorConversa.get(selecionadaId)?.naoLidas || 0) > 0
  const meuPerfil = perfisPorId.get(usuario.id)
  const meuNome = meuPerfil?.nome || usuario.user_metadata?.nome || usuario.email?.split('@')[0] || 'Usuário'
  const outroOnline = Boolean(selecionada && usuariosOnline.has(selecionada.outroId))

  const {
    gravando,
    enviandoAudio,
    tempoFormatado,
    iniciarGravacao,
    enviarGravacao,
    cancelarGravacao,
  } = useAudioRecorder({
    conversaId: selecionadaId,
    usuarioId: usuario.id,
    onEnviado: () => carregarDados(true),
    onErro: setErro,
  })

  const {
    anexo,
    enviandoAnexo,
    selecionarAnexo,
    cancelarAnexo,
    enviarAnexo,
  } = useAttachmentUpload({
    conversaId: selecionadaId,
    usuarioId: usuario.id,
    onEnviado: atualizarMensagemLocal,
    onErro: setErro,
  })

  const {
    chamada,
    preparando: preparandoChamada,
    conectando: conectandoChamada,
    mutado: chamadaMutada,
    duracaoFormatada,
    relayDisponivel,
    remoteAudioRef,
    iniciarChamada,
    aceitarChamada,
    recusarChamada,
    desligarChamada,
    alternarMudo,
  } = useVoiceCalls({
    usuarioId: usuario.id,
    onErro: setErro,
  })

  const outroChamadaId = chamada
    ? chamada.chamador_id === usuario.id
      ? chamada.destinatario_id
      : chamada.chamador_id
    : null
  const nomeOutroChamada = outroChamadaId ? perfisPorId.get(outroChamadaId)?.nome || 'Usuário' : 'Usuário'
  const enviandoAlgo = enviando || enviandoAudio || enviandoAnexo

  useEffect(() => {
    const mudouConversa = conversaScrollRef.current !== selecionadaId

    if (mudouConversa) {
      conversaScrollRef.current = selecionadaId
      seguirFimRef.current = true
    }

    if (!mudouConversa && !seguirFimRef.current) return undefined

    const frame = requestAnimationFrame(() => {
      fimMensagensRef.current?.scrollIntoView({ block: 'end' })
    })

    return () => cancelAnimationFrame(frame)
  }, [mensagensSelecionadas.length, selecionadaId])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined

    const enviarEstado = () => {
      navigator.serviceWorker.controller?.postMessage({
        type: 'CHAT_STATE',
        conversa_id: selecionadaId,
        visivel: document.visibilityState === 'visible',
        chat_aberto: Boolean(selecionadaId) && (window.matchMedia('(min-width: 741px)').matches || chatAbertoMobile),
      })
    }

    enviarEstado()
    document.addEventListener('visibilitychange', enviarEstado)

    navigator.serviceWorker.ready.then(enviarEstado).catch(() => {})

    return () => document.removeEventListener('visibilitychange', enviarEstado)
  }, [chatAbertoMobile, selecionadaId])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined

    const aoReceberMensagem = (event) => {
      if (event.data?.type !== 'ABRIR_CONVERSA') return

      const conversaId = event.data.conversa_id
      if (!conversasPorId.has(conversaId)) return

      abrirConversa(conversaId)
    }

    navigator.serviceWorker.addEventListener('message', aoReceberMensagem)
    return () => navigator.serviceWorker.removeEventListener('message', aoReceberMensagem)
  }, [conversasPorId, gravando, anexo])

  useEffect(() => {
    let canal
    let cancelado = false
    let expiraDigitacao

    setEstaDigitando(false)
    canalDigitacaoRef.current = null
    digitacaoProntaRef.current = false
    digitandoEnviadoRef.current = false
    clearTimeout(digitandoTimerRef.current)

    if (!selecionadaId) return undefined

    async function iniciarDigitacao() {
      try {
        await supabase.realtime.setAuth()
        if (cancelado) return

        canal = supabase
          .channel(`conversa:${selecionadaId}:digitando`, { config: { private: true } })
          .on('broadcast', { event: 'digitando' }, ({ payload }) => {
            if (payload?.usuario_id === usuario.id) return

            clearTimeout(expiraDigitacao)
            const digitando = Boolean(payload?.digitando)
            setEstaDigitando(digitando)

            if (digitando) {
              expiraDigitacao = setTimeout(() => setEstaDigitando(false), 2200)
            }
          })
          .subscribe((status) => {
            if (status !== 'SUBSCRIBED') return
            canalDigitacaoRef.current = canal
            digitacaoProntaRef.current = true
          })
      } catch (error) {
        if (!cancelado) setErro(error.message || 'Não foi possível ativar o indicador de digitação.')
      }
    }

    iniciarDigitacao()

    return () => {
      cancelado = true
      clearTimeout(expiraDigitacao)
      clearTimeout(digitandoTimerRef.current)

      if (digitandoEnviadoRef.current && canal && digitacaoProntaRef.current) {
        canal.send({
          type: 'broadcast',
          event: 'digitando',
          payload: { usuario_id: usuario.id, digitando: false },
        })
      }

      digitandoEnviadoRef.current = false
      digitacaoProntaRef.current = false
      canalDigitacaoRef.current = null
      setEstaDigitando(false)
      if (canal) supabase.removeChannel(canal)
    }
  }, [selecionadaId, usuario.id])

  useEffect(() => {
    if (!selecionadaId || !temNaoLidasSelecionadas) return undefined

    async function marcarComoLidas() {
      const conversaEstaVisivel = window.matchMedia('(min-width: 741px)').matches || chatAbertoMobile

      if (document.visibilityState !== 'visible' || !conversaEstaVisivel) return

      const { error } = await supabase
        .from('mensagens')
        .update({ lida_em: new Date().toISOString() })
        .eq('conversa_id', selecionadaId)
        .neq('remetente_id', usuario.id)
        .is('lida_em', null)

      if (error) setErro(error.message)
    }

    marcarComoLidas()
    document.addEventListener('visibilitychange', marcarComoLidas)

    return () => document.removeEventListener('visibilitychange', marcarComoLidas)
  }, [chatAbertoMobile, selecionadaId, temNaoLidasSelecionadas, usuario.id])

  function publicarDigitacao(digitando) {
    const canal = canalDigitacaoRef.current
    if (!canal || !digitacaoProntaRef.current) return false

    canal.send({
      type: 'broadcast',
      event: 'digitando',
      payload: { usuario_id: usuario.id, digitando },
    })

    return true
  }

  function alterarTexto(valor) {
    clearTimeout(digitandoTimerRef.current)

    if (!valor.trim()) {
      if (digitandoEnviadoRef.current) publicarDigitacao(false)
      digitandoEnviadoRef.current = false
      return
    }

    if (!digitandoEnviadoRef.current) {
      digitandoEnviadoRef.current = publicarDigitacao(true)
    }

    digitandoTimerRef.current = setTimeout(() => {
      if (digitandoEnviadoRef.current) publicarDigitacao(false)
      digitandoEnviadoRef.current = false
    }, 1200)
  }

  function registrarHistoricoConversa(id) {
    if (!window.matchMedia('(max-width: 740px)').matches) return

    const estado = window.history.state || {}
    if (estado.projetoChatConversa) {
      window.history.replaceState({ ...estado, conversaId: id }, '')
    } else {
      window.history.pushState({ ...estado, projetoChatConversa: true, conversaId: id }, '')
    }
  }

  function limparComposicao() {
    if (gravando) cancelarGravacao()
    if (anexo) cancelarAnexo()
  }

  function abrirConversa(id) {
    limparComposicao()
    seguirFimRef.current = true
    setSelecionadaId(id)
    setChatAbertoMobile(true)
    registrarHistoricoConversa(id)
  }

  function voltarConversas() {
    limparComposicao()
    setChatAbertoMobile(false)

    if (window.matchMedia('(max-width: 740px)').matches && window.history.state?.projetoChatConversa) {
      window.history.back()
    }
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
    setNovaConversaAberta(false)
    abrirConversa(conversaId)
  }

  async function enviarTexto(conteudo) {
    const valor = conteudo.trim()
    if (!valor || !selecionadaId || enviando || enviandoAudio || enviandoAnexo || gravando) return false

    clearTimeout(digitandoTimerRef.current)
    if (digitandoEnviadoRef.current) publicarDigitacao(false)
    digitandoEnviadoRef.current = false
    seguirFimRef.current = true
    setEnviando(true)
    setErro('')

    try {
      const { data: mensagem, error } = await supabase
        .from('mensagens')
        .insert({
          conversa_id: selecionadaId,
          remetente_id: usuario.id,
          conteudo: valor,
        })
        .select(CAMPOS_MENSAGEM)
        .single()

      if (error) throw error

      atualizarMensagemLocal(mensagem)
      return true
    } catch (error) {
      setErro(error.message || 'Não foi possível enviar a mensagem.')
      return false
    } finally {
      setEnviando(false)
    }
  }

  async function enviarAnexoComScroll() {
    seguirFimRef.current = true
    setErro('')
    return enviarAnexo()
  }

  async function sair() {
    if (chamada) await desligarChamada()
    limparComposicao()
    await supabase.auth.signOut()
  }

  if (carregando) {
    return <div className="loading-screen">Carregando conversas...</div>
  }

  return (
    <main className={`app-shell ${chatAbertoMobile ? 'chat-open' : ''}`}>
      {erro && <div className="global-error" role="alert">{erro}</div>}

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

        <div className="conversation-list">
          {conversasFiltradas.length === 0 ? (
            <div className="empty-list conversation-empty">Nenhuma conversa ainda. Use o botão + para começar.</div>
          ) : (
            conversasFiltradas.map((conversa) => (
              <button
                key={conversa.id}
                type="button"
                data-conversa-id={conversa.id}
                className={`conversation-item ${conversa.id === selecionadaId ? 'active' : ''}`}
                onClick={() => abrirConversa(conversa.id)}
              >
                <div className={`avatar ${usuariosOnline.has(conversa.outroId) ? 'presence-online' : ''}`}>
                  {conversa.iniciais}
                </div>
                <div className="conversation-content">
                  <div className="conversation-topline">
                    <strong>{conversa.nome}</strong>
                    <time>{formatarDataLista(conversa.ultimaData)}</time>
                  </div>
                  <div className="conversation-preview">
                    <span>{conversa.ultimaMensagem}</span>
                    {conversa.naoLidas > 0 && <b>{conversa.naoLidas}</b>}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        <footer className="sidebar-footer">
          <div className="avatar avatar-me presence-online">{obterIniciais(meuNome)}</div>
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
              <button className="back-button" type="button" onClick={voltarConversas} aria-label="Voltar">‹</button>
              <div className={`avatar ${outroOnline ? 'presence-online' : ''}`}>{selecionada.iniciais}</div>
              <div className="chat-person">
                <strong>{selecionada.nome}</strong>
                <span className={estaDigitando ? 'typing-status' : ''}>
                  {estaDigitando ? 'digitando...' : outroOnline ? 'online' : 'offline'}
                </span>
              </div>
              <button
                className="call-header-button"
                type="button"
                onClick={() => iniciarChamada(selecionada)}
                aria-label={`Ligar para ${selecionada.nome}`}
                title="Ligação de voz"
                disabled={Boolean(chamada) || preparandoChamada || gravando || enviandoAlgo}
              >
                📞
              </button>
            </header>

            <MessageList
              mensagens={mensagensSelecionadas}
              usuarioId={usuario.id}
              nome={selecionada.nome}
              mensagensAreaRef={mensagensAreaRef}
              fimMensagensRef={fimMensagensRef}
              seguirFimRef={seguirFimRef}
              scrollFrameRef={scrollFrameRef}
            />

            <Composer
              conversaId={selecionadaId}
              anexo={anexo}
              enviando={enviando}
              enviandoAudio={enviandoAudio}
              enviandoAnexo={enviandoAnexo}
              gravando={gravando}
              tempoFormatado={tempoFormatado}
              selecionarAnexo={selecionarAnexo}
              cancelarAnexo={cancelarAnexo}
              enviarAnexo={enviarAnexoComScroll}
              iniciarGravacao={iniciarGravacao}
              enviarGravacao={enviarGravacao}
              cancelarGravacao={cancelarGravacao}
              onAlterarTexto={alterarTexto}
              onEnviarTexto={enviarTexto}
              onErro={setErro}
            />
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

      <CallOverlay
        chamada={chamada}
        usuarioId={usuario.id}
        nomeOutro={nomeOutroChamada}
        preparando={preparandoChamada}
        conectando={conectandoChamada}
        mutado={chamadaMutada}
        duracaoFormatada={duracaoFormatada}
        relayDisponivel={relayDisponivel}
        remoteAudioRef={remoteAudioRef}
        onAceitar={aceitarChamada}
        onRecusar={recusarChamada}
        onDesligar={desligarChamada}
        onMudo={alternarMudo}
      />
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