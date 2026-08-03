import { type ReactNode } from 'react'
import { Search } from 'lucide-react'
import type { Listing } from '../lib/types'
import { useListingFilters } from '../context/ListingFiltersContext'
import ListingFilterBar from './ListingFilterBar'
import ListingCard from './ListingCard'

interface Props {
  listings: Listing[]
  loading: boolean
  error?: string | null
  showVisibility?: boolean
  /** Shown when the user has no listings at all (not a "no matches" case). */
  emptyState: ReactNode
}

/**
 * Search + filter bar over a set of listings, then the card grid. Used by the
 * Home board and My Listings. Filter state lives in ListingFiltersContext so
 * it is shared with the Map View.
 */
export default function ListingResults({
  listings,
  loading,
  error,
  showVisibility,
  emptyState,
}: Props) {
  const { apply, isFiltering, clearAll } = useListingFilters()
  const filtered = apply(listings)

  return (
    <div>
      <ListingFilterBar listings={listings} />

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3 mb-4">{error}</p>
      )}

      {!loading && listings.length > 0 && isFiltering && (
        <p className="text-xs text-gray-500 mb-3">
          {filtered.length} of {listings.length} listings
        </p>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-72 bg-white rounded-2xl border border-gray-200 animate-pulse"
            />
          ))}
        </div>
      ) : listings.length === 0 ? (
        emptyState
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 text-center">
          <Search size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="font-medium text-gray-900">No listings match your filters</p>
          <button
            onClick={clearAll}
            className="mt-3 text-sm font-medium text-emerald-700 hover:underline"
          >
            Clear search &amp; filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {filtered.map((l) => (
            <ListingCard key={l.id} listing={l} showVisibility={showVisibility} />
          ))}
        </div>
      )}
    </div>
  )
}
