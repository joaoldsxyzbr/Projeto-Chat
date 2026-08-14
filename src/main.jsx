import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'
import './functional.css'
import './realtime.css'
import './mobile.css'
import './pwa.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  let hadController = Boolean(navigator.serviceWorker.controller)
  let reloadingForServiceWorker = false

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
