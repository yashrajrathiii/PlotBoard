/// <reference types="google.maps" />
import type { LatLng } from '../geo'

export interface PlaceAddress {
  /** The neighbourhood/colony — "Gudhiyari", "Shankar Nagar", "Tagore Nagar". */
  locality?: string
  /** The town or city — "Raipur", "Bhilai". */
  city?: string
  state?: string
  pincode?: string
}

/**
 * Turns a dropped pin into a human address using the Google Maps SDK that the
 * pin picker has already loaded.
 *
 * Brokers think in colony names, not coordinates, so this deliberately returns
 * the **sublocality** ("Gudhiyari") rather than the full formatted address —
 * a plot's address line should read like a broker would say it, not like a
 * postal label.
 *
 * Best-effort: a failure just means the broker types the address themselves.
 */
export async function reverseGeocode(point: LatLng): Promise<PlaceAddress | null> {
  const g = (window as unknown as { google?: typeof google }).google
  if (!g?.maps?.Geocoder) return null

  try {
    const geocoder = new g.maps.Geocoder()
    const { results } = await geocoder.geocode({
      location: { lat: point.lat, lng: point.lng },
    })
    if (!results || results.length === 0) return null

    const out: PlaceAddress = {}
    // Scan every result, not just the first: the most precise result is often
    // a building or plus-code with no sublocality, while a broader one carries
    // the colony name. Keep the first value found for each component.
    for (const result of results) {
      for (const c of result.address_components) {
        const t = c.types
        if (!out.locality && (t.includes('sublocality_level_1') || t.includes('sublocality') || t.includes('neighborhood'))) {
          out.locality = c.long_name
        }
        if (!out.city && t.includes('locality')) out.city = c.long_name
        if (!out.state && t.includes('administrative_area_level_1')) out.state = c.long_name
        if (!out.pincode && t.includes('postal_code')) out.pincode = c.long_name
      }
    }

    // Fall back to the smallest administrative area if there's no colony —
    // better a village/tehsil name than nothing for rural agricultural land.
    if (!out.locality) {
      for (const result of results) {
        const c = result.address_components.find((x: google.maps.GeocoderAddressComponent) =>
          x.types.includes('administrative_area_level_3'),
        )
        if (c) {
          out.locality = c.long_name
          break
        }
      }
    }

    return out
  } catch (e) {
    // Most likely cause by far: the Geocoding API isn't enabled on the Google
    // Cloud project, or the browser key is restricted to Maps JS + Places
    // only. That fails as REQUEST_DENIED and is otherwise invisible, so say so
    // once instead of silently returning nothing.
    const msg = e instanceof Error ? e.message : String(e)
    if (!warned && /REQUEST_DENIED|not allowed/i.test(msg)) {
      warned = true
      console.warn(
        '[PlotBoard] Locality lookup is off: enable the "Geocoding API" in Google Cloud ' +
          'and add it to the browser key\'s API restrictions. Address fields will stay ' +
          'blank for map pins until then. Original error: ' +
          msg,
      )
    }
    return null
  }
}

/** Only warn once per session — a broker moving a pin shouldn't spam the log. */
let warned = false
