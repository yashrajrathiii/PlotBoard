import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import ListingForm from '../components/ListingForm'
import { FullScreenSpinner } from '../components/Protected'
import type { Listing } from '../lib/types'

/** Loads one listing, signs its media URLs, and guards poster-only access. */
export default function EditListingPage() {
  const { id } = useParams<{ id: string }>()
  const { session } = useAuth()
  const navigate = useNavigate()
  const [listing, setListing] = useState<Listing | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('listings')
        .select(
          '*, poster:profiles!created_by(name, phone), listing_media(id, listing_id, media_type, storage_path, position)',
        )
        .eq('id', id)
        .maybeSingle()

      const row = data as unknown as Listing | null
      // RLS already hides other people's private rows; this guard covers
      // public listings that simply aren't yours.
      if (!row || row.created_by !== session?.user.id) {
        navigate('/my-listings', { replace: true })
        return
      }
      row.listing_media.sort((a, b) => a.position - b.position)
      const paths = row.listing_media.map((m) => m.storage_path)
      if (paths.length > 0) {
        const { data: signed } = await supabase.storage
          .from('listing-media')
          .createSignedUrls(paths, 3600)
        for (const s of signed ?? []) {
          const m = row.listing_media.find((x) => x.storage_path === s.path)
          if (m && s.signedUrl) m.url = s.signedUrl
        }
      }
      setListing(row)
      setLoading(false)
    }
    void load()
  }, [id, session?.user.id, navigate])

  if (loading || !listing) return <FullScreenSpinner />
  return <ListingForm existing={listing} />
}
