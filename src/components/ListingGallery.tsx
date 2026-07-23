import { useRef, useState } from 'react'
import { MapContainer, Marker, TileLayer } from 'react-leaflet'
import {
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Map as MapIcon,
  Play,
} from 'lucide-react'
import '../lib/leafletSetup'
import { OSM_ATTRIBUTION, OSM_TILE_URL } from '../lib/leafletSetup'
import type { Listing } from '../lib/types'

interface Slide {
  key: string
  type: 'photo' | 'video' | 'map'
  url?: string
}

/**
 * Full-size gallery for the single-listing view: a large viewer that steps
 * through every photo, the video (if any), and a map slide, with a thumbnail
 * strip below and swipe / arrow navigation. The map is fully interactive here
 * (drag + zoom) so the viewer can explore the plot's surroundings.
 */
export default function ListingGallery({ listing }: { listing: Listing }) {
  const photos = listing.listing_media.filter((m) => m.media_type === 'photo')
  const video = listing.listing_media.find((m) => m.media_type === 'video')

  const slides: Slide[] = [
    ...photos.map((p) => ({ key: p.id, type: 'photo' as const, url: p.url })),
    ...(video ? [{ key: video.id, type: 'video' as const, url: video.url }] : []),
    { key: 'map', type: 'map' as const },
  ]

  const [index, setIndex] = useState(0)
  const touchStartX = useRef<number | null>(null)
  const current = slides[index]

  const go = (delta: number) =>
    setIndex((i) => Math.min(slides.length - 1, Math.max(0, i + delta)))

  return (
    <div className="isolate">
      {/* Main viewer */}
      <div
        className="relative h-64 sm:h-96 bg-gray-100 select-none"
        onTouchStart={(e) => (touchStartX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchStartX.current === null) return
          const dx = e.changedTouches[0].clientX - touchStartX.current
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1)
          touchStartX.current = null
        }}
      >
        {current.type === 'map' ? (
          <MapContainer
            center={[listing.latitude, listing.longitude]}
            zoom={15}
            className="h-full w-full"
            scrollWheelZoom
          >
            <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
            <Marker position={[listing.latitude, listing.longitude]} />
          </MapContainer>
        ) : current.type === 'video' ? (
          current.url ? (
            <video
              src={current.url}
              controls
              playsInline
              className="h-full w-full object-contain bg-black"
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-gray-400">
              <Play size={40} />
            </div>
          )
        ) : current.url ? (
          <img
            src={current.url}
            alt={`${listing.address_line1} photo`}
            className="h-full w-full object-contain bg-gray-900/5"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-gray-400">
            <ImageIcon size={40} />
          </div>
        )}

        {slides.length > 1 && (
          <>
            {index > 0 && (
              <button
                onClick={() => go(-1)}
                aria-label="Previous"
                className="absolute left-2 top-1/2 -translate-y-1/2 z-[400] bg-white/85 hover:bg-white rounded-full p-1.5 shadow"
              >
                <ChevronLeft size={18} />
              </button>
            )}
            {index < slides.length - 1 && (
              <button
                onClick={() => go(1)}
                aria-label="Next"
                className="absolute right-2 top-1/2 -translate-y-1/2 z-[400] bg-white/85 hover:bg-white rounded-full p-1.5 shadow"
              >
                <ChevronRight size={18} />
              </button>
            )}
            <span className="absolute top-2 right-2 z-[400] bg-black/55 text-white rounded-md px-2 py-0.5 text-xs">
              {index + 1} / {slides.length}
            </span>
          </>
        )}
      </div>

      {/* Thumbnail strip */}
      {slides.length > 1 && (
        <div className="flex gap-2 overflow-x-auto p-3 bg-white">
          {slides.map((s, i) => (
            <button
              key={s.key}
              onClick={() => setIndex(i)}
              aria-label={`View ${s.type} ${i + 1}`}
              className={`relative h-14 w-14 shrink-0 rounded-lg overflow-hidden border-2 ${
                i === index ? 'border-emerald-500' : 'border-transparent'
              }`}
            >
              {s.type === 'photo' && s.url ? (
                <img src={s.url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span
                  className={`h-full w-full flex items-center justify-center ${
                    s.type === 'map'
                      ? 'bg-emerald-50 text-emerald-600'
                      : 'bg-gray-900 text-white'
                  }`}
                >
                  {s.type === 'map' ? <MapIcon size={18} /> : <Play size={18} />}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
