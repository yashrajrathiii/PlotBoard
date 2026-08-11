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
import { isShortMapsLink, parseCoords, withinIndia, type LatLng } from '../geo'
import { resolveShortLink } from './resolveShortLink'
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
  // No key: the map itself is impossible, but pasting a link or coordinates is
  // not — and that is the whole job. This branch used to promise "you can still
  // paste coordinates below" while rendering no input at all, which left a
  // broker with no way to set a pin whatsoever if the key ever lapsed.
  return hasGoogleMaps() ? (
    <APIProvider apiKey={GOOGLE_MAPS_KEY!}>
      <PickerInner value={value} onChange={onChange} onAddress={onAddress} className={className} />
    </APIProvider>
  ) : (
    <KeylessPicker value={value} onChange={onChange} className={className} />
  )
}

/** Manual-entry fallback used when there is no Google Maps key. */
function KeylessPicker({
  value,
  onChange,
  className,
}: {
  value: LatLng | null
  onChange: (p: LatLng) => void
  className: string
}) {
  const [error, setError] = useState<string | null>(null)
  const pick = (p: LatLng) => {
    if (!withinIndia(p)) {
      setError('That location is outside India — please check the coordinates.')
      return
    }
    setError(null)
    onChange(p)
  }
  return (
    <div className="space-y-2">
      <LocationInput onPick={pick} onError={setError} />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <MapPlaceholder
        className={`${className} rounded-xl border border-gray-200`}
        message="Map unavailable"
        detail="VITE_GOOGLE_MAPS_KEY is not set — paste a Google Maps link or coordinates above."
      />
      {value && (
        <p className="text-xs text-gray-500">
          Pin: {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
        </p>
      )}
    </div>
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
 * Google Places type-ahead layered ON TOP of the plain input.
 *
 * The split is deliberate: `LocationInput` below knows nothing about Google, so
 * pasting a link or coordinates keeps working even when Places is unavailable —
 * which it may well be, since the legacy Autocomplete widget is deprecated for
 * Google Cloud projects created after 1 Mar 2025.
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

  useEffect(() => {
    if (!places || !inputRef.current) return
    // Guarded on purpose. There is no error boundary in this app — an
    // unhandled throw here unmounts the entire React root and the broker sees
    // a white screen mid-listing. Losing the type-ahead is survivable; losing
    // the app is not.
    let listener: google.maps.MapsEventListener | undefined
    try {
      const ac = new places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: 'in' },
        fields: ['geometry'],
      })
      listener = ac.addListener('place_changed', () => {
        const loc = ac.getPlace()?.geometry?.location
        if (loc) onPick({ lat: loc.lat(), lng: loc.lng() })
      })
    } catch (e) {
      console.warn('[LD Board] Places autocomplete unavailable:', e)
    }
    return () => listener?.remove()
  }, [places, onPick])

  return <LocationInput ref={inputRef} onPick={onPick} onError={onError} />
}

/**
 * The input, the Go button and "use my location" — with no dependency on
 * Google whatsoever.
 */
function LocationInput({
  onPick,
  onError,
  ref,
}: {
  onPick: (p: LatLng) => void
  onError: (msg: string | null) => void
  ref?: React.Ref<HTMLInputElement>
}) {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)

  /** Shared by the Go button, Enter, and paste. */
  const resolve = async (text: string) => {
    const parsed = parseCoords(text)
    if (parsed) {
      onError(null)
      onPick(parsed)
      setQuery('')
      return true
    }
    if (isShortMapsLink(text)) {
      setBusy(true)
      onError(null)
      const result = await resolveShortLink(text)
      setBusy(false)
      if ('point' in result) {
        onPick(result.point)
        setQuery('')
      } else {
        onError(result.error)
      }
      return true
    }
    return false
  }

  /**
   * Resolve whatever is in the box to a pin.
   *
   * This is the path that must never depend on Google. The Autocomplete widget
   * attaches a NATIVE keydown listener to this same input and calls
   * stopPropagation() on Enter whenever its dropdown is open — React 19
   * delegates events at the root, so an onKeyDown handler here never fires.
   * That is why there is an explicit button: a click cannot be swallowed.
   */
  const handleManual = async () => {
    const text = query.trim()
    if (!text || busy) return
    if (await resolve(text)) return
    // Never fail silently. Before this, unparseable text did nothing at all,
    // which is indistinguishable from the box being broken.
    onError(
      'Could not read a location from that. Paste a Google Maps link, or coordinates like "21.2514, 81.6296" — or tap the map.',
    )
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
          ref={ref}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // preventDefault FIRST and unconditionally. This input sits inside
            // the listing <form>, so an Enter that reaches the form submits a
            // half-filled listing — which is what produced the misleading
            // "Drop the location pin on the map" error.
            if (e.key === 'Enter') {
              e.preventDefault()
              e.stopPropagation()
              void handleManual()
            }
          }}
          onPaste={(e) => {
            // Pasting a link should just work, with no second action. Read from
            // the event rather than state — onChange has not fired yet.
            const text = e.clipboardData.getData('text').trim()
            if (!text) return
            if (parseCoords(text) || isShortMapsLink(text)) {
              e.preventDefault()
              setQuery(text)
              void resolve(text)
            }
          }}
          placeholder="Paste a Google Maps link or lat, lng — or search"
          className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>
      <button
        type="button"
        onClick={() => void handleManual()}
        disabled={!query.trim() || busy}
        title="Use this link or coordinates"
        className="shrink-0 border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
      >
        {busy ? 'Opening…' : 'Go'}
      </button>
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
