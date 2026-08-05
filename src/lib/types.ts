export const PROPERTY_TYPES = [
  'Residential Plot',
  'Commercial Plot',
  'Agricultural',
  'Farmhouse Land',
  'Industrial',
  'Others',
] as const

export type PropertyType = (typeof PROPERTY_TYPES)[number]

export type AreaUnit = 'acre' | 'sqft'
/** Rates may be quoted per sqft or per acre (common for agricultural land). */
export type RateUnit = 'sqft' | 'acre'
/** Frontage is a length, so it gets its own unit domain. */
export type FrontUnit = 'ft' | 'm'
export type ListingStatus = 'Available' | 'Under discussion' | 'Sold'
/**
 * How far the poster is from the property:
 *   Owner  — the contact is the owner
 *   Direct — exactly one broker in between
 *   Broker — a longer chain of brokers
 */
export const CONTACT_TYPES = ['Broker', 'Direct', 'Owner'] as const

export type ContactType = (typeof CONTACT_TYPES)[number]
export type Visibility = 'public' | 'private'

export const LISTING_STATUSES: ListingStatus[] = [
  'Available',
  'Under discussion',
  'Sold',
]

export interface ListingMedia {
  id: string
  listing_id: string
  media_type: 'photo' | 'video'
  storage_path: string
  /** Which object store holds the file — 'supabase' (legacy) or 'r2'. */
  storage_provider?: 'supabase' | 'r2'
  position: number
  /** Signed URL, resolved client-side after fetch (files are private). */
  url?: string
}

export interface Listing {
  id: string
  address_line1: string
  address_line2: string | null
  city: string
  state: string
  pincode: string | null
  property_type: PropertyType
  area: number
  area_unit: AreaUnit
  rate: number
  /** Unit `rate` was quoted in. */
  rate_unit: RateUnit
  /** `rate` normalised to ₹/sqft — always filter/compare on this, not `rate`. */
  rate_per_sqft: number
  /** Road-facing frontage as a LENGTH (see front_unit). Optional. */
  front: number | null
  front_unit: FrontUnit
  /** Poster's choice: do other members see the rate (and total)? */
  rate_visible: boolean
  /** public = on everyone's board; private = poster's own reference only. */
  visibility: Visibility
  contact_type: ContactType
  notes: string | null
  latitude: number
  longitude: number
  status: ListingStatus
  area_sqft: number
  deal_value: number
  created_by: string
  created_at: string
  updated_at: string
  /** R2 path of the cached satellite thumbnail; null until generated. */
  static_map_path: string | null
  /** Signed URL for `static_map_path`, resolved client-side alongside media. */
  static_map_url?: string
  poster: { name: string; phone: string } | null
  listing_media: ListingMedia[]
}

/**
 * Shared PostgREST select for a listing with its poster and media. Kept in one
 * place so every read path fetches the same shape.
 *
 * `listing_media(*)` is deliberate: selecting the column list explicitly would
 * hard-fail with "column storage_provider does not exist" on any deployment
 * where the frontend ships before migration 009 runs — blanking the whole
 * board. With `*` the column simply appears once the migration lands, and the
 * storage adapter treats a missing value as 'supabase'.
 */
export const LISTING_SELECT =
  '*, poster:profiles!created_by(name, phone), listing_media(*)'

/** Address lines for card display: line1, line2 (if any), "City, State - PIN". */
export function addressLines(l: Listing): string[] {
  const lines = [l.address_line1]
  if (l.address_line2?.trim()) lines.push(l.address_line2)
  lines.push(`${l.city}, ${l.state}${l.pincode ? ` - ${l.pincode}` : ''}`)
  return lines
}

/** One-line address, used in shares and notifications. */
export function addressOneLine(l: Listing): string {
  return addressLines(l).join(', ')
}
