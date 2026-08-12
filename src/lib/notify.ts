// System (OS) pop-up notifications. On an installed PWA these are shown by
// the service worker so they appear as real Android/iOS notifications while
// the app is open or backgrounded. (True push when the app is fully closed
// needs Web Push + a server sender — see the notifications follow-up.)

export type NotificationKind = 'new_listing' | 'sold' | 'status_change'

export function notificationTitle(kind: string): string {
  switch (kind) {
    case 'new_listing':
      return 'New listing on LD Board'
    case 'sold':
      return 'A listing was sold'
    case 'status_change':
      return 'Listing status changed'
    default:
      return 'LD Board'
  }
}

export function canAskNotificationPermission(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!canAskNotificationPermission()) return 'denied'
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}

/** Show an OS notification, preferring the service worker registration. */
export async function showSystemNotification(title: string, body: string) {
  if (!canAskNotificationPermission() || Notification.permission !== 'granted') return
  const options: NotificationOptions = {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: 'plotboard-notification',
  }
  try {
    const reg = await navigator.serviceWorker?.ready
    if (reg) {
      await reg.showNotification(title, options)
      return
    }
  } catch {
    // fall through to the page-level Notification below
  }
  try {
    new Notification(title, options)
  } catch {
    // no-op: some browsers only allow SW-shown notifications
  }
}
