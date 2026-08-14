import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = 'BBW4xJuaj_vkcx9NRgOge9cbP_Kjw25ldrGP9HilFeiNe1IDuJN5I1a5mKhMHxiWhwMezM8zTNjo3rWI7_xdyQ8'
const SUPORTA_PUSH = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

let atualizandoInterface = false
let sincronizando = false

function chaveParaUint8Array(valor) {
  const padding = '='.repeat((4 - (valor.length % 4)) % 4)
  const base64 = (valor + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)))
}

async function obterAssinatura() {
  if (!SUPORTA_PUSH) return null
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

async function salvarAssinatura(usuarioId, assinatura) {
  const json = assinatura.toJSON()
  const dados = {
    usuario_id: usuarioId,
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
    atualizado_em: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('assinaturas_push')
    .upsert(dados, { onConflict: 'endpoint' })

  if (!error) return assinatura

  await assinatura.unsubscribe()

  const registration = await navigator.serviceWorker.ready
  const novaAssinatura = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: chaveParaUint8Array(VAPID_PUBLIC_KEY),
  })

  const nova = novaAssinatura.toJSON()
  const { error: novoErro } = await supabase.from('assinaturas_push').insert({
    usuario_id: usuarioId,
    endpoint: nova.endpoint,
    p256dh: nova.keys?.p256dh,
    auth: nova.keys?.auth,
  })

  if (novoErro) throw novoErro
  return novaAssinatura
}

async function garantirAssinatura(solicitarPermissao = false) {
  if (!SUPORTA_PUSH || sincronizando) return false
  sincronizando = true

  try {
    const { data } = await supabase.auth.getSession()
    const usuarioId = data.session?.user?.id
    if (!usuarioId) return false

    let permissao = Notification.permission
    if (permissao === 'default' && solicitarPermissao) {
      permissao = await Notification.requestPermission()
    }

    if (permissao !== 'granted') return false

    const registration = await navigator.serviceWorker.ready
    let assinatura = await registration.pushManager.getSubscription()

    if (!assinatura) {
      assinatura = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: chaveParaUint8Array(VAPID_PUBLIC_KEY),
      })
    }

    await salvarAssinatura(usuarioId, assinatura)
    return true
  } catch (error) {
    console.error('Falha ao ativar notificações:', error)
    return false
  } finally {
    sincronizando = false
    agendarInterface()
  }
}

async function atualizarBotao() {
  const botao = document.querySelector('.notification-toggle')
  if (!botao) return

  if (!SUPORTA_PUSH) {
    botao.hidden = true
    return
  }

  const assinatura = await obterAssinatura().catch(() => null)
  const ativa = Notification.permission === 'granted' && Boolean(assinatura)
  const bloqueada = Notification.permission === 'denied'

  botao.classList.toggle('active', ativa)
  botao.textContent = bloqueada ? '🔕' : '🔔'
  botao.setAttribute(
    'aria-label',
    ativa ? 'Notificações ativas' : bloqueada ? 'Notificações bloqueadas' : 'Ativar notificações',
  )
  botao.title = ativa
    ? 'Notificações ativas'
    : bloqueada
      ? 'Notificações bloqueadas no navegador'
      : 'Ativar notificações'
}

function instalarBotao() {
  const footer = document.querySelector('.sidebar-footer')
  if (!footer || footer.querySelector('.notification-toggle')) return

  const botao = document.createElement('button')
  botao.type = 'button'
  botao.className = 'icon-button notification-toggle'
  botao.textContent = '🔔'
  botao.setAttribute('aria-label', 'Ativar notificações')

  botao.addEventListener('click', async () => {
    if (Notification.permission === 'denied') {
      window.alert('As notificações estão bloqueadas. Libere a permissão do Projeto Chat nas configurações do navegador.')
      return
    }

    botao.disabled = true
    await garantirAssinatura(true)
    botao.disabled = false
  })

  const sair = footer.querySelector('button[aria-label="Sair"]')
  footer.insertBefore(botao, sair || null)
  atualizarBotao()
}

function agendarInterface() {
  if (atualizandoInterface) return
  atualizandoInterface = true

  requestAnimationFrame(() => {
    atualizandoInterface = false
    instalarBotao()
    atualizarBotao()
  })
}

if (SUPORTA_PUSH) {
  const observer = new MutationObserver(agendarInterface)
  observer.observe(document.documentElement, { childList: true, subtree: true })

  supabase.auth.getSession().then(({ data }) => {
    if (data.session && Notification.permission === 'granted') garantirAssinatura(false)
    agendarInterface()
  })

  supabase.auth.onAuthStateChange(async (evento, sessao) => {
    if (evento === 'SIGNED_OUT') {
      const assinatura = await obterAssinatura().catch(() => null)
      if (assinatura) await assinatura.unsubscribe().catch(() => {})
    } else if (sessao && Notification.permission === 'granted') {
      garantirAssinatura(false)
    }

    agendarInterface()
  })
}
