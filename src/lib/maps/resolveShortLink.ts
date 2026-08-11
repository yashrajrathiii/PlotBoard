import { supabase } from '../supabase'
import type { LatLng } from '../geo'

/**
 * Resolves a `maps.app.goo.gl` short link to coordinates via the
 * `resolve-maps-link` Edge Function.
 *
 * Short links carry no coordinates — they only appear after following the
 * redirect, which the browser cannot do cross-origin. Since the Google Maps
 * app's share sheet produces exactly this form, it is what a broker on a phone
 * will paste most often.
 *
 * Lives here rather than in `geo.ts` on purpose: `geo.ts` stays free of any
 * Supabase import so the coordinate parsing can be unit-tested under `tsx`
 * without environment variables.
 */
export async function resolveShortLink(
  url: string,
): Promise<{ point: LatLng } | { error: string }> {
  try {
    const { data, error } = await supabase.functions.invoke<{
      ok?: boolean
      lat?: number
      lng?: number
      error?: string
    }>('resolve-maps-link', { body: { url } })

    if (error) {
      // A FunctionsHttpError carries the body; anything else is a network fault.
      const ctx = (error as { context?: unknown }).context
      if (ctx && typeof (ctx as Response).json === 'function') {
        const parsed = (await (ctx as Response).json().catch(() => null)) as
          | { error?: string }
          | null
        if (parsed?.error) return { error: parsed.error }
      }
      return { error: 'Could not open that link. Check your connection.' }
    }

    if (data?.ok && typeof data.lat === 'number' && typeof data.lng === 'number') {
      return { point: { lat: data.lat, lng: data.lng } }
    }
    return {
      error:
        data?.error ??
        'Could not read a location from that link. Long-press the plot in Google Maps and copy the numbers.',
    }
  } catch {
    return { error: 'Could not open that link. Check your connection.' }
  }
}
