import { supabase } from './supabase'
import type { Listing } from './types'

/**
 * Permanently deletes a listing and its stored media files (RLS ensures only
 * the poster can do this). Returns an error message, or null on success.
 */
export async function deleteListing(
  listing: Pick<Listing, 'id' | 'listing_media'>,
): Promise<string | null> {
  const paths = listing.listing_media.map((m) => m.storage_path)
  if (paths.length > 0) {
    await supabase.storage.from('listing-media').remove(paths)
  }
  const { error } = await supabase.from('listings').delete().eq('id', listing.id)
  return error ? error.message : null
}
