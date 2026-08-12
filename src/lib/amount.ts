/**
 * Indian magnitude shorthand — "5.5k", "4L", "1Cr".
 *
 * Brokers quote in lakhs and crores, so making them type `400000` is both slow
 * and a zero-counting exercise. A wrong zero is invisible once saved: nothing on
 * the card looks obviously absurd at 10× the real price.
 *
 * This module is the single source of truth for the multipliers. They used to
 * live privately inside `listingParser.ts`; that parser now imports from here so
 * the two can't drift apart — the free-text parser and the rate field must agree
 * on what "L" means.
 */

export type Magnitude = 'k' | 'l' | 'cr'

/** The three offered as chips, smallest first. */
export const MAGNITUDES: { key: Magnitude; label: string; factor: number }[] = [
  { key: 'k', label: 'K', factor: 1_000 },
  { key: 'l', label: 'L', factor: 1_00_000 },
  { key: 'cr', label: 'Cr', factor: 1_00_00_000 },
]

const FACTOR: Record<Magnitude, number> = { k: 1_000, l: 1_00_000, cr: 1_00_00_000 }

/**
 * Every spelling that appears in a broker's message. Returns 1 for an absent or
 * unrecognised word so callers can multiply unconditionally.
 */
export function magnitudeFactor(word: string | undefined): number {
  if (!word) return 1
  const w = word.trim().toLowerCase()
  if (/^(k|thousand)$/.test(w)) return FACTOR.k
  if (/^(l|lac|lakh|lakhs)$/.test(w)) return FACTOR.l
  if (/^(cr|crore|crores)$/.test(w)) return FACTOR.cr
  return 1
}

/** The multiplier for a selected chip; 1 when nothing is selected. */
export function factorOf(magnitude: Magnitude | null): number {
  return magnitude ? FACTOR[magnitude] : 1
}

/** Which chip a spelling corresponds to, or null if it isn't a magnitude. */
function magnitudeKey(word: string | undefined): Magnitude | null {
  if (!word) return null
  const w = word.trim().toLowerCase()
  if (/^(k|thousand)$/.test(w)) return 'k'
  if (/^(l|lac|lakh|lakhs)$/.test(w)) return 'l'
  if (/^(cr|crore|crores)$/.test(w)) return 'cr'
  return null
}

/**
 * Parse what someone typed or pasted into an amount field.
 *
 *   "5.5k"      → { value: 5500,    magnitude: 'k' }
 *   "4L"        → { value: 400000,  magnitude: 'l' }
 *   "₹45,00,000"→ { value: 4500000, magnitude: null }
 *   "1850"      → { value: 1850,    magnitude: null }
 *   "" / "abc" / "4LL" → null
 *
 * THIS EXISTS TO REPLACE `parseFloat`. `parseFloat("5.5k")` returns 5.5, not
 * NaN — so a rate field that accepts text and still uses parseFloat saves ₹5.5
 * where the broker meant ₹5,500, passes every validity check, and looks
 * plausible on the card. Anything reading an amount from a text input must come
 * through here.
 */
export function parseAmountInput(
  raw: string,
): { value: number; magnitude: Magnitude | null } | null {
  // Tolerate a pasted formatted amount: "₹45,00,000" or "45 00 000".
  const text = raw.trim().replace(/[₹,\s]/g, '')
  if (!text) return null

  const m = text.match(/^(\d+(?:\.\d+)?)(k|thousand|l|lac|lakhs?|cr|crores?)?$/i)
  if (!m) return null

  const base = parseFloat(m[1])
  if (!Number.isFinite(base)) return null

  const magnitude = magnitudeKey(m[2])
  const value = base * magnitudeFactor(m[2])
  if (!Number.isFinite(value)) return null

  return { value, magnitude }
}

/** Drops a trailing ".00" / ".50" → ".5" so the field reads cleanly. */
function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s
}

/**
 * The inverse, used when reopening a saved listing for editing:
 *   400000    → { display: '4',    magnitude: 'l' }
 *   10000000  → { display: '1',    magnitude: 'cr' }
 *   1850      → { display: '1850', magnitude: null }
 *
 * DELIBERATELY NEVER DECOMPOSES BELOW ONE LAKH. A ₹1,850/sqft rate must reopen
 * as `1850`, not `1.85 K` — splitting small numbers makes the field harder to
 * read than the raw digits it was meant to replace. K stays available for
 * typing, but is never auto-selected, so a rate entered as "5.5K" reappears as
 * "5500". Lossless in value, and unambiguous, which matters more here.
 */
export function splitAmount(value: number): { display: string; magnitude: Magnitude | null } {
  if (!Number.isFinite(value) || value <= 0) {
    return { display: value ? String(value) : '', magnitude: null }
  }
  // Only split when the result is a clean number — 4 L reads well, 1.8734 L
  // does not, and the raw digits are clearer in that case.
  const isClean = (q: number) => Math.abs(q * 100 - Math.round(q * 100)) < 1e-9

  for (const key of ['cr', 'l'] as const) {
    const q = value / FACTOR[key]
    if (q >= 1 && isClean(q)) {
      return { display: trimZeros(q.toFixed(2)), magnitude: key }
    }
  }
  return { display: trimZeros(String(value)), magnitude: null }
}
