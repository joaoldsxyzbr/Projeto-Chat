if ('serviceWorker' in navigator) {
  let hadController = Boolean(navigator.serviceWorker.controller)
  let reloadingForServiceWorker = false

  if ('caches' in window) {
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key === 'projeto-chat-v1' || key === 'projeto-chat-v2')
          .map((key) => caches.delete(key)),
      ),
    )
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true
      return
    }

    if (reloadingForServiceWorker) return
    reloadingForServiceWorker = true
    window.location.reload()
  })

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => registration.update())
      .catch((error) => {
        console.error('Falha ao registrar o service worker:', error)
      })
  })
}
