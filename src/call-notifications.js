import { supabase } from './supabase'

let usuarioId = null
let canal = null

function fecharNotificacao(chamadaId) {
  if (!chamadaId || !('serviceWorker' in navigator)) return

  navigator.serviceWorker.controller?.postMessage({
    type: 'ENCERRAR_CHAMADA',
    chamada_id: chamadaId,
  })
}

async function iniciar(id) {
  if (!id || usuarioId === id) return

  if (canal) await supabase.removeChannel(canal)
  usuarioId = id

  canal = supabase
    .channel(`notificacao-chamadas:${id}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'chamadas',
        select: ['id', 'estado'],
      },
      ({ new: chamada }) => {
        if (!chamada?.id) return
        if (chamada.estado === 'chamando' || chamada.estado === 'aceita') return
        fecharNotificacao(chamada.id)
      },
    )
    .subscribe()
}

async function parar() {
  usuarioId = null
  if (!canal) return

  await supabase.removeChannel(canal)
  canal = null
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type !== 'SINCRONIZAR_CHAMADA') return

    const parametros = new URLSearchParams()
    if (event.data.conversa_id) parametros.set('conversa', event.data.conversa_id)
    if (event.data.chamada_id) parametros.set('chamada', event.data.chamada_id)

    window.location.assign(parametros.size ? `/?${parametros.toString()}` : '/')
  })
}

supabase.auth.getSession().then(({ data }) => {
  if (data.session?.user?.id) iniciar(data.session.user.id)
})

supabase.auth.onAuthStateChange((evento, sessao) => {
  if (evento === 'SIGNED_OUT' || !sessao?.user?.id) {
    parar()
    return
  }

  iniciar(sessao.user.id)
})
