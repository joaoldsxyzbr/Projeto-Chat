if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        updateViaCache: 'none',
      })

      // Mantém o PWA atualizado sem consultar o service worker em segundo plano.
      window.setInterval(() => {
        if (document.visibilityState === 'visible') {
          registration.update().catch(() => {})
        }
      }, 60 * 60 * 1000)
    } catch (error) {
      console.error('Falha ao registrar o service worker:', error)
    }
  })
}
