import { useMemo, useState, type ReactNode } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { LISTING_STATUSES, PROPERTY_TYPES, type Listing } from '../lib/types'
import { useListingFilters } from '../context/ListingFiltersContext'

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
 * Search box + collapsible filter panel. Reads and writes the shared filter
 * context, so the board and the Map View stay in sync — narrowing on one and
 * switching to the other keeps the same results.
 *
 * `listings` is only used to build the city dropdown from what's actually
 * present; the filtering itself lives in the context.
 */
export default function ListingFilterBar({ listings }: { listings: Listing[] }) {
  const f = useListingFilters()
  const [panelOpen, setPanelOpen] = useState(false)

  const cities = useMemo(
    () => [...new Set(listings.map((l) => l.city).filter(Boolean))].sort(),
    [listings],
  )

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <input
            type="text"
            value={f.q}
            onChange={(e) => f.setQ(e.target.value)}
            placeholder="Search address, city, type, notes…"
            className="w-full rounded-lg border border-gray-300 pl-9 pr-9 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          {f.q && (
            <button
              onClick={() => f.setQ('')}
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
            panelOpen || f.activeCount
              ? 'border-emerald-500 text-emerald-700 bg-emerald-50'
              : 'border-gray-300 text-gray-700 hover:bg-gray-50'
          }`}
        >
          <SlidersHorizontal size={16} />
          <span className="hidden sm:inline">Filters</span>
          {f.activeCount > 0 && (
            <span className="bg-emerald-600 text-white text-[10px] leading-none rounded-full h-4 min-w-4 px-1 flex items-center justify-center">
              {f.activeCount}
            </span>
          )}
        </button>
      </div>

      {panelOpen && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Field label="City">
              <select
                value={f.city}
                onChange={(e) => f.setCity(e.target.value)}
                className={fieldClass}
              >
                <option value="">All cities</option>
                {cities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Property type">
              <select
                value={f.type}
                onChange={(e) => f.setType(e.target.value)}
                className={fieldClass}
              >
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
                value={f.status}
                onChange={(e) => f.setStatus(e.target.value)}
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
                value={f.areaMin}
                onChange={(e) => f.setAreaMin(e.target.value)}
                className={fieldClass}
              />
            </Field>
            <Field label="Max area (sq ft)">
              <input
                type="number"
                inputMode="numeric"
                min="0"
                placeholder="Any"
                value={f.areaMax}
                onChange={(e) => f.setAreaMax(e.target.value)}
                className={fieldClass}
              />
            </Field>
            <Field label="Min rate (₹/sqft)" hint="acre-quoted listings are converted">
              <input
                type="number"
                inputMode="numeric"
                min="0"
                placeholder="0"
                value={f.rateMin}
                onChange={(e) => f.setRateMin(e.target.value)}
                className={fieldClass}
              />
            </Field>
            <Field label="Max rate (₹/sqft)">
              <input
                type="number"
                inputMode="numeric"
                min="0"
                placeholder="Any"
                value={f.rateMax}
                onChange={(e) => f.setRateMax(e.target.value)}
                className={fieldClass}
              />
            </Field>
          </div>
          {f.activeCount > 0 && (
            <button
              onClick={f.clearFilters}
              className="text-sm text-emerald-700 hover:underline font-medium"
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  )
}
