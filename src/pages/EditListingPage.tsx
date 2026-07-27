import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useListing } from '../hooks/useListing'
import ListingForm from '../components/ListingForm'
import { FullScreenSpinner } from '../components/Protected'

/**
 * Loads one listing (media URLs resolved by the shared hook) and guards
 * poster-only access.
 */
export default function EditListingPage() {
  const { id } = useParams<{ id: string }>()
  const { session } = useAuth()
  const navigate = useNavigate()
  const { listing, loading } = useListing(id)

  const isOwner = !!listing && listing.created_by === session?.user.id

  useEffect(() => {
    // RLS already hides other people's private rows; this guard covers public
    // listings that simply aren't yours.
    if (!loading && !isOwner) navigate('/my-listings', { replace: true })
  }, [loading, isOwner, navigate])

  if (loading || !listing || !isOwner) return <FullScreenSpinner />
  return <ListingForm existing={listing} />
}
