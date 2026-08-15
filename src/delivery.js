import { supabase } from './supabase'

let usuarioId = null
let canal = null
let observer = null
let atualizandoEntrega = false
let recibosTimer = null

function conversaAtivaId() {
  return document.querySelector('.conversation-item.active')?.dataset.conversaId || null
}

function agendarRecibos() {
  clearTimeout(recibosTimer)
  recibosTimer = setTimeout(atualizarRecibos, 80)
}

async function marcarEntregues() {
  if (!usuarioId || !navigator.onLine || atualizandoEntrega) return

  atualizandoEntrega = true

  try {
    const { error } = await supabase
      .from('mensagens')
      .update({ entregue_em: new Date().toISOString() })
      .neq('remetente_id', usuarioId)
      .is('entregue_em', null)

    if (error) throw error
  } catch (error) {
    console.error('Falha ao confirmar entrega de mensagens:', error)
  } finally {
    atualizandoEntrega = false
    agendarRecibos()
  }
}

async function atualizarRecibos() {
  if (!usuarioId) return

  const conversaId = conversaAtivaId()
  if (!conversaId) return

  const recibos = Array.from(document.querySelectorAll('.messages-column .message-row.mine .read-receipt'))
  if (!recibos.length) return

  const { data, error } = await supabase
    .from('mensagens')
    .select('id,criada_em,entregue_em,lida_em')
    .eq('conversa_id', conversaId)
    .eq('remetente_id', usuarioId)
    .order('criada_em')

  if (error || !data) return

  recibos.forEach((recibo, indice) => {
    const mensagem = data[indice]
    if (!mensagem) return

    const lida = Boolean(mensagem.lida_em)
    const entregue = lida || Boolean(mensagem.entregue_em)
    const texto = lida ? '✓✓✓' : entregue ? '✓✓' : '✓'
    const rotulo = lida ? 'Mensagem lida' : entregue ? 'Mensagem entregue' : 'Mensagem enviada'

    if (recibo.textContent !== texto) recibo.textContent = texto
    recibo.classList.toggle('delivered', entregue && !lida)
    recibo.classList.toggle('read', lida)

    if (recibo.getAttribute('title') !== rotulo.replace('Mensagem ', '').replace(/^./, (letra) => letra.toUpperCase())) {
      recibo.title = rotulo.replace('Mensagem ', '').replace(/^./, (letra) => letra.toUpperCase())
    }
    if (recibo.getAttribute('aria-label') !== rotulo) recibo.setAttribute('aria-label', rotulo)
  })
}

function observarInterface() {
  observer?.disconnect()

  observer = new MutationObserver(() => agendarRecibos())
  observer.observe(document.getElementById('root') || document.documentElement, {
    childList: true,
    subtree: true,
  })

  agendarRecibos()
}

async function iniciarParaUsuario(id) {
  if (!id || usuarioId === id) return

  if (canal) await supabase.removeChannel(canal)
  usuarioId = id

  canal = supabase
    .channel(`entrega:${id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'mensagens' }, (evento) => {
      if (evento.eventType === 'INSERT' && evento.new?.remetente_id !== usuarioId) {
        marcarEntregues()
      }
      agendarRecibos()
    })
    .subscribe()

  observarInterface()
  await marcarEntregues()
}

async function parar() {
  usuarioId = null
  clearTimeout(recibosTimer)
  observer?.disconnect()
  observer = null

  if (canal) {
    await supabase.removeChannel(canal)
    canal = null
  }
}

window.addEventListener('online', marcarEntregues)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    marcarEntregues()
    agendarRecibos()
  }
})

supabase.auth.getSession().then(({ data }) => {
  if (data.session?.user?.id) iniciarParaUsuario(data.session.user.id)
})

supabase.auth.onAuthStateChange((evento, sessao) => {
  if (evento === 'SIGNED_OUT' || !sessao?.user?.id) {
    parar()
    return
  }

  iniciarParaUsuario(sessao.user.id)
})
