// Indian-format numbers everywhere: brokers think in lakhs and crores.

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

/** ₹12,34,567 (full Indian grouping) */
export function formatINR(n: number): string {
  return `₹${inr.format(n)}`
}

/** ₹5.66 Cr / ₹44.4 L / ₹85,000 — compact for card display */
export function formatINRCompact(n: number): string {
  if (n >= 1_00_00_000) {
    return `₹${trimZeros((n / 1_00_00_000).toFixed(2))} Cr`
  }
  if (n >= 1_00_000) {
    return `₹${trimZeros((n / 1_00_000).toFixed(2))} L`
  }
  return formatINR(n)
}

function trimZeros(s: string): string {
  return s.replace(/\.?0+$/, '')
}

const inrArea = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })

/** "3.5 acre" / "2,400 sqft" — as the poster entered it, decimals kept */
export function formatAreaEntered(area: number, unit: 'acre' | 'sqft'): string {
  return `${inrArea.format(area)} ${unit}`
}

/**
 * "₹1,850/sqft" / "₹80,00,000/acre" — in the unit the poster quoted.
 * Always use this rather than hardcoding "/sqft", or per-acre listings will be
 * misreported (most damagingly in the WhatsApp share text).
 *
 * The unit defaults to 'sqft' so this renders correctly against a database
 * where migration 010 hasn't run yet (the column is simply absent) — matching
 * the old behaviour exactly rather than printing "/undefined".
 */
export function formatRateEntered(rate: number, unit: 'sqft' | 'acre' = 'sqft'): string {
  return `${formatINR(rate)}/${unit ?? 'sqft'}`
}

/** "30 ft" / "9.5 m" — road frontage as entered. */
export function formatFront(front: number, unit: 'ft' | 'm' = 'ft'): string {
  return `${inrArea.format(front)} ${unit ?? 'ft'}`
}

export function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
