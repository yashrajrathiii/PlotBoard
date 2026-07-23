import { useState } from 'react'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { Crosshair, Search } from 'lucide-react'
import type { Marker as LeafletMarker } from 'leaflet'
import '../lib/leafletSetup'
import { OSM_ATTRIBUTION, OSM_TILE_URL } from '../lib/leafletSetup'
import {
  parseCoords,
  searchPlaces,
  withinIndia,
  type GeoSearchResult,
  type LatLng,
} from '../lib/geo'

const RAIPUR: LatLng = { lat: 21.2514, lng: 81.6296 }

function ClickToPin({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({
    click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }),
  })
  return null
}

/** Imperatively recentre the map when a search/paste result comes in. */
function FlyTo({ target }: { target: LatLng | null }) {
  const map = useMap()
  if (target) map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 15))
  return null
}

/**
 * Location input for the add-listing form. Three ways to drop the pin:
 *   1. tap/click anywhere on the map (marker is also draggable)
 *   2. search a place name (free OSM geocoding, India-only)
 *   3. paste coordinates or a full Google Maps link — brokers usually have
 *      the plot open in Google Maps already, so they copy the URL and paste.
 */
export default function LocationPicker({
  value,
  onChange,
}: {
  value: LatLng | null
  onChange: (p: LatLng) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeoSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [flyTarget, setFlyTarget] = useState<LatLng | null>(null)
  const [pasteError, setPasteError] = useState<string | null>(null)

  const pick = (p: LatLng) => {
    setPasteError(null)
    if (!withinIndia(p)) {
      setPasteError('That location is outside India — please check the coordinates.')
      return
    }
    onChange(p)
    setFlyTarget(p)
    setResults([])
  }

  const handleSearch = async () => {
    if (!query.trim()) return
    // A pasted Google Maps link or "lat, lng" resolves instantly, no network.
    const parsed = parseCoords(query)
    if (parsed) {
      pick(parsed)
      setQuery('')
      return
    }
    if (/goo\.gl|maps\.app/.test(query)) {
      setPasteError(
        'Short Google Maps links don’t carry coordinates. In Google Maps, long-press the plot and copy the "lat, lng" numbers, or share the full browser URL.',
      )
      return
    }
    setSearching(true)
    setPasteError(null)
    const found = await searchPlaces(query)
    setResults(found)
    setSearching(false)
    if (found.length === 0) setPasteError('No places found — try a different name.')
  }

  const useMyLocation = () => {
    setPasteError(null)
    navigator.geolocation?.getCurrentPosition(
      (pos) => pick({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setPasteError('Could not get your location.'),
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void handleSearch()
              }
            }}
            placeholder="Search place, or paste Google Maps link / lat, lng"
            className="w-full rounded-lg border border-gray-300 pl-3 pr-9 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            type="button"
            onClick={() => void handleSearch()}
            aria-label="Search location"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-emerald-600"
          >
            <Search size={16} />
          </button>
        </div>
        <button
          type="button"
          onClick={useMyLocation}
          title="Use my current location"
          aria-label="Use my current location"
          className="shrink-0 border border-gray-300 rounded-lg px-3 text-gray-500 hover:text-emerald-600 hover:border-emerald-400"
        >
          <Crosshair size={16} />
        </button>
      </div>

      {searching && <p className="text-xs text-gray-400">Searching…</p>}
      {pasteError && <p className="text-xs text-red-600">{pasteError}</p>}
      {results.length > 0 && (
        <ul className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-40 overflow-y-auto">
          {results.map((r) => (
            <li key={`${r.lat}-${r.lng}`}>
              <button
                type="button"
                onClick={() => pick({ lat: r.lat, lng: r.lng })}
                className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-emerald-50"
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="isolate h-64 rounded-xl overflow-hidden border border-gray-200">
        <MapContainer
          center={[value?.lat ?? RAIPUR.lat, value?.lng ?? RAIPUR.lng]}
          zoom={value ? 15 : 12}
          className="h-full w-full"
        >
          <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
          <ClickToPin onPick={pick} />
          <FlyTo target={flyTarget} />
          {value && (
            <Marker
              position={[value.lat, value.lng]}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const p = (e.target as LeafletMarker).getLatLng()
                  pick({ lat: p.lat, lng: p.lng })
                },
              }}
            />
          )}
        </MapContainer>
      </div>

      <p className="text-xs text-gray-500">
        {value
          ? `Pin: ${value.lat.toFixed(5)}, ${value.lng.toFixed(5)} — tap the map or drag the pin to adjust.`
          : 'Tap the map to drop the pin on the plot.'}
      </p>
    </div>
  )
}
