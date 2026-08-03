import { useMemo, useState, type ReactNode } from 'react'
import Map, { Marker, NavigationControl, type ViewStateChangeEvent } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MapPin } from 'lucide-react'
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  MAPBOX_STYLE,
  MAPBOX_TOKEN,
  hasMapbox,
} from './config'
import MapPlaceholder from './MapPlaceholder'

export interface MapMarker {
  id: string
  latitude: number
  longitude: number
  /** Highlighted (e.g. the currently selected listing). */
  active?: boolean
}

/**
 * The Mapbox display map — every read-only map surface in the app.
 *
 * One instance = one billable Mapbox map load; panning and zooming inside it
 * cost nothing. So mount this lazily wherever it isn't immediately visible
 * (see ListingGallery, which only mounts it when its slide is opened).
 */
export default function SatelliteMap({
  center,
  zoom = DEFAULT_ZOOM,
  markers = [],
  onMarkerClick,
  interactive = true,
  showControls = false,
  className = 'h-full w-full',
  children,
}: {
  center?: { lat: number; lng: number }
  zoom?: number
  markers?: MapMarker[]
  onMarkerClick?: (id: string) => void
  interactive?: boolean
  showControls?: boolean
  className?: string
  children?: ReactNode
}) {
  const start = center ?? DEFAULT_CENTER
  const [viewState, setViewState] = useState({
    latitude: start.lat,
    longitude: start.lng,
    zoom,
  })

  // Marker elements are expensive to recreate; only rebuild when the set or
  // the active highlight actually changes.
  const pins = useMemo(
    () =>
      markers.map((m) => (
        <Marker
          key={m.id}
          latitude={m.latitude}
          longitude={m.longitude}
          anchor="bottom"
          onClick={(e) => {
            // Without this the click also reaches the map and can deselect.
            e.originalEvent.stopPropagation()
            onMarkerClick?.(m.id)
          }}
        >
          <span
            className={`flex items-center justify-center rounded-full p-1 shadow-md ring-2 ring-white ${
              m.active ? 'bg-emerald-600' : 'bg-red-500'
            } ${onMarkerClick ? 'cursor-pointer' : ''}`}
          >
            <MapPin size={14} className="text-white" fill="currentColor" />
          </span>
        </Marker>
      )),
    [markers, onMarkerClick],
  )

  if (!hasMapbox()) {
    return (
      <MapPlaceholder
        className={className}
        message="Map unavailable"
        detail="VITE_MAPBOX_TOKEN is not set."
      />
    )
  }

  return (
    <div className={className}>
      <Map
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle={MAPBOX_STYLE}
        {...viewState}
        onMove={(e: ViewStateChangeEvent) => setViewState(e.viewState)}
        interactive={interactive}
        // The board can show many cards; don't spend GPU on globe curvature.
        projection={{ name: 'mercator' }}
        attributionControl
        style={{ width: '100%', height: '100%' }}
      >
        {showControls && <NavigationControl position="top-left" showCompass={false} />}
        {pins}
        {children}
      </Map>
    </div>
  )
}
