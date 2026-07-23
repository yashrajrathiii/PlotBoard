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

/**
 * Accepts what brokers actually paste from Google Maps:
 *   - "21.2514, 81.6296" (plain coordinates)
 *   - https://www.google.com/maps/place/.../@21.2514,81.6296,15z
 *   - https://www.google.com/maps?q=21.2514,81.6296
 * Short goo.gl links carry no coordinates, so those return null (the UI
 * explains to open the link and copy the full URL or coordinates).
 */
export function parseCoords(input: string): LatLng | null {
  const text = input.trim()
  if (!text) return null

  const patterns = [
    /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/, // google "/@lat,lng,zoom"
    /[?&]q=(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/, // google "?q=lat,lng"
    /^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/, // "lat, lng"
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m) {
      const p = { lat: parseFloat(m[1]), lng: parseFloat(m[2]) }
      if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) return p
    }
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
