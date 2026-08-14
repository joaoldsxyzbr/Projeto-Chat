function atualizarEstadoConexao() {
  document.documentElement.dataset.conexao = navigator.onLine ? 'online' : 'offline'
}

atualizarEstadoConexao()
window.addEventListener('online', atualizarEstadoConexao, { passive: true })
window.addEventListener('offline', atualizarEstadoConexao, { passive: true })
