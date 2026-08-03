import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

/**
 * Reload once when a new service worker takes control.
 *
 * The SW is built with skipWaiting + clientsClaim, so a new version activates
 * immediately after a deploy — but the page already running keeps executing
 * the OLD cached bundle until something reloads it. Without this, brokers sit
 * on a stale build after every deploy and think the update "didn't work"
 * (exactly how the Map View tab appeared missing in production).
 *
 * The `refreshing` guard prevents a reload loop if control changes again
 * during the reload.
 */
let refreshing = false
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  if (refreshing) return
  refreshing = true
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
