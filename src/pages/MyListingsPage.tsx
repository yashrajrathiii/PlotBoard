import { Link } from 'react-router-dom'
import { FolderOpen, Plus, Share2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useListings } from '../hooks/useListings'
import { useShareSelection } from '../context/ShareSelectionContext'
import ListingResults from '../components/ListingResults'
import NotificationBell from '../components/NotificationBell'

/**
 * Every listing the signed-in broker posted — public AND private. Cards open
 * the single-listing view, where Edit/Delete live. Private listings only ever
 * exist here (RLS keeps them off everyone else's board).
 */
export default function MyListingsPage() {
  const { session } = useAuth()
  const { listings, loading, error } = useListings()
  const selection = useShareSelection()
  const mine = listings.filter((l) => l.created_by === session?.user.id)

  return (
    <div className={`p-4 ${selection.active ? 'pb-24' : ''}`}>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-gray-900">
          My Listings
          {!loading && (
            <span className="ml-2 text-sm font-normal text-gray-500">
              {mine.length} listing{mine.length === 1 ? '' : 's'}
            </span>
          )}
        </h1>
        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <NotificationBell />
          </div>
          {!selection.active && mine.length > 0 && (
            <button
              onClick={() => selection.enter()}
              className="flex items-center gap-1.5 border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium rounded-lg px-3 py-2"
            >
              <Share2 size={16} /> <span className="hidden sm:inline">Share</span>
            </button>
          )}
          <Link
            to="/add"
            className="hidden sm:flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg px-3.5 py-2"
          >
            <Plus size={16} /> Add listing
          </Link>
        </div>
      </div>

      <ListingResults
        listings={mine}
        loading={loading}
        error={error}
        showVisibility
        emptyState={
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 text-center">
            <FolderOpen size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="font-medium text-gray-900">
              You haven't posted any listings yet
            </p>
            <p className="text-sm text-gray-600 mt-1">
              Tap Add to post your first property lead — public for the board, or
              private just for you.
            </p>
          </div>
        }
      />

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
