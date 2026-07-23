// Each browser/app install gets one stable random id, persisted locally.
// This is what the 2-device limit counts: two browsers on one phone are two
// devices, and clearing site data frees the slot (the stale row gets evicted
// at the next third-device login).
const DEVICE_ID_KEY = 'pb_device_id'

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

/** Human-readable label shown in the device picker, e.g. "Chrome on Android". */
export function getDeviceName(): string {
  const ua = navigator.userAgent
  const browser = /edg/i.test(ua)
    ? 'Edge'
    : /chrome|crios/i.test(ua)
      ? 'Chrome'
      : /firefox|fxios/i.test(ua)
        ? 'Firefox'
        : /safari/i.test(ua)
          ? 'Safari'
          : 'Browser'
  const os = /android/i.test(ua)
    ? 'Android'
    : /iphone|ipad|ipod/i.test(ua)
      ? 'iPhone/iPad'
      : /windows/i.test(ua)
        ? 'Windows'
        : /mac/i.test(ua)
          ? 'Mac'
          : 'Device'
  return `${browser} on ${os}`
}
