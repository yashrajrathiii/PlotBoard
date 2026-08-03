/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Listing } from '../lib/types'

/**
 * Search + filter state, shared across the board and the Map View.
 *
 * Lifted out of ListingResults so switching between list and map keeps the
 * same filters applied — a broker who narrows to "Commercial, under ₹3,000
 * /sqft" and taps Map should see those pins, not start over.
 */
interface ListingFiltersValue {
  q: string
  setQ: (v: string) => void
  city: string
  setCity: (v: string) => void
  type: string
  setType: (v: string) => void
  status: string
  setStatus: (v: string) => void
  areaMin: string
  setAreaMin: (v: string) => void
  areaMax: string
  setAreaMax: (v: string) => void
  rateMin: string
  setRateMin: (v: string) => void
  rateMax: string
  setRateMax: (v: string) => void
  /** Number of non-search filters currently set (drives the badge). */
  activeCount: number
  isFiltering: boolean
  clearFilters: () => void
  clearAll: () => void
  /** Applies the current filters to any list of listings. */
  apply: (listings: Listing[]) => Listing[]
}

const Ctx = createContext<ListingFiltersValue | null>(null)

export function ListingFiltersProvider({ children }: { children: ReactNode }) {
  const [q, setQ] = useState('')
  const [city, setCity] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [areaMin, setAreaMin] = useState('')
  const [areaMax, setAreaMax] = useState('')
  const [rateMin, setRateMin] = useState('')
  const [rateMax, setRateMax] = useState('')

  const activeCount = [city, type, status, areaMin, areaMax, rateMin, rateMax].filter(
    Boolean,
  ).length
  const isFiltering = q.trim() !== '' || activeCount > 0

  const clearFilters = useCallback(() => {
    setCity('')
    setType('')
    setStatus('')
    setAreaMin('')
    setAreaMax('')
    setRateMin('')
    setRateMax('')
  }, [])

  const clearAll = useCallback(() => {
    clearFilters()
    setQ('')
  }, [clearFilters])

  const apply = useCallback(
    (listings: Listing[]) => {
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
    },
    [q, city, type, status, areaMin, areaMax, rateMin, rateMax],
  )

  const value = useMemo(
    () => ({
      q,
      setQ,
      city,
      setCity,
      type,
      setType,
      status,
      setStatus,
      areaMin,
      setAreaMin,
      areaMax,
      setAreaMax,
      rateMin,
      setRateMin,
      rateMax,
      setRateMax,
      activeCount,
      isFiltering,
      clearFilters,
      clearAll,
      apply,
    }),
    [
      q,
      city,
      type,
      status,
      areaMin,
      areaMax,
      rateMin,
      rateMax,
      activeCount,
      isFiltering,
      clearFilters,
      clearAll,
      apply,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useListingFilters(): ListingFiltersValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useListingFilters must be used within ListingFiltersProvider')
  return ctx
}
