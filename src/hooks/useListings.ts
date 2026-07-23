import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Listing } from '../lib/types'

/**
 * Loads the whole board (newest first) with poster contact and media rows,
 * then resolves signed URLs for the private bucket in one batch call.
 * Realtime refresh arrives in a later stage; `reload` covers manual cases.
 */
export function useListings() {
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const { data, error } = await supabase
      .from('listings')
      .select(
        '*, poster:profiles!created_by(name, phone), listing_media(id, listing_id, media_type, storage_path, position)',
      )
      .order('created_at', { ascending: false })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    const rows = (data ?? []) as unknown as Listing[]
    for (const row of rows) {
      row.listing_media.sort((a, b) => a.position - b.position)
    }

    // One signed-URL batch for every media file on the board (1 hour expiry).
    const paths = rows.flatMap((l) => l.listing_media.map((m) => m.storage_path))
    if (paths.length > 0) {
      const { data: signed } = await supabase.storage
        .from('listing-media')
        .createSignedUrls(paths, 3600)
      const urlByPath = new Map<string, string>()
      for (const s of signed ?? []) {
        if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl)
      }
      for (const row of rows) {
        for (const m of row.listing_media) {
          m.url = urlByPath.get(m.storage_path)
        }
      }
    }

    setListings(rows)
    setError(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { listings, loading, error, reload }
}
