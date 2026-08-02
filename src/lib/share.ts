import { addressOneLine, type Listing } from './types'
import { formatAreaEntered, formatINR, formatFront, formatRateEntered } from './format'

/**
 * The text block shared via WhatsApp / clipboard. *asterisks* render as bold
 * in WhatsApp. Includes a Google Maps link to the exact pin.
 * When the poster keeps the rate private (rate_visible=false) and the person
 * sharing isn't the poster, rate and total are replaced with "On request".
 */
export function buildShareText(l: Listing, canSeeRate: boolean): string {
  const lines = [
    `*${l.property_type} — ${l.address_line1}, ${l.city}*`,
    `Address: ${addressOneLine(l)}`,
    `Size: ${formatAreaEntered(l.area, l.area_unit)}`,
  ]
  if (l.front) lines.push(`Front: ${formatFront(l.front, l.front_unit)}`)
  if (canSeeRate) {
    lines.push(
      `Rate: ${formatRateEntered(l.rate, l.rate_unit)}`,
      `Total: ${formatINR(l.deal_value)}`,
    )
  } else {
    lines.push('Rate: On request')
  }
  lines.push(`Status: ${l.status}`)
  if (l.notes) lines.push(`Note: ${l.notes}`)
  lines.push(`Map: https://www.google.com/maps?q=${l.latitude},${l.longitude}`)
  if (l.poster) {
    lines.push(`Contact: ${l.poster.name} (${l.contact_type}) — +91 ${l.poster.phone}`)
  }
  return lines.join('\n')
}

/** Joins several listing blocks into one share message, divider between each. */
export function buildMultiShareText(
  items: { listing: Listing; canSeeRate: boolean }[],
): string {
  return items
    .map((i) => buildShareText(i.listing, i.canSeeRate))
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
