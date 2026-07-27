import { supabase } from './supabase'
import { deleteMedia } from './mediaStorage'
import type { Listing } from './types'

/**
 * Permanently deletes a listing and its stored media files (RLS ensures only
 * the poster can do this). Media may live in Supabase Storage or R2 — the
 * storage adapter removes it from whichever holds it.
 * Returns an error message, or null on success.
 */
export async function deleteListing(
  listing: Pick<Listing, 'id' | 'listing_media'>,
): Promise<string | null> {
  await deleteMedia(listing.listing_media)
  const { error } = await supabase.from('listings').delete().eq('id', listing.id)
  return error ? error.message : null
}
