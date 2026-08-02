import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, EyeOff, Globe, Lock, MapPin, Phone, UserRound } from 'lucide-react'
import { addressLines, type Listing, type ListingStatus } from '../lib/types'
import {
  formatAreaEntered,
  formatINR,
  formatINRCompact,
  formatRateEntered,
  timeAgo,
} from '../lib/format'
import { useAuth } from '../context/AuthContext'
import { useShareSelection } from '../context/ShareSelectionContext'
import MediaCarousel from './MediaCarousel'
import ShareMenu from './ShareMenu'

const statusStyles: Record<ListingStatus, string> = {
  Available: 'bg-emerald-100 text-emerald-700',
  'Under discussion': 'bg-amber-100 text-amber-700',
  Sold: 'bg-gray-200 text-gray-600',
}

export function StatusChip({ status }: { status: ListingStatus }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusStyles[status]}`}
    >
      {status}
    </span>
  )
}

function VisibilityChip({ visibility }: { visibility: Listing['visibility'] }) {
  return (
    <span className="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium bg-gray-100 text-gray-600 border border-gray-200">
      {visibility === 'private' ? (
        <>
          <Lock size={10} /> Private
        </>
      ) : (
        <>
          <Globe size={10} /> Public
        </>
      )}
    </span>
  )
}

function PosterRow({ listing }: { listing: Listing }) {
  return (
    <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
      <span className="flex items-center gap-1.5 text-xs text-gray-600 min-w-0">
        <UserRound size={13} className="shrink-0 text-gray-400" />
        <span className="truncate">{listing.poster?.name || 'Member'}</span>
        <span className="text-gray-300">·</span>
        <span className="shrink-0 text-gray-500">{listing.contact_type}</span>
      </span>
      <span className="flex items-center gap-2 shrink-0">
        {listing.poster?.phone && (
          <a
            href={`tel:+91${listing.poster.phone}`}
            onClick={(e) => e.stopPropagation()}
            className="text-emerald-600 hover:text-emerald-700"
            aria-label={`Call ${listing.poster.name}`}
          >
            <Phone size={14} />
          </a>
        )}
        <span className="text-[11px] text-gray-400">{timeAgo(listing.created_at)}</span>
      </span>
    </div>
  )
}

/** "On request" chip shown in place of a private rate. */
function RateHidden() {
  return (
    <span className="inline-flex items-center gap-1 text-sm text-gray-400">
      <EyeOff size={13} /> On request
    </span>
  )
}

/**
 * Clickable summary card — the whole card navigates to the single-listing
 * view; interactive controls inside (share, call) stop propagation so they
 * don't trigger the navigation. Two layouts:
 *  - Mobile (< sm): compact broker-style card (thumbnail + address + rows).
 *  - Desktop (sm+): media carousel (photos ⇄ map) on top, details below.
 * `showVisibility` (My Listings) adds a Public/Private badge.
 */
export default function ListingCard({
  listing,
  showVisibility = false,
}: {
  listing: Listing
  showVisibility?: boolean
}) {
  const photos = listing.listing_media.filter((m) => m.media_type === 'photo')
  const thumb = photos.find((p) => p.url)?.url
  const [shareOpen, setShareOpen] = useState(false)
  const { session } = useAuth()
  const navigate = useNavigate()
  const selection = useShareSelection()
  const selected = selection.isSelected(listing.id)
  const canSeeRate = listing.rate_visible || listing.created_by === session?.user.id
  const lines = addressLines(listing)

  const open = () => {
    if (!selection.active) navigate(`/listing/${listing.id}`)
  }
  const stop = (e: React.MouseEvent) => e.stopPropagation()

  return (
    <article
      onClick={open}
      className={`relative isolate flex flex-col h-full bg-white rounded-2xl shadow-sm border cursor-pointer transition-shadow hover:shadow-md ${
        selection.active && selected
          ? 'border-emerald-500 ring-2 ring-emerald-500'
          : 'border-gray-200'
      } ${shareOpen ? 'z-40' : ''}`}
    >
      {/* Selection mode: a full-card click layer (above the Leaflet map) that
          toggles this card, plus a checkbox in the corner — WhatsApp style. */}
      {selection.active && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              selection.toggle(listing)
            }}
            aria-label={selected ? 'Deselect listing' : 'Select listing'}
            className="absolute inset-0 z-[1000]"
          />
          <span
            className={`absolute top-2 left-2 z-[1001] h-6 w-6 rounded-md border-2 flex items-center justify-center pointer-events-none ${
              selected
                ? 'bg-emerald-500 border-emerald-500 text-white'
                : 'bg-white/90 border-gray-400'
            }`}
          >
            {selected && <Check size={15} />}
          </span>
        </>
      )}
      {/* ---------- Mobile compact layout ---------- */}
      <div className="sm:hidden p-3.5">
        <div className="flex gap-3">
          {thumb ? (
            <img
              src={thumb}
              alt={listing.address_line1}
              className="w-16 h-16 rounded-lg object-cover shrink-0"
              loading="lazy"
            />
          ) : (
            <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
              <MapPin size={22} className="text-gray-300" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-1">
              <h3 className="font-semibold text-gray-900 leading-tight">
                {listing.property_type}
              </h3>
              {!selection.active && (
                <span onClick={stop}>
                  <ShareMenu
                    listing={listing}
                    onOpenChange={setShareOpen}
                    allowMultiSelect
                  />
                </span>
              )}
            </div>
            {lines.map((line) => (
              <p key={line} className="text-sm text-gray-600 truncate leading-snug">
                {line}
              </p>
            ))}
            <div className="mt-1 flex items-center gap-1.5">
              <StatusChip status={listing.status} />
              {showVisibility && <VisibilityChip visibility={listing.visibility} />}
            </div>
          </div>
        </div>

        <dl className="mt-3 pt-2 border-t border-gray-100 space-y-1.5">
          <div className="flex items-center justify-between">
            <dt className="text-sm text-gray-500">Size</dt>
            <dd className="text-sm text-gray-900">
              {formatAreaEntered(listing.area, listing.area_unit)}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-sm text-gray-500">Rate</dt>
            <dd className="text-sm text-gray-900">
              {canSeeRate ? (
                formatRateEntered(listing.rate, listing.rate_unit)
              ) : (
                <RateHidden />
              )}
            </dd>
          </div>
          {canSeeRate && (
            <div className="flex items-center justify-between">
              <dt className="text-sm text-gray-500">Total</dt>
              <dd className="text-sm font-bold text-gray-900">
                {formatINR(listing.deal_value)}
              </dd>
            </div>
          )}
        </dl>

        {listing.notes && (
          <p className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500 line-clamp-1">
            {listing.notes}
          </p>
        )}

        <div className="mt-2">
          <PosterRow listing={listing} />
        </div>
      </div>

      {/* ---------- Desktop layout with media carousel ----------
          Card is a full-height flex column; the top block holds the
          variable-length content and the contact row is pinned to the
          bottom (mt-auto) so every card's footer lines up. */}
      <div className="hidden sm:flex sm:flex-col sm:flex-1">
        <div className="rounded-t-2xl overflow-hidden" onClick={stop}>
          <MediaCarousel
            photos={photos}
            latitude={listing.latitude}
            longitude={listing.longitude}
            label={listing.address_line1}
          />
        </div>

        <div className="p-3.5 flex flex-1 flex-col">
          <div className="space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-gray-900 leading-tight flex-1 min-w-0 truncate">
                {listing.address_line1}
              </h3>
              <StatusChip status={listing.status} />
              {showVisibility && <VisibilityChip visibility={listing.visibility} />}
              {!selection.active && (
                <span onClick={stop}>
                  <ShareMenu
                    listing={listing}
                    onOpenChange={setShareOpen}
                    allowMultiSelect
                  />
                </span>
              )}
            </div>

            <p className="text-sm text-gray-500 -mt-1">
              {listing.address_line2 ? `${listing.address_line2}, ` : ''}
              {listing.city}, {listing.state}
              {listing.pincode ? ` - ${listing.pincode}` : ''}
            </p>

            <p className="text-sm text-gray-600">
              {listing.property_type} · {formatAreaEntered(listing.area, listing.area_unit)}
            </p>

            <p className="text-sm text-gray-600">
              {canSeeRate ? (
                <>
                  {formatRateEntered(listing.rate, listing.rate_unit)}
                  <span
                    className="ml-2 font-semibold text-emerald-700"
                    title={formatINR(listing.deal_value)}
                  >
                    {formatINRCompact(listing.deal_value)}
                  </span>
                </>
              ) : (
                <RateHidden />
              )}
            </p>

            {listing.notes && (
              <p className="text-xs text-gray-500 line-clamp-2">{listing.notes}</p>
            )}
          </div>

          <div className="mt-auto">
            <PosterRow listing={listing} />
          </div>
        </div>
      </div>
    </article>
  )
}
