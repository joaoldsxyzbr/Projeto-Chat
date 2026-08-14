import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'
import './functional.css'
import './realtime.css'
import './mobile.css'
import './pwa.css'
import './notifications.css'
import './audio.css'
import './notifications.js'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
