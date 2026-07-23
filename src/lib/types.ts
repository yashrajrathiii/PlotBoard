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
export type ListingStatus = 'Available' | 'Under discussion' | 'Sold'
export type ContactType = 'Owner direct' | 'Broker'
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
  position: number
  /** Signed URL, resolved client-side after fetch (bucket is private). */
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
  poster: { name: string; phone: string } | null
  listing_media: ListingMedia[]
}

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
