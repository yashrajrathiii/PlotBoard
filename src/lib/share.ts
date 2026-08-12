import { addressOneLine, type Listing } from './types'
import { formatAreaEntered, formatFront } from './format'

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
 * TWO RULES THAT ARE DELIBERATE AND MUST NOT BE "FIXED" BACK:
 *
 * 1. **No price ever leaves the app.** Not the rate, not the total, not even
 *    when the poster marked the rate public. There is no parameter to switch
 *    this on — the guarantee is structural, because a flag would eventually be
 *    passed wrongly by some future caller. Members still see rates *inside*
 *    the app; that gate lives in the card and detail views and is a separate
 *    question from what gets forwarded to an outsider.
 *
 * 2. **The contact is the SHARER, not the poster.** On a board of competing
 *    brokers, forwarding someone else's listing with the original poster's
 *    number routes the enquiry straight past the person who sent it. The
 *    poster's `contact_type` is deliberately omitted too: it describes *their*
 *    relationship to the property, so printing it beside the sharer's name
 *    would be actively misleading.
 */
export function buildShareText(l: Listing, sharer: Sharer | null): string {
  const lines = [
    `*${l.property_type} — ${l.address_line1}, ${l.city}*`,
    `Address: ${addressOneLine(l)}`,
    `Size: ${formatAreaEntered(l.area, l.area_unit)}`,
  ]
  if (l.front) lines.push(`Front: ${formatFront(l.front, l.front_unit)}`)
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
export function buildMultiShareText(listings: Listing[], sharer: Sharer | null): string {
  return listings
    .map((l) => buildShareText(l, sharer))
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
