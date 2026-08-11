export interface LatLng {
  lat: number
  lng: number
}

const IN_BOUNDS = { latMin: 6.5, latMax: 37.5, lngMin: 68, lngMax: 97.5 }

export function withinIndia(p: LatLng): boolean {
  return (
    p.lat >= IN_BOUNDS.latMin &&
    p.lat <= IN_BOUNDS.latMax &&
    p.lng >= IN_BOUNDS.lngMin &&
    p.lng <= IN_BOUNDS.lngMax
  )
}

/** True for the short links Google's mobile share sheet produces. */
export function isShortMapsLink(input: string): boolean {
  return /\b(maps\.app\.goo\.gl|goo\.gl\/maps)\b/i.test(input)
}

/** A latitude, optionally signed. Kept loose — range is validated separately. */
const LAT = String.raw`-?\d{1,2}(?:\.\d+)?`
const LNG = String.raw`-?\d{1,3}(?:\.\d+)?`

/**
 * Accepts what brokers actually paste. Every pattern here came from a real
 * format someone tried:
 *
 *   21.2514, 81.6296              typed, or copied off a long-press
 *   21.2514° N, 81.6296° E        what Maps SHOWS on long-press
 *   Plot 42 — 21.2514, 81.6296    coordinates buried in a sentence
 *   .../@21.2514,81.6296,15z      desktop URL
 *   ?q= / ?query= / ?ll= / ?center= / ?daddr= / ?saddr=
 *   .../place/21.2514,81.6296
 *   !3d21.2514!4d81.6296          inside the `data=` segment of a place URL
 *   geo:21.2514,81.6296
 *
 * NOT handled here: `maps.app.goo.gl` short links, which carry no coordinates
 * at all — following the redirect is cross-origin and blocked in the browser,
 * so those go to the `resolve-maps-link` Edge Function instead. Use
 * `isShortMapsLink` to route them.
 *
 * Ordering matters: URL-parameter patterns are tried BEFORE the bare "lat,lng"
 * fallback, because a Maps URL also contains loose number pairs (zoom levels,
 * `data=` ids) that the loose pattern would happily mis-read.
 */
export function parseCoords(input: string): LatLng | null {
  const text = input.trim()
  if (!text) return null

  const patterns: RegExp[] = [
    // ---- explicit URL parameters, most specific first ----------------------
    // The official Maps URL format: ?api=1&query=lat,lng
    new RegExp(String.raw`[?&](?:query|q|ll|center|daddr|saddr|destination)=(${LAT}),\s*(${LNG})`, 'i'),
    // "/@lat,lng,15z"
    new RegExp(String.raw`@(${LAT}),(${LNG})`),
    // "/place/21.2514,81.6296" and "/dir//21.25,81.63"
    new RegExp(String.raw`/(?:place|dir)/(?:[^/]*/)?(${LAT}),(${LNG})`, 'i'),
    // The `data=` segment carries the authoritative pin as !3d<lat>!4d<lng>.
    new RegExp(String.raw`!3d(${LAT})!4d(${LNG})`),
    // geo: URI (Android intent links)
    new RegExp(String.raw`geo:(${LAT}),(${LNG})`, 'i'),

    // ---- human-typed forms -------------------------------------------------
    // "21.2514° N, 81.6296° E" — degree symbol and hemisphere letters.
    new RegExp(
      String.raw`(\d{1,2}(?:\.\d+)?)\s*°?\s*([NS])\s*[, ]\s*(\d{1,3}(?:\.\d+)?)\s*°?\s*([EW])`,
      'i',
    ),
    // Bare pair, anywhere in the text: "Plot 42 — 21.2514, 81.6296".
    // Comma-separated only; a bare space-separated pair matches far too much
    // ordinary text (an area followed by a rate, for instance).
    new RegExp(String.raw`(?:^|[^\d.-])(${LAT})\s*,\s*(${LNG})(?:$|[^\d.])`),
  ]

  for (const re of patterns) {
    const m = text.match(re)
    if (!m) continue

    let lat: number
    let lng: number
    if (m.length === 5) {
      // The hemisphere form: letters decide the sign, and N/S may come second.
      const [, aVal, aDir, bVal, bDir] = m
      const north = aDir.toUpperCase() === 'N' || aDir.toUpperCase() === 'S'
      lat = parseFloat(north ? aVal : bVal)
      lng = parseFloat(north ? bVal : aVal)
      if (/S/i.test(north ? aDir : bDir)) lat = -lat
      if (/W/i.test(north ? bDir : aDir)) lng = -lng
    } else {
      lat = parseFloat(m[1])
      lng = parseFloat(m[2])
    }

    // A plausible pair only. Without this a zoom level or a price sneaks
    // through as a "coordinate" and silently drops the pin in the sea.
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue
    return { lat, lng }
  }
  return null
}

export interface GeoSearchResult {
  label: string
  lat: number
  lng: number
}

/** Free OSM geocoding (Nominatim), limited to India. */
export async function searchPlaces(query: string): Promise<GeoSearchResult[]> {
  const url =
    'https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=in&q=' +
    encodeURIComponent(query)
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) return []
  const data = (await res.json()) as {
    display_name: string
    lat: string
    lon: string
  }[]
  return data.map((d) => ({
    label: d.display_name,
    lat: parseFloat(d.lat),
    lng: parseFloat(d.lon),
  }))
}
