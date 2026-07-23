import { Link } from 'react-router-dom'
import { Inbox, Plus, Share2 } from 'lucide-react'
import { useListings } from '../hooks/useListings'
import { useShareSelection } from '../context/ShareSelectionContext'
import ListingResults from '../components/ListingResults'
import NotificationBell from '../components/NotificationBell'

export default function BoardPage() {
  const { listings: allListings, loading, error } = useListings()
  const selection = useShareSelection()
  // The shared board shows public listings only; a broker's private entries
  // live on My Listings (RLS already hides them from everyone else anyway).
  const listings = allListings.filter((l) => l.visibility === 'public')

  return (
    <div className={`p-4 ${selection.active ? 'pb-24' : ''}`}>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-gray-900">
          Board
          {!loading && (
            <span className="ml-2 text-sm font-normal text-gray-500">
              {listings.length} listing{listings.length === 1 ? '' : 's'}
            </span>
          )}
        </h1>
        <div className="flex items-center gap-2">
          {/* Desktop notification bell (mobile keeps the one in the top bar) */}
          <div className="hidden sm:block">
            <NotificationBell />
          </div>
          {!selection.active && listings.length > 0 && (
            <button
              onClick={() => selection.enter()}
              className="flex items-center gap-1.5 border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium rounded-lg px-3 py-2"
            >
              <Share2 size={16} /> <span className="hidden sm:inline">Share</span>
            </button>
          )}
          {/* Desktop add button; mobile uses the floating button below */}
          <Link
            to="/add"
            className="hidden sm:flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg px-3.5 py-2"
          >
            <Plus size={16} /> Add listing
          </Link>
        </div>
      </div>

      <ListingResults
        listings={listings}
        loading={loading}
        error={error}
        emptyState={
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 text-center">
            <Inbox size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="font-medium text-gray-900">No listings yet</p>
            <p className="text-sm text-gray-600 mt-1">
              Be the first — tap Add to post a property lead.
            </p>
          </div>
        }
      />

      {/* Mobile floating Add+ button — hidden while selecting (the selection
          bar owns the bottom of the screen then). */}
      {!selection.active && (
        <Link
          to="/add"
          aria-label="Add listing"
          className="sm:hidden fixed bottom-20 right-4 z-30 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full p-4 shadow-lg"
        >
          <Plus size={24} />
        </Link>
      )}
    </div>
  )
}
