const CACHE_NAME = 'projeto-chat-v6'
const STATIC_ASSETS = [
  '/manifest.webmanifest',
  '/chat-icon.svg',
  '/icons/favicon-32.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
]

const estadosClientes = new Map()

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)

    await Promise.allSettled(
      STATIC_ASSETS.map((asset) => cache.add(new Request(asset, { cache: 'reload' }))),
    )

    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(
      keys
        .filter((key) => key.startsWith('projeto-chat-') && key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    )
    await self.clients.claim()
  })())
})

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CHAT_STATE' || !event.source?.id) return

  estadosClientes.set(event.source.id, {
    conversa_id: event.data.conversa_id || null,
    visivel: Boolean(event.data.visivel),
    chat_aberto: Boolean(event.data.chat_aberto),
  })
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.pathname === '/sw.js') return

  if (request.mode === 'navigate' || url.pathname.startsWith('/assets/')) {
    event.respondWith(fetch(request))
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached

      return fetch(request).then((response) => {
        if (response.ok && STATIC_ASSETS.includes(url.pathname)) {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
        }
        return response
      })
    }),
  )
})

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let payload = {}

    try {
      payload = event.data?.json() || {}
    } catch {
      payload = { body: event.data?.text() || 'Nova mensagem' }
    }

    const janelas = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    })

    const conversaJaAberta = Boolean(payload.conversa_id) && janelas.some((janela) => {
      const estado = estadosClientes.get(janela.id)
      return janela.visibilityState === 'visible'
        && estado?.visivel
        && estado?.chat_aberto
        && estado?.conversa_id === payload.conversa_id
    })

    if (conversaJaAberta) return

    await self.registration.showNotification(payload.title || 'Projeto Chat', {
      body: payload.body || 'Você recebeu uma nova mensagem.',
      icon: '/icons/icon-192.png',
      badge: '/icons/favicon-32.png',
      tag: payload.conversa_id ? `conversa-${payload.conversa_id}` : 'projeto-chat',
      renotify: true,
      data: {
        conversa_id: payload.conversa_id || null,
      },
    })
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  event.waitUntil((async () => {
    const conversaId = event.notification.data?.conversa_id || null
    const janelas = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    })

    if (janelas.length > 0) {
      const janela = janelas.find((item) => item.visibilityState === 'visible') || janelas[0]

      if (conversaId) {
        janela.postMessage({ type: 'ABRIR_CONVERSA', conversa_id: conversaId })
      }

      await janela.focus()
      return
    }

    const destino = conversaId ? `/?conversa=${encodeURIComponent(conversaId)}` : '/'
    await self.clients.openWindow(destino)
  })())
})
