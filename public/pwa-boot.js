if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        updateViaCache: 'none',
      })

      await registration.update()

      // Mantém o PWA atualizado sem recarregar uma conversa em andamento.
      window.setInterval(() => {
        registration.update().catch(() => {})
      }, 60 * 60 * 1000)
    } catch (error) {
      console.error('Falha ao registrar o service worker:', error)
    }
  })
}
