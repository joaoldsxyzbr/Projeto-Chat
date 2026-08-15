import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import './styles.css'
import './functional.css'
import './realtime.css'
import './mobile.css'
import './pwa.css'
import './notifications.css'
import './audio.css'
import './quality.css'
import './viewport.js'
import './network.js'
import './delivery.js'
import './notifications.js'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
