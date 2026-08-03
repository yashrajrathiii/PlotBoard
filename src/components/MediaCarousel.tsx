import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Image as ImageIcon, MapPin } from 'lucide-react'

interface Props {
  photos: { id: string; url?: string }[]
  label: string
  /**
   * Cached satellite thumbnail (a Mapbox Static Images PNG stored in R2),
   * shown when a listing has no photos.
   */
  staticMapUrl?: string
}

/**
 * The card's media area: swipe/arrow through a listing's photos.
 *
 * Deliberately contains **no live map**. Cards previously mounted a Leaflet
 * map each, which was free on OSM but would have been ruinous on a metered
 * provider — a 15-card board is 15 billable map loads per view, roughly
 * $500/month at this team's usage. Listings without photos fall back to a
 * static satellite image that is fetched once and cached, so browsing the
 * board costs nothing however often it is opened.
 */
export default function MediaCarousel({ photos, label, staticMapUrl }: Props) {
  const [index, setIndex] = useState(0)
  const touchStartX = useRef<number | null>(null)

  const go = (delta: number) =>
    setIndex((i) => Math.min(photos.length - 1, Math.max(0, i + delta)))

  if (photos.length === 0) {
    return (
      <div className="relative h-44 bg-gray-100">
        {staticMapUrl ? (
          <>
            <img
              src={staticMapUrl}
              alt={`Map of ${label}`}
              className="h-full w-full object-cover"
              loading="lazy"
            />
            <span className="absolute top-2 left-2 bg-black/50 text-white rounded-md px-1.5 py-0.5 text-[10px] flex items-center gap-1">
              <MapPin size={11} /> Map
            </span>
          </>
        ) : (
          <div className="h-full w-full flex items-center justify-center text-gray-400">
            <ImageIcon size={32} />
          </div>
        )}
      </div>
    )
  }

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
      {photos[index]?.url ? (
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

      {photos.length > 1 && (
        <>
          <span className="absolute top-2 left-2 bg-black/50 text-white rounded-md px-1.5 py-0.5 text-[10px]">
            {index + 1}/{photos.length}
          </span>
          {index > 0 && (
            <button
              onClick={() => go(-1)}
              aria-label="Previous photo"
              className="hidden sm:flex absolute left-1.5 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-1 shadow"
            >
              <ChevronLeft size={16} />
            </button>
          )}
          {index < photos.length - 1 && (
            <button
              onClick={() => go(1)}
              aria-label="Next photo"
              className="hidden sm:flex absolute right-1.5 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-1 shadow"
            >
              <ChevronRight size={16} />
            </button>
          )}
          <div className="absolute bottom-2 inset-x-0 flex justify-center gap-1">
            {photos.map((p, i) => (
              <button
                key={p.id}
                onClick={() => setIndex(i)}
                aria-label={`Photo ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? 'w-4 bg-white' : 'w-1.5 bg-white/60'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
