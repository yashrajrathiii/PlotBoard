import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

/**
 * Keeping an installed PWA on the current build.
 *
 * The SW ships with skipWaiting + clientsClaim, so a new version activates as
 * soon as the browser *notices* it — but a running page keeps executing the OLD
 * bundle until something reloads it, and the browser only checks for a new SW
 * on a fresh navigation. An installed PWA resumed from the background can
 * therefore sit on a build that is days old, which has now cost real time three
 * times: the Map View tab, the Import button, and the share dialog all looked
 * unshipped when they were live.
 *
 * Two halves:
 *   1. Ask for an update check whenever the app returns to the foreground.
 *   2. Reload when a new worker takes control — but never over unsaved work.
 */

/**
 * Is the broker in the middle of typing something a reload would destroy?
 *
 * Deliberately conservative, and deliberately not route-based:
 *   - any non-empty <textarea> anywhere — the Import and Add-from-map
 *     description boxes are NOT inside a <form>, and a pasted WhatsApp message
 *     is exactly the thing you don't want to vaporise;
 *   - any non-empty field inside a <form> — every real data-entry surface
 *     (add/edit listing, invite, login, settings, welcome) uses one.
 *
 * The board's search box is a bare <input> outside any form, so filtering never
 * blocks an update. Note the add-listing form pre-fills city/state, so it always
 * counts as dirty — which is the behaviour we want: never reload that screen.
 */
function hasUnsavedWork(): boolean {
  for (const ta of document.querySelectorAll('textarea')) {
    if (!ta.disabled && ta.value.trim()) return true
  }
  for (const form of document.querySelectorAll('form')) {
    for (const el of form.querySelectorAll('input, textarea')) {
      const field = el as HTMLInputElement | HTMLTextAreaElement
      if (field.disabled || (field as HTMLInputElement).type === 'hidden') continue
      if (field.value.trim()) return true
    }
  }
  return false
}

let refreshing = false
let pendingReload = false
let retryTimer: number | undefined

function reloadWhenSafe() {
  if (refreshing) return
  if (hasUnsavedWork()) {
    // Hold the update rather than dropping it: re-check periodically so it
    // lands the moment they leave the form, not at the next cold start.
    pendingReload = true
    retryTimer ??= window.setInterval(() => {
      if (!hasUnsavedWork()) {
        window.clearInterval(retryTimer)
        retryTimer = undefined
        reloadWhenSafe()
      }
    }, 5000)
    return
  }
  refreshing = true
  window.location.reload()
}

// `refreshing` also guards against a reload loop if control changes again
// while the page is on its way down.
navigator.serviceWorker?.addEventListener('controllerchange', reloadWhenSafe)

/** Don't hammer the network if the app is being switched to repeatedly. */
let lastCheck = 0
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return
  if (pendingReload) {
    reloadWhenSafe()
    return
  }
  if (Date.now() - lastCheck < 30_000) return
  lastCheck = Date.now()
  // A conditional request the browser answers from cache when unchanged, so
  // this is cheap even on mobile data.
  void navigator.serviceWorker
    ?.getRegistration()
    .then((reg) => reg?.update())
    .catch(() => {
      /* offline, or no SW in dev — nothing to do */
    })
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
