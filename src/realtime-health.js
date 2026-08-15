import { supabase } from './supabase'

let restaurando = null

async function restaurarRealtime() {
  if (!navigator.onLine) return false
  if (restaurando) return restaurando

  restaurando = (async () => {
    try {
      const { data, error } = await supabase.auth.getSession()
      if (error || !data.session?.access_token) return false

      await supabase.realtime.setAuth(data.session.access_token)
      supabase.realtime.connect()
      return true
    } catch (error) {
      console.error('Falha ao restaurar conexão em tempo real:', error)
      return false
    }
  })()

  try {
    return await restaurando
  } finally {
    restaurando = null
  }
}

window.addEventListener('online', restaurarRealtime)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') restaurarRealtime()
})

supabase.auth.onAuthStateChange((_evento, sessao) => {
  if (!sessao?.access_token) return

  supabase.realtime
    .setAuth(sessao.access_token)
    .then(() => supabase.realtime.connect())
    .catch((error) => console.error('Falha ao atualizar autenticação do Realtime:', error))
})

restaurarRealtime()
