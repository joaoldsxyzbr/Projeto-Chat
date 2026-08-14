const CACHE_NAME = 'projeto-chat-v4'
const STATIC_ASSETS = [
  '/manifest.webmanifest',
  '/chat-icon.svg',
  '/icons/favicon-32.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.pathname === '/sw.js') return

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request))
    return
  }

  if (url.pathname.startsWith('/assets/')) {
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

    if (janelas.some((janela) => janela.visibilityState === 'visible')) return

    await self.registration.showNotification(payload.title || 'Projeto Chat', {
      body: payload.body || 'Você recebeu uma nova mensagem.',
      icon: '/icons/icon-192.png',
      badge: '/icons/favicon-32.png',
      tag: payload.conversa_id ? `conversa-${payload.conversa_id}` : 'projeto-chat',
      renotify: true,
      data: {
        conversa_id: payload.conversa_id || null,
        url: '/',
      },
    })
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  event.waitUntil((async () => {
    const janelas = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    })

    if (janelas.length > 0) {
      await janelas[0].focus()
      return
    }

    await self.clients.openWindow('/')
  })())
})
