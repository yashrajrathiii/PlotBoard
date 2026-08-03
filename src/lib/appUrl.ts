/**
 * The public base URL of the app, used for links that leave the browser —
 * invite emails and shared WhatsApp invite links.
 *
 * These must NOT use window.location.origin: an admin sending an invite from
 * localhost would mint a `http://localhost:5173/welcome` link, which is dead
 * on the recipient's phone. VITE_APP_URL pins it to the deployed site
 * regardless of where the admin happens to be working.
 *
 * Falls back to the current origin so local development still works when the
 * variable isn't set.
 */
export function appUrl(path = ''): string {
  const configured = (import.meta.env.VITE_APP_URL as string | undefined)?.trim()
  const base = (configured || window.location.origin).replace(/\/+$/, '')
  return path ? `${base}${path.startsWith('/') ? path : `/${path}`}` : base
}
