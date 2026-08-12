/// <reference types="google.maps" />
import type { LatLng } from '../geo'

/**
 * Plus Code (Open Location Code) — `8H3H+9WX` or the full `7JVW52GR+2V`.
 *
 * The alphabet excludes vowels and easily-confused characters on purpose, so
 * this is a fairly precise test: `20` and `A` can never appear in one.
 */
const PLUS_CODE_RE = /\b[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}\b/i

export function isPlusCode(input: string): boolean {
  return PLUS_CODE_RE.test(input.trim())
}

/**
 * Turns free text — a Plus Code, an address, a village name — into coordinates
 * using the Google Geocoder the pin picker has already loaded.
 *
 * This is what makes Plus Codes work. A *full* code like `7JVW52GR+2V` could be
 * decoded arithmetically offline, but the form people actually share is the
 * SHORT one — `8H3H+9WX Tendua-1, Chhattisgarh` — which is meaningless without
 * resolving the locality that follows it. Google resolves both, so the whole
 * string goes over as-is rather than being pulled apart here.
 *
 * It doubles as the fallback for a plainly-typed place name, which matters
 * because the Places type-ahead is deprecated for newer Google Cloud projects
 * and may simply never produce a dropdown.
 *
 * Best-effort: null means "couldn't resolve", and the caller shows guidance.
 */
export interface GeocodeHit {
  point: LatLng
  /**
   * True when Google returned a *region* rather than a point — a village
   * centroid, a district, a postal area.
   *
   * This distinction is the whole reason plain place-name search is safe to
   * offer. A Plus Code resolves to a ~14 m square and can be trusted; "Tendua-1,
   * Chhattisgarh" resolves to the middle of the village and may be kilometres
   * from the plot. On screen the two pins look identical, so a broker would
   * save a badly-wrong location without ever noticing. The UI warns on this.
   */
  approximate: boolean
  /** Google's formatted address, shown so the broker can sanity-check it. */
  label?: string
}

export async function forwardGeocode(query: string): Promise<GeocodeHit | null> {
  const g = (window as unknown as { google?: typeof google }).google
  if (!g?.maps?.Geocoder) return null

  try {
    const geocoder = new g.maps.Geocoder()
    const { results } = await geocoder.geocode({
      address: query,
      // Bias to India. A bare Plus Code with no locality is ambiguous
      // world-wide, and an unbiased lookup happily lands in another continent.
      componentRestrictions: { country: 'IN' },
    })
    const best = results?.[0]
    const loc = best?.geometry?.location
    if (!loc) return null
    const lt = best.geometry.location_type

    // Judge on `types`, not `location_type`.
    //
    // Google returns a Plus Code as GEOMETRIC_CENTER — the same value it uses
    // for a road's midpoint — even though `8H3H+9WX` pins a ~4 m square. Keying
    // off location_type alone therefore flagged every Plus Code as approximate,
    // and a warning that fires on everything is one brokers stop reading.
    const types = best.types ?? []
    const isPlusCodeHit = types.includes('plus_code')
    const coarseType = types.some((t) =>
      /^(locality|sublocality|postal_code|administrative_area|political|country|route|neighborhood)/.test(t),
    )
    const approximate =
      !isPlusCodeHit &&
      (lt === g.maps.GeocoderLocationType.APPROXIMATE || coarseType)

    return {
      point: { lat: loc.lat(), lng: loc.lng() },
      approximate,
      label: best.formatted_address,
    }
  } catch (e) {
    // ZERO_RESULTS arrives here as a rejection, and is entirely normal — the
    // broker mistyped a village name. Only surface the configuration problem,
    // and only once, matching reverseGeocode's behaviour.
    const msg = e instanceof Error ? e.message : String(e)
    if (!warned && /REQUEST_DENIED|not allowed/i.test(msg)) {
      warned = true
      console.warn(
        '[LD Board] Address/Plus Code search is off: enable the "Geocoding API" in ' +
          'Google Cloud and add it to the browser key\'s API restrictions. ' +
          'Original error: ' +
          msg,
      )
    }
    return null
  }
}

/** Only warn once per session — retyping a name shouldn't spam the log. */
let warned = false
