function atualizarAlturaViewport() {
  const viewport = window.visualViewport
  const altura = Math.round(viewport?.height || window.innerHeight)
  document.documentElement.style.setProperty('--app-height', `${altura}px`)
}

atualizarAlturaViewport()

window.addEventListener('resize', atualizarAlturaViewport, { passive: true })
window.addEventListener('orientationchange', atualizarAlturaViewport, { passive: true })

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', atualizarAlturaViewport, { passive: true })
  window.visualViewport.addEventListener('scroll', atualizarAlturaViewport, { passive: true })
}
