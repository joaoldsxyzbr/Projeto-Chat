import { supabase } from './supabase'

let usuarioId = null
let canal = null
let atualizandoEntrega = false

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
  }
}

async function iniciarParaUsuario(id) {
  if (!id || usuarioId === id) return

  if (canal) await supabase.removeChannel(canal)
  usuarioId = id

  canal = supabase
    .channel(`entrega:${id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensagens' }, (evento) => {
      if (evento.new?.remetente_id !== usuarioId) marcarEntregues()
    })
    .subscribe()

  await marcarEntregues()
}

async function parar() {
  usuarioId = null

  if (canal) {
    await supabase.removeChannel(canal)
    canal = null
  }
}

window.addEventListener('online', marcarEntregues)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') marcarEntregues()
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
