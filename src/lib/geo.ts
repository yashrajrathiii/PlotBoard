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
/**
 * One sexagesimal component, covering every punctuation variant seen in the
 * wild: `21°18'11.2"N`, `21° 18′ 11.2″ N`, `21°18.187'N` (degrees + decimal
 * minutes, seconds omitted). Straight and curly quotes both appear depending on
 * whether the value was copied from Google Maps, a keyboard, or a WhatsApp
 * message that mangled it.
 */
const DMS_PART =
  String.raw`(\d{1,3})\s*°\s*(\d{1,2}(?:\.\d+)?)\s*['’′]?\s*(?:(\d{1,2}(?:\.\d+)?)\s*(?:["”″]|'')?)?\s*([NSEW])`

/** deg + min/60 + sec/3600, negated for the southern/western hemispheres. */
function dmsToDecimal(deg: string, min: string, sec: string | undefined, hemi: string): number {
  const value = Number(deg) + Number(min) / 60 + (sec ? Number(sec) / 3600 : 0)
  return /[SW]/i.test(hemi) ? -value : value
}

/**
 * Each entry owns its own conversion, rather than the caller guessing from
 * capture-group positions — the DMS forms have eight groups and the URL forms
 * two, and inferring which is which from `match.length` was already fragile
 * before DMS existed.
 */
interface CoordPattern {
  re: RegExp
  convert: (m: RegExpMatchArray) => { lat: number; lng: number }
}

/** The common case: group 1 is latitude, group 2 is longitude. */
const pair = (re: RegExp): CoordPattern => ({
  re,
  convert: (m) => ({ lat: parseFloat(m[1]), lng: parseFloat(m[2]) }),
})

const COORD_PATTERNS: CoordPattern[] = [
  // ---- DMS / DM first ------------------------------------------------------
  // Must precede the bare-pair pattern: "21°18'11.2\"N 81°35'03.3\"E" contains
  // digit pairs that the loose pattern would otherwise mis-read as a decimal
  // coordinate, silently dropping the pin ~30 km away.
  {
    re: new RegExp(DMS_PART + String.raw`\s*[, ]\s*` + DMS_PART, 'i'),
    convert: (m) => {
      const a = { v: dmsToDecimal(m[1], m[2], m[3], m[4]), hemi: m[4] }
      const b = { v: dmsToDecimal(m[5], m[6], m[7], m[8]), hemi: m[8] }
      // Latitude is whichever component carries N or S — Google writes lat
      // first, but people do paste them the other way round.
      const latFirst = /[NS]/i.test(a.hemi)
      return latFirst ? { lat: a.v, lng: b.v } : { lat: b.v, lng: a.v }
    },
  },

  // ---- explicit URL parameters, most specific first ------------------------
  // The official Maps URL format: ?api=1&query=lat,lng
  pair(new RegExp(String.raw`[?&](?:query|q|ll|center|daddr|saddr|destination)=(${LAT}),\s*(${LNG})`, 'i')),
  // "/@lat,lng,15z"
  pair(new RegExp(String.raw`@(${LAT}),(${LNG})`)),
  // "/place/21.2514,81.6296" and "/dir//21.25,81.63"
  pair(new RegExp(String.raw`/(?:place|dir)/(?:[^/]*/)?(${LAT}),(${LNG})`, 'i')),
  // The `data=` segment carries the authoritative pin as !3d<lat>!4d<lng>.
  pair(new RegExp(String.raw`!3d(${LAT})!4d(${LNG})`)),
  // geo: URI (Android intent links)
  pair(new RegExp(String.raw`geo:(${LAT}),(${LNG})`, 'i')),

  // ---- human-typed decimal forms -------------------------------------------
  // "21.2514° N, 81.6296° E"
  {
    re: new RegExp(
      String.raw`(\d{1,3}(?:\.\d+)?)\s*°\s*([NSEW])\s*[, ]\s*(\d{1,3}(?:\.\d+)?)\s*°\s*([NSEW])`,
      'i',
    ),
    convert: (m) => {
      const aVal = parseFloat(m[1]) * (/[SW]/i.test(m[2]) ? -1 : 1)
      const bVal = parseFloat(m[3]) * (/[SW]/i.test(m[4]) ? -1 : 1)
      return /[NS]/i.test(m[2]) ? { lat: aVal, lng: bVal } : { lat: bVal, lng: aVal }
    },
  },
  // Bare pair, anywhere in the text: "Plot 42 — 21.2514, 81.6296".
  // Comma-separated only; a bare space-separated pair matches far too much
  // ordinary text (an area followed by a rate, for instance).
  pair(new RegExp(String.raw`(?:^|[^\d.-])(${LAT})\s*,\s*(${LNG})(?:$|[^\d.])`)),
]

export function parseCoords(input: string): LatLng | null {
  const text = input.trim()
  if (!text) return null

  for (const { re, convert } of COORD_PATTERNS) {
    const m = text.match(re)
    if (!m) continue
    const { lat, lng } = convert(m)
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
