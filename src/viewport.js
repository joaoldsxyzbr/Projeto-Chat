let alturaAplicada = 0
let framePendente = null

function atualizarAlturaViewport() {
  framePendente = null

  const viewport = window.visualViewport
  const altura = Math.round(viewport?.height || window.innerHeight)

  if (altura === alturaAplicada) return

  alturaAplicada = altura
  document.documentElement.style.setProperty('--app-height', `${altura}px`)
}

function agendarAtualizacaoViewport() {
  if (framePendente !== null) return
  framePendente = requestAnimationFrame(atualizarAlturaViewport)
}

atualizarAlturaViewport()

window.addEventListener('resize', agendarAtualizacaoViewport, { passive: true })
window.addEventListener('orientationchange', agendarAtualizacaoViewport, { passive: true })

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', agendarAtualizacaoViewport, { passive: true })
}
