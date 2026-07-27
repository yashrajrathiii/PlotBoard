import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { LISTING_SELECT, type Listing } from '../lib/types'
import { resolveMediaUrls } from '../lib/mediaStorage'

/**
 * Loads a single listing (with poster contact + media) and resolves its media
 * URLs from whichever store holds each file. RLS still applies: a private
 * listing that isn't yours resolves to null, exactly as if it didn't exist.
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
      .select(LISTING_SELECT)
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
      const urlByPath = await resolveMediaUrls(row.listing_media)
      for (const m of row.listing_media) {
        m.url = urlByPath.get(m.storage_path)
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
