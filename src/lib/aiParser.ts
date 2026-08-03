import { supabase } from './supabase'
import {
  mergeParsed,
  ruleBasedParser,
  type ListingDraft,
  type ListingParser,
  type ParsedListing,
} from './listingParser'

/**
 * The parser the app actually uses: Gemini for understanding, rules as the
 * floor.
 *
 * Free text from brokers has a long tail that regex loses to — separators
 * ("sq/ft" vs "sq.ft"), Hinglish, typos, and above all the rate-vs-total
 * distinction, which needs reading comprehension rather than pattern matching.
 * A model handles those. But it can also be slow, rate-limited, or simply not
 * configured yet, and a broker mid-listing must never be blocked by any of
 * that.
 *
 * So both run: the rule-based parser first (instant, free, offline), then the
 * AI on top. AI values win where it produced one; rules fill every gap it left.
 * Any failure at all — no key, no network, timeout, bad reply — silently
 * returns the rule-based result, which is exactly the behaviour the app had
 * before this file existed.
 *
 * The Gemini key lives in the `parse-listing` Edge Function's secrets. It must
 * never become a VITE_* variable: unlike the Mapbox and Google browser keys,
 * it has no domain restriction to protect it once it's in the bundle.
 */

/** Beyond this the broker is better served by the instant rule-based result. */
const CLIENT_TIMEOUT_MS = 15_000

interface ParseResponse {
  ok?: boolean
  code?: string
  fields?: ListingDraft
  error?: string
}

async function callGemini(text: string): Promise<ListingDraft | null> {
  const invoke = supabase.functions
    .invoke<ParseResponse>('parse-listing', { body: { text } })
    .then(({ data, error }) => {
      if (error) throw error
      return data
    })

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('parse-listing timed out')), CLIENT_TIMEOUT_MS),
  )

  const data = await Promise.race([invoke, timeout])
  if (!data?.ok || !data.fields) return null
  return data.fields
}

export const smartParser: ListingParser = {
  async parse(text: string): Promise<ParsedListing> {
    const rules = await ruleBasedParser.parse(text)
    try {
      const ai = await callGemini(text)
      if (!ai || Object.keys(ai).length === 0) return rules
      return mergeParsed(rules, ai)
    } catch (e) {
      // Expected whenever the key isn't set or the user is offline. Log at
      // debug level only — a fallback that works is not a user-facing problem.
      console.debug('[PlotBoard] AI parse unavailable, using rules:', e)
      return rules
    }
  },
}
