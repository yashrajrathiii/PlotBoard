import { addressOneLine, type Listing } from './types'
import { formatAreaEntered, formatFront, formatRateEntered } from './format'

/**
 * Whoever is doing the sharing — NOT the person who posted the listing.
 * `useAuth().profile` supplies this; phone is 10 bare digits.
 */
export interface Sharer {
  name: string
  phone: string
}

/**
 * The text block shared via WhatsApp / clipboard. *asterisks* render as bold
 * in WhatsApp. Includes a Google Maps link to the exact pin.
 *
 * THREE RULES THAT ARE DELIBERATE AND MUST NOT BE "FIXED" BACK:
 *
 * 1. **The deal value NEVER leaves the app.** There is no option for it. What a
 *    property totals is the poster's business and an outsider can work it out
 *    from the rate and the size if they need to.
 *
 * 2. **The rate leaves only on a double yes.** The sharer must opt in, AND the
 *    poster must have left the rate visible. That second test lives *inside*
 *    this function rather than at the call sites, so no caller can share a
 *    hidden rate by passing the wrong flag — the same reasoning that previously
 *    kept prices out altogether, narrowed rather than abandoned.
 *
 * 3. **The contact is the SHARER, not the poster.** On a board of competing
 *    brokers, forwarding someone else's listing with the original poster's
 *    number routes the enquiry straight past the person who sent it. The
 *    poster's `contact_type` is deliberately omitted too: it describes *their*
 *    relationship to the property, so printing it beside the sharer's name
 *    would be actively misleading.
 *
 * The listing's private third-party contact is not reachable from here at all:
 * it lives in its own RLS-scoped table and never appears on `Listing`.
 */
export function buildShareText(
  l: Listing,
  sharer: Sharer | null,
  opts: { videoIncluded?: boolean; includeRate?: boolean } = {},
): string {
  const lines = [
    `*${l.property_type} — ${l.address_line1}, ${l.city}*`,
    `Address: ${addressOneLine(l)}`,
    `Size: ${formatAreaEntered(l.area, l.area_unit)}`,
  ]
  if (l.front) lines.push(`Front: ${formatFront(l.front, l.front_unit)}`)
  // The double yes: the sharer asked for it AND the poster left it visible.
  // `rate_visible` is checked HERE, never at the call site — a caller passing
  // includeRate on a listing whose poster hid the rate still gets nothing.
  // Note this deliberately emits the RATE only; `deal_value` has no option.
  if (opts.includeRate && l.rate_visible) {
    lines.push(`Rate: ${formatRateEntered(l.rate, l.rate_unit)}`)
  }
  // Mention a walkthrough video the recipient isn't getting, so they know to
  // ask. Suppressed when the video is actually attached to this share.
  const hasVideo = l.listing_media.some((m) => m.media_type === 'video')
  if (hasVideo && !opts.videoIncluded) lines.push('Video available on request')
  lines.push(`Status: ${l.status}`)
  if (l.notes) lines.push(`Note: ${l.notes}`)
  lines.push(`Map: https://www.google.com/maps?q=${l.latitude},${l.longitude}`)
  if (sharer) {
    lines.push(`Contact: ${sharer.name} — +91 ${sharer.phone}`)
  }
  return lines.join('\n')
}

/**
 * Joins several listing blocks into one share message, divider between each.
 * The sharer is the same person for every block, so it is taken once.
 */
export function buildMultiShareText(
  listings: Listing[],
  sharer: Sharer | null,
  opts: { includeRate?: boolean } = {},
): string {
  // `includeRate` is a single request applied to every block, and each block
  // then answers for itself — buildShareText checks that listing's own
  // `rate_visible`. So a mixed selection needs no special handling: the ones
  // with public rates carry them, the hidden ones quietly don't.
  return listings
    .map((l) => buildShareText(l, sharer, { includeRate: opts.includeRate }))
    .join('\n\n———————————\n\n')
}

/**
 * wa.me with no phone number → WhatsApp opens its own contact picker.
 *
 * WhatsApp auto-generates a link-preview card from the FIRST url in the
 * message. For a multi-listing share that card only represents listing #1's
 * map, which is misleading — so `suppressPreview` prepends a zero-width space,
 * which stops most WhatsApp clients from generating any preview while leaving
 * every listing's map link intact and tappable in the message body.
 */
export function whatsappShareUrl(text: string, suppressPreview = false): string {
  const ZERO_WIDTH_SPACE = '​'
  const body = suppressPreview ? ZERO_WIDTH_SPACE + text : text
  return `https://wa.me/?text=${encodeURIComponent(body)}`
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Older/locked-down browsers: hidden-textarea fallback.
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}
