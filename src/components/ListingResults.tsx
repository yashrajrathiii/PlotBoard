import { useMemo, useState, type ReactNode } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import {
  LISTING_STATUSES,
  PROPERTY_TYPES,
  type Listing,
} from '../lib/types'
import ListingCard from './ListingCard'

interface Props {
  listings: Listing[]
  loading: boolean
  error?: string | null
  showVisibility?: boolean
  /** Shown when the user has no listings at all (not a "no matches" case). */
  emptyState: ReactNode
}

const fieldClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500'

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-500 mb-1">
        {label}
        {hint && <span className="ml-1 font-normal text-gray-400">({hint})</span>}
      </span>
      {children}
    </label>
  )
}

/**
 * Search + filter bar over a set of listings, then the card grid. Used by both
 * the Home board and My Listings. Filtering is client-side over the already
 * loaded rows: text search (address/city/type/notes), city, property type,
 * status, area range (normalised to sq ft) and rate range (₹/sqft).
 */
export default function ListingResults({
  listings,
  loading,
  error,
  showVisibility,
  emptyState,
}: Props) {
  const [q, setQ] = useState('')
  const [city, setCity] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [areaMin, setAreaMin] = useState('')
  const [areaMax, setAreaMax] = useState('')
  const [rateMin, setRateMin] = useState('')
  const [rateMax, setRateMax] = useState('')
  const [panelOpen, setPanelOpen] = useState(false)

  const cities = useMemo(
    () => [...new Set(listings.map((l) => l.city).filter(Boolean))].sort(),
    [listings],
  )

  const activeCount = [city, type, status, areaMin, areaMax, rateMin, rateMax].filter(
    Boolean,
  ).length

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const aMin = parseFloat(areaMin)
    const aMax = parseFloat(areaMax)
    const rMin = parseFloat(rateMin)
    const rMax = parseFloat(rateMax)
    return listings.filter((l) => {
      if (needle) {
        const hay = [
          l.address_line1,
          l.address_line2,
          l.city,
          l.state,
          l.pincode,
          l.property_type,
          l.notes,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(needle)) return false
      }
      if (city && l.city !== city) return false
      if (type && l.property_type !== type) return false
      if (status && l.status !== status) return false
      if (!Number.isNaN(aMin) && l.area_sqft < aMin) return false
      if (!Number.isNaN(aMax) && l.area_sqft > aMax) return false
      // Compare on the normalised ₹/sqft, never the raw rate: an acre-quoted
      // rate is a number in the millions, so filtering on `rate` would make a
      // "max ₹5,000/sqft" filter match every per-acre listing.
      const ratePerSqft = l.rate_per_sqft ?? l.rate
      if (!Number.isNaN(rMin) && ratePerSqft < rMin) return false
      if (!Number.isNaN(rMax) && ratePerSqft > rMax) return false
      return true
    })
  }, [listings, q, city, type, status, areaMin, areaMax, rateMin, rateMax])

  const clearFilters = () => {
    setCity('')
    setType('')
    setStatus('')
    setAreaMin('')
    setAreaMax('')
    setRateMin('')
    setRateMax('')
  }
  const clearAll = () => {
    clearFilters()
    setQ('')
  }

  const isFiltering = q.trim() !== '' || activeCount > 0

  return (
    <div>
      {/* Search + filter toggle */}
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search address, city, type, notes…"
            className="w-full rounded-lg border border-gray-300 pl-9 pr-9 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          {q && (
            <button
              onClick={() => setQ('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={15} />
            </button>
          )}
        </div>
        <button
          onClick={() => setPanelOpen((o) => !o)}
          className={`relative flex items-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-medium ${
            panelOpen || activeCount
              ? 'border-emerald-500 text-emerald-700 bg-emerald-50'
              : 'border-gray-300 text-gray-700 hover:bg-gray-50'
          }`}
        >
          <SlidersHorizontal size={16} />
          <span className="hidden sm:inline">Filters</span>
          {activeCount > 0 && (
            <span className="bg-emerald-600 text-white text-[10px] leading-none rounded-full h-4 min-w-4 px-1 flex items-center justify-center">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {/* Filter panel */}
      {panelOpen && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Field label="City">
              <select value={city} onChange={(e) => setCity(e.target.value)} className={fieldClass}>
                <option value="">All cities</option>
                {cities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Property type">
              <select value={type} onChange={(e) => setType(e.target.value)} className={fieldClass}>
                <option value="">All types</option>
                {PROPERTY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={fieldClass}
              >
                <option value="">Any status</option>
                {LISTING_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Min area (sq ft)">
              <input
                type="number"
                inputMode="numeric"
                min="0"
                placeholder="0"
                value={areaMin}
                onChange={(e) => setAreaMin(e.target.value)}
                className={fieldClass}
              />
            </Field>
            <Field label="Max area (sq ft)">
              <input
                type="number"
                inputMode="numeric"
                min="0"
                placeholder="Any"
                value={areaMax}
                onChange={(e) => setAreaMax(e.target.value)}
                className={fieldClass}
              />
            </Field>
            <Field label="Min rate (₹/sqft)" hint="acre-quoted listings are converted">
              <input
                type="number"
                inputMode="numeric"
                min="0"
                placeholder="0"
                value={rateMin}
                onChange={(e) => setRateMin(e.target.value)}
                className={fieldClass}
              />
            </Field>
            <Field label="Max rate (₹/sqft)">
              <input
                type="number"
                inputMode="numeric"
                min="0"
                placeholder="Any"
                value={rateMax}
                onChange={(e) => setRateMax(e.target.value)}
                className={fieldClass}
              />
            </Field>
          </div>
          {activeCount > 0 && (
            <button
              onClick={clearFilters}
              className="text-sm text-emerald-700 hover:underline font-medium"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3 mb-4">{error}</p>
      )}

      {/* Result count when narrowing */}
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
