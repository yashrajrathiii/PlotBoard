/**
 * The notification chime.
 *
 * Synthesised with the Web Audio API rather than shipped as an audio file: no
 * bytes added to a bundle that brokers download over mobile data, nothing to
 * cache, and it works offline. Two short notes, a rising fifth — enough to
 * notice, short enough not to grate on the twentieth listing of the day.
 *
 * EVERY FAILURE IS SWALLOWED. Browsers block audio until the user has
 * interacted with the page, so the first notification after a cold start may be
 * silent; a suspended AudioContext or a missing API must never stop a
 * notification from appearing. A silent chime is a shrug, a thrown error is a
 * broken notification.
 */

const MUTE_KEY = 'ld_notification_muted'

export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

export function setMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
  } catch {
    /* private mode — the preference just won't persist */
  }
}

/**
 * One AudioContext for the session. Created lazily on first play: constructing
 * one before a user gesture starts it `suspended`, and browsers cap how many a
 * page may hold.
 */
let ctx: AudioContext | null = null

function context(): AudioContext | null {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx ??= new Ctor()
    // Autoplay policy may have parked it; resuming is a no-op when running.
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
    return ctx
  } catch {
    return null
  }
}

/** A single note. Gain is ramped, never switched — a hard stop clicks. */
function note(ac: AudioContext, freq: number, startAt: number, duration: number, peak: number) {
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, startAt)
  gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration)
  osc.connect(gain).connect(ac.destination)
  osc.start(startAt)
  osc.stop(startAt + duration + 0.02)
}

/** Play the chime, unless muted. Safe to call from anywhere, at any time. */
export function playNotificationSound(): void {
  if (isMuted()) return
  try {
    const ac = context()
    if (!ac) return
    const t = ac.currentTime
    note(ac, 880, t, 0.12, 0.14) // A5
    note(ac, 1318.5, t + 0.1, 0.18, 0.11) // E6
  } catch {
    /* audio is a nicety; never let it break a notification */
  }
}
