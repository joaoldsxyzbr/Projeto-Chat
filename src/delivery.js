import { supabase } from './supabase'

let usuarioId = null
let canal = null
let atualizandoEntrega = false
let atualizacaoPendente = false

async function marcarEntregues() {
  if (!usuarioId || !navigator.onLine) return

  if (atualizandoEntrega) {
    atualizacaoPendente = true
    return
  }

  atualizandoEntrega = true

  try {
    do {
      atualizacaoPendente = false
      const usuarioAtual = usuarioId

      if (!usuarioAtual || !navigator.onLine) break

      const { error } = await supabase
        .from('mensagens')
        .update({ entregue_em: new Date().toISOString() })
        .neq('remetente_id', usuarioAtual)
        .is('entregue_em', null)

      if (error) throw error
    } while (atualizacaoPendente)
  } catch (error) {
    console.error('Falha ao confirmar entrega de mensagens:', error)
  } finally {
    atualizandoEntrega = false
  }
}

async function iniciarParaUsuario(id) {
  if (!id || (usuarioId === id && canal)) return

  if (canal) await supabase.removeChannel(canal)
  canal = null
  usuarioId = id
  atualizacaoPendente = false

  try {
    await supabase.realtime.setAuth()
    if (usuarioId !== id) return

    canal = supabase
      .channel(`entrega:${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensagens',
          select: ['id', 'remetente_id'],
        },
        (evento) => {
          if (evento.new?.remetente_id !== usuarioId) marcarEntregues()
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && usuarioId === id) marcarEntregues()
      })

    await marcarEntregues()
  } catch (error) {
    console.error('Falha ao iniciar confirmação de entrega em tempo real:', error)
  }
}

async function parar() {
  usuarioId = null
  atualizacaoPendente = false

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
