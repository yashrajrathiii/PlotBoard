import { useRef, useState } from 'react'
import { MapContainer, Marker, TileLayer } from 'react-leaflet'
import { ChevronLeft, ChevronRight, Image as ImageIcon, Map as MapIcon } from 'lucide-react'
import '../lib/leafletSetup'
import { OSM_ATTRIBUTION, OSM_TILE_URL } from '../lib/leafletSetup'

interface Props {
  photos: { id: string; url?: string }[]
  latitude: number
  longitude: number
  label: string
}

/**
 * The card's media area from the sketch: swipe/arrow between the photos and
 * a mini map slide (photos first, map always last; map-only when there are
 * no photos). The Leaflet map mounts only while its slide is visible, so a
 * board full of cards stays light.
 */
export default function MediaCarousel({ photos, latitude, longitude, label }: Props) {
  const slides = photos.length + 1 // + map slide
  const [index, setIndex] = useState(0)
  const touchStartX = useRef<number | null>(null)

  const isMapSlide = index === slides - 1

  const go = (delta: number) =>
    setIndex((i) => Math.min(slides - 1, Math.max(0, i + delta)))

  return (
    <div
      className="relative h-44 bg-gray-100 select-none"
      onTouchStart={(e) => (touchStartX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchStartX.current === null) return
        const dx = e.changedTouches[0].clientX - touchStartX.current
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1)
        touchStartX.current = null
      }}
    >
      {isMapSlide ? (
        <MapContainer
          center={[latitude, longitude]}
          zoom={14}
          className="h-full w-full"
          dragging={false}
          scrollWheelZoom={false}
          doubleClickZoom={false}
          touchZoom={false}
          zoomControl={false}
          keyboard={false}
        >
          <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
          <Marker position={[latitude, longitude]} />
        </MapContainer>
      ) : photos[index]?.url ? (
        <img
          src={photos[index].url}
          alt={`${label} photo ${index + 1}`}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="h-full w-full flex items-center justify-center text-gray-400">
          <ImageIcon size={32} />
        </div>
      )}

      {/* slide-type badge */}
      <span className="absolute top-2 left-2 z-[400] bg-black/50 text-white rounded-md px-1.5 py-0.5 text-[10px] flex items-center gap-1">
        {isMapSlide ? <MapIcon size={11} /> : <ImageIcon size={11} />}
        {isMapSlide ? 'Map' : `${index + 1}/${photos.length}`}
      </span>

      {/* arrows (desktop) */}
      {slides > 1 && (
        <>
          {index > 0 && (
            <button
              onClick={() => go(-1)}
              aria-label="Previous"
              className="hidden sm:flex absolute left-1.5 top-1/2 -translate-y-1/2 z-[400] bg-white/80 hover:bg-white rounded-full p-1 shadow"
            >
              <ChevronLeft size={16} />
            </button>
          )}
          {index < slides - 1 && (
            <button
              onClick={() => go(1)}
              aria-label="Next"
              className="hidden sm:flex absolute right-1.5 top-1/2 -translate-y-1/2 z-[400] bg-white/80 hover:bg-white rounded-full p-1 shadow"
            >
              <ChevronRight size={16} />
            </button>
          )}
        </>
      )}

      {/* dots */}
      {slides > 1 && (
        <div className="absolute bottom-2 inset-x-0 z-[400] flex justify-center gap-1">
          {Array.from({ length: slides }).map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              aria-label={`Slide ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? 'w-4 bg-white' : 'w-1.5 bg-white/60'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
