import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  EyeOff,
  Globe,
  Lock,
  Pencil,
  Phone,
  Trash2,
  UserRound,
} from 'lucide-react'
import { useListing } from '../hooks/useListing'
import { useAuth } from '../context/AuthContext'
import { deleteListing } from '../lib/listingActions'
import { addressLines, type Listing } from '../lib/types'
import { formatAreaEntered, formatINR, formatINRCompact, timeAgo } from '../lib/format'
import { FullScreenSpinner } from '../components/Protected'
import { StatusChip } from '../components/ListingCard'
import ListingGallery from '../components/ListingGallery'
import ShareMenu from '../components/ShareMenu'

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 last:border-0">
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900 text-right">{children}</dd>
    </div>
  )
}

export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { listing, loading } = useListing(id)
  const { session } = useAuth()
  const navigate = useNavigate()
  const [deleting, setDeleting] = useState(false)

  if (loading) return <FullScreenSpinner />

  if (!listing) {
    return (
      <div className="max-w-3xl mx-auto p-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
          <p className="font-medium text-gray-900">Listing not found</p>
          <p className="text-sm text-gray-600 mt-1">
            It may have been removed, or it's private to another member.
          </p>
          <Link
            to="/"
            className="inline-block mt-4 text-sm font-medium text-emerald-700 hover:underline"
          >
            Back to board
          </Link>
        </div>
      </div>
    )
  }

  const isOwner = listing.created_by === session?.user.id
  const canSeeRate = listing.rate_visible || isOwner
  const lines = addressLines(listing)

  const handleDelete = async (l: Listing) => {
    if (
      !window.confirm(
        `Delete "${l.address_line1}, ${l.city}" permanently? Its photos and video are removed too.`,
      )
    ) {
      return
    }
    setDeleting(true)
    const err = await deleteListing(l)
    if (err) {
      window.alert(`Could not delete: ${err}`)
      setDeleting(false)
      return
    }
    navigate('/my-listings', { replace: true })
  }

  return (
    <div className="max-w-3xl mx-auto p-4">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-3"
      >
        <ArrowLeft size={16} /> Back
      </button>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Gallery: photos + video + map */}
        <ListingGallery listing={listing} />

        <div className="p-5 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-gray-900">
                {listing.property_type}
              </h1>
              {lines.map((line) => (
                <p key={line} className="text-sm text-gray-600 leading-snug">
                  {line}
                </p>
              ))}
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <ShareMenu listing={listing} />
              <div className="flex items-center gap-1.5">
                {isOwner && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium bg-gray-100 text-gray-600 border border-gray-200">
                    {listing.visibility === 'private' ? (
                      <>
                        <Lock size={10} /> Private
                      </>
                    ) : (
                      <>
                        <Globe size={10} /> Public
                      </>
                    )}
                  </span>
                )}
                <StatusChip status={listing.status} />
              </div>
            </div>
          </div>

          {/* Details */}
          <dl className="rounded-xl border border-gray-100 px-4">
            <DetailRow label="Property type">{listing.property_type}</DetailRow>
            <DetailRow label="Total area">
              {formatAreaEntered(listing.area, listing.area_unit)}
            </DetailRow>
            <DetailRow label="Rate">
              {canSeeRate ? (
                `${formatINR(listing.rate)}/sqft`
              ) : (
                <span className="inline-flex items-center gap-1 text-gray-400">
                  <EyeOff size={13} /> On request
                </span>
              )}
            </DetailRow>
            {canSeeRate && (
              <DetailRow label="Total deal value">
                <span className="font-semibold text-emerald-700">
                  {formatINR(listing.deal_value)}{' '}
                  <span className="text-gray-400 font-normal">
                    ({formatINRCompact(listing.deal_value)})
                  </span>
                </span>
              </DetailRow>
            )}
            <DetailRow label="Contact type">{listing.contact_type}</DetailRow>
            <DetailRow label="Posted">{timeAgo(listing.created_at)}</DetailRow>
          </dl>

          {/* Notes */}
          {listing.notes && (
            <div>
              <h2 className="text-sm font-semibold text-gray-900 mb-1">Notes</h2>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{listing.notes}</p>
            </div>
          )}

          {/* Poster contact */}
          <div className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 border border-gray-100 p-3">
            <span className="flex items-center gap-2 min-w-0">
              <span className="bg-emerald-100 text-emerald-700 rounded-full p-2">
                <UserRound size={16} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-gray-900 truncate">
                  {listing.poster?.name || 'Member'}
                </span>
                <span className="block text-xs text-gray-500">
                  {listing.contact_type}
                  {listing.poster?.phone ? ` · +91 ${listing.poster.phone}` : ''}
                </span>
              </span>
            </span>
            {listing.poster?.phone && (
              <a
                href={`tel:+91${listing.poster.phone}`}
                className="shrink-0 flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg px-3 py-2"
              >
                <Phone size={15} /> Call
              </a>
            )}
          </div>

          {/* Owner actions — inside the listing view */}
          {isOwner && (
            <div className="flex gap-2 border-t border-gray-100 pt-4">
              <Link
                to={`/edit/${listing.id}`}
                className="flex-1 flex items-center justify-center gap-1.5 border border-emerald-600 text-emerald-700 hover:bg-emerald-50 text-sm font-medium rounded-lg py-2.5"
              >
                <Pencil size={15} /> Edit listing
              </Link>
              <button
                onClick={() => void handleDelete(listing)}
                disabled={deleting}
                className="flex-1 flex items-center justify-center gap-1.5 border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 text-sm font-medium rounded-lg py-2.5"
              >
                <Trash2 size={15} /> {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
