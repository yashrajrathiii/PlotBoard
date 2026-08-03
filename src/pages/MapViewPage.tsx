import { lazy, Suspense, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Inbox, MapPin, Plus, X } from 'lucide-react'
import { useListings } from '../hooks/useListings'
import { useListingFilters } from '../context/ListingFiltersContext'
import { useAuth } from '../context/AuthContext'
import ListingFilterBar from '../components/ListingFilterBar'
import { StatusChip } from '../components/ListingCard'
import { addressLines, type Listing } from '../lib/types'
import { formatAreaEntered, formatINRCompact, formatRateEntered } from '../lib/format'
import { DEFAULT_CENTER } from '../lib/maps/config'

// mapbox-gl is ~500 KB gzipped — keep it out of the main bundle so the rest
// of the app stays fast on mobile data.
const SatelliteMap = lazy(() => import('../lib/maps/SatelliteMap'))

/**
 * Every listing on one satellite map. Uses the SAME filter state as the board
 * (shared context), so narrowing the list and switching here shows exactly
 * those pins.
 *
 * One map instance = one Mapbox map load per visit; panning and zooming
 * within it are free.
 */
export default function MapViewPage() {
  const { listings: all, loading, error } = useListings()
  const { apply, isFiltering } = useListingFilters()
  const { session } = useAuth()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // The board shows public listings; the map matches it, plus your own
  // private pins so you can see your full inventory geographically.
  const visible = all.filter(
    (l) => l.visibility === 'public' || l.created_by === session?.user.id,
  )
  const listings = apply(visible)

  const markers = useMemo(
    () =>
      listings.map((l) => ({
        id: l.id,
        latitude: l.latitude,
        longitude: l.longitude,
        active: l.id === selectedId,
      })),
    [listings, selectedId],
  )

  // Centre on the listings themselves rather than a fixed point, so a filtered
  // set (e.g. one city) fills the view instead of sitting off-screen.
  const center = useMemo(() => {
    if (listings.length === 0) return DEFAULT_CENTER
    const lat = listings.reduce((s, l) => s + l.latitude, 0) / listings.length
    const lng = listings.reduce((s, l) => s + l.longitude, 0) / listings.length
    return { lat, lng }
  }, [listings])

  const selected = listings.find((l) => l.id === selectedId) ?? null

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-gray-900">
          Map view
          {!loading && (
            <span className="ml-2 text-sm font-normal text-gray-500">
              {listings.length} pin{listings.length === 1 ? '' : 's'}
              {isFiltering && ` of ${visible.length}`}
            </span>
          )}
        </h1>
        <Link
          to="/add"
          className="hidden sm:flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg px-3.5 py-2"
        >
          <Plus size={16} /> Add listing
        </Link>
      </div>

      <ListingFilterBar listings={visible} />

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3 mb-4">{error}</p>
      )}

      <div className="relative rounded-2xl overflow-hidden border border-gray-200 bg-gray-100 h-[60vh] sm:h-[70vh]">
        {loading ? (
          <div className="h-full w-full animate-pulse bg-gray-200" />
        ) : listings.length === 0 ? (
          <div className="h-full w-full flex flex-col items-center justify-center text-center px-6">
            <Inbox size={36} className="text-gray-300 mb-3" />
            <p className="font-medium text-gray-900">
              {isFiltering ? 'No listings match your filters' : 'No listings yet'}
            </p>
            <p className="text-sm text-gray-600 mt-1">
              {isFiltering
                ? 'Widen the filters to see pins here.'
                : 'Add a listing and it will appear on the map.'}
            </p>
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="h-full w-full flex items-center justify-center text-gray-400">
                <MapPin size={28} />
              </div>
            }
          >
            <SatelliteMap
              center={center}
              zoom={listings.length === 1 ? 15 : 10}
              markers={markers}
              onMarkerClick={setSelectedId}
              showControls
            />
          </Suspense>
        )}

        {selected && (
          <ListingPeek listing={selected} onClose={() => setSelectedId(null)} />
        )}
      </div>

      <Link
        to="/add"
        aria-label="Add listing"
        className="sm:hidden fixed bottom-20 right-4 z-30 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full p-4 shadow-lg"
      >
        <Plus size={24} />
      </Link>
    </div>
  )
}

/** Compact card shown over the map when a pin is tapped. */
function ListingPeek({ listing, onClose }: { listing: Listing; onClose: () => void }) {
  const { session } = useAuth()
  const canSeeRate = listing.rate_visible || listing.created_by === session?.user.id
  const photo = listing.listing_media.find((m) => m.media_type === 'photo')?.url
  const thumb = photo ?? listing.static_map_url
  const lines = addressLines(listing)

  return (
    // z-10 keeps it above the Mapbox canvas without escaping the map container.
    <div className="absolute inset-x-3 bottom-3 z-10 sm:inset-x-auto sm:left-3 sm:max-w-sm">
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-3 flex gap-3">
        {thumb ? (
          <img
            src={thumb}
            alt={listing.address_line1}
            className="w-16 h-16 rounded-lg object-cover shrink-0"
          />
        ) : (
          <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
            <MapPin size={20} className="text-gray-300" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-gray-900 text-sm leading-tight truncate">
              {listing.property_type}
            </p>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-gray-400 hover:text-gray-600 shrink-0"
            >
              <X size={16} />
            </button>
          </div>
          <p className="text-xs text-gray-600 truncate">{lines[0]}</p>
          <p className="text-xs text-gray-500 truncate">{lines[lines.length - 1]}</p>
          <div className="flex items-center gap-2 mt-1">
            <StatusChip status={listing.status} />
            <span className="text-xs text-gray-600">
              {formatAreaEntered(listing.area, listing.area_unit)}
            </span>
          </div>
          <p className="text-xs text-gray-600 mt-0.5">
            {canSeeRate ? (
              <>
                {formatRateEntered(listing.rate, listing.rate_unit)}
                <span className="ml-1.5 font-semibold text-emerald-700">
                  {formatINRCompact(listing.deal_value)}
                </span>
              </>
            ) : (
              <span className="text-gray-400">Rate on request</span>
            )}
          </p>
          <Link
            to={`/listing/${listing.id}`}
            className="mt-1.5 inline-flex items-center gap-0.5 text-xs font-medium text-emerald-700 hover:underline"
          >
            View listing <ChevronRight size={13} />
          </Link>
        </div>
      </div>
    </div>
  )
}
