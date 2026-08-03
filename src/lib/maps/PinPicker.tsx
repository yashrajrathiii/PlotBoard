import { useCallback, useEffect, useRef, useState } from 'react'
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps'
import { Crosshair, Search } from 'lucide-react'
import { GOOGLE_MAPS_KEY, DEFAULT_CENTER, DEFAULT_ZOOM, PIN_ZOOM, hasGoogleMaps } from './config'
import MapPlaceholder from './MapPlaceholder'
import { parseCoords, withinIndia, type LatLng } from '../geo'
import { reverseGeocode, type PlaceAddress } from './reverseGeocode'

/**
 * Google satellite map used *only* to place a pin.
 *
 * Google earns its place here for one reason: its Indian address and POI
 * search is materially better than the alternatives, which is exactly what a
 * broker needs when hunting for a plot. Everything read-only uses Mapbox.
 *
 * Three ways to set the pin, cheapest first:
 *   1. paste coordinates or a Google Maps URL — resolved locally, no API call
 *   2. tap the map / drag the marker
 *   3. Places search
 */
export default function PinPicker({
  value,
  onChange,
  onAddress,
  className = 'h-64',
}: {
  value: LatLng | null
  onChange: (p: LatLng) => void
  /** Fired with the looked-up address whenever the pin moves. */
  onAddress?: (a: PlaceAddress) => void
  className?: string
}) {
  if (!hasGoogleMaps()) {
    return (
      <MapPlaceholder
        className={`${className} rounded-xl border border-gray-200`}
        message="Pin picker unavailable"
        detail="VITE_GOOGLE_MAPS_KEY is not set. You can still paste coordinates below."
      />
    )
  }
  return (
    <APIProvider apiKey={GOOGLE_MAPS_KEY!}>
      <PickerInner value={value} onChange={onChange} onAddress={onAddress} className={className} />
    </APIProvider>
  )
}

function PickerInner({
  value,
  onChange,
  onAddress,
  className,
}: {
  value: LatLng | null
  onChange: (p: LatLng) => void
  onAddress?: (a: PlaceAddress) => void
  className: string
}) {
  const [error, setError] = useState<string | null>(null)
  const [place, setPlace] = useState<PlaceAddress | null>(null)

  const pick = useCallback(
    (p: LatLng) => {
      if (!withinIndia(p)) {
        setError('That location is outside India — please check the coordinates.')
        return
      }
      setError(null)
      onChange(p)
      // Look up the colony name for the new pin. Best-effort: if it fails the
      // broker just types the address themselves.
      void reverseGeocode(p).then((a) => {
        if (!a) return
        setPlace(a)
        onAddress?.(a)
      })
    },
    [onChange, onAddress],
  )

  return (
    <div className="space-y-2">
      <SearchBar onPick={pick} onError={setError} />
      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className={`${className} rounded-xl overflow-hidden border border-gray-200`}>
        <Map
          mapId="plotboard-pin-picker"
          defaultCenter={value ?? DEFAULT_CENTER}
          defaultZoom={value ? PIN_ZOOM : DEFAULT_ZOOM}
          mapTypeId="hybrid"
          gestureHandling="greedy"
          disableDefaultUI
          zoomControl
          mapTypeControl
          onClick={(e) => {
            const ll = e.detail.latLng
            if (ll) pick({ lat: ll.lat, lng: ll.lng })
          }}
          style={{ width: '100%', height: '100%' }}
        >
          {value && (
            <AdvancedMarker
              position={value}
              draggable
              onDragEnd={(e) => {
                const ll = e.latLng
                if (ll) pick({ lat: ll.lat(), lng: ll.lng() })
              }}
            >
              <Pin background="#059669" borderColor="#065f46" glyphColor="#fff" />
            </AdvancedMarker>
          )}
          <Recenter target={value} />
        </Map>
      </div>

      <p className="text-xs text-gray-500">
        {value
          ? `Pin: ${value.lat.toFixed(5)}, ${value.lng.toFixed(5)} — tap the map or drag the pin to adjust.`
          : 'Search above, or tap the map to drop the pin on the plot.'}
      </p>
      {place?.locality && (
        <p className="text-xs text-emerald-700">
          Detected: <span className="font-medium">{place.locality}</span>
          {place.city ? `, ${place.city}` : ''}
        </p>
      )}
    </div>
  )
}

/** Pans the map when the pin is set from search or a pasted coordinate. */
function Recenter({ target }: { target: LatLng | null }) {
  const map = useMap()
  // Only pan when the coordinates actually change — panning inside an effect
  // keyed on the object identity would re-fire on every render.
  const key = target ? `${target.lat},${target.lng}` : null
  useEffect(() => {
    if (!map || !target) return
    map.panTo(target)
    if ((map.getZoom() ?? 0) < PIN_ZOOM) map.setZoom(PIN_ZOOM)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key])
  return null
}

/**
 * Places Autocomplete, with a free local shortcut: if the text is already a
 * coordinate pair or a Google Maps URL, resolve it without an API call.
 */
function SearchBar({
  onPick,
  onError,
}: {
  onPick: (p: LatLng) => void
  onError: (msg: string | null) => void
}) {
  const places = useMapsLibrary('places')
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!places || !inputRef.current) return
    const ac = new places.Autocomplete(inputRef.current, {
      componentRestrictions: { country: 'in' },
      fields: ['geometry'],
    })
    const listener = ac.addListener('place_changed', () => {
      const loc = ac.getPlace()?.geometry?.location
      if (loc) onPick({ lat: loc.lat(), lng: loc.lng() })
    })
    return () => listener.remove()
  }, [places, onPick])

  const handleManual = () => {
    const parsed = parseCoords(query)
    if (parsed) {
      onPick(parsed)
      setQuery('')
      return
    }
    if (/goo\.gl|maps\.app/.test(query)) {
      onError(
        'Short Google Maps links don’t carry coordinates. Long-press the plot in Google Maps and copy the "lat, lng" numbers instead.',
      )
    }
  }

  const useMyLocation = () => {
    onError(null)
    navigator.geolocation?.getCurrentPosition(
      (pos) => onPick({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => onError('Could not get your location.'),
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleManual()
            }
          }}
          placeholder="Search a place, or paste Google Maps link / lat, lng"
          className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
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
  )
}
