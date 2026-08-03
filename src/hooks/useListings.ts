import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { LISTING_SELECT, type Listing } from '../lib/types'
import { resolveMediaUrls } from '../lib/mediaStorage'

/**
 * Loads the whole board (newest first) with poster contact and media rows,
 * then resolves display URLs for the media. Files may live in Supabase Storage
 * (legacy) or Cloudflare R2 (new) — the storage adapter handles both.
 * `reload` covers manual refreshes.
 */
export function useListings() {
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const { data, error } = await supabase
      .from('listings')
      .select(LISTING_SELECT)
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

    // One batch per storage provider for the whole board — listing media plus
    // the cached satellite thumbnails, resolved together in the same round trip.
    const allMedia = rows.flatMap((l) => l.listing_media)
    const thumbs = rows
      .filter((l) => l.static_map_path)
      .map((l) => ({ storage_path: l.static_map_path!, storage_provider: 'r2' as const }))
    const urlByPath = await resolveMediaUrls([...allMedia, ...thumbs])
    for (const m of allMedia) {
      m.url = urlByPath.get(m.storage_path)
    }
    for (const l of rows) {
      if (l.static_map_path) l.static_map_url = urlByPath.get(l.static_map_path)
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
