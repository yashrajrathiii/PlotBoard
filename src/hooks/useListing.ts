import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Listing } from '../lib/types'

/**
 * Loads a single listing (with poster contact + media) and signs its media
 * URLs for the private bucket. RLS still applies: a private listing that
 * isn't yours resolves to null, exactly as if it didn't exist.
 */
export function useListing(id: string | undefined) {
  const [listing, setListing] = useState<Listing | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!id) {
      setLoading(false)
      return
    }
    const { data, error } = await supabase
      .from('listings')
      .select(
        '*, poster:profiles!created_by(name, phone), listing_media(id, listing_id, media_type, storage_path, position)',
      )
      .eq('id', id)
      .maybeSingle()

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    const row = data as unknown as Listing | null
    if (row) {
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
    }

    setListing(row)
    setError(null)
    setLoading(false)
  }, [id])

  useEffect(() => {
    void reload()
  }, [reload])

  return { listing, loading, error, reload }
}
