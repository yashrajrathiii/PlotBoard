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

  // `.select()` matters: a DELETE filtered out by RLS affects zero rows and
  // still returns error === null. Without checking what came back, a blocked
  // delete would look like success and the UI would navigate away while the
  // listing was still there.
  const { data, error } = await supabase
    .from('listings')
    .delete()
    .eq('id', listing.id)
    .select('id')

  if (error) return error.message
  if (!data || data.length === 0) {
    return "That listing couldn't be deleted — it may already be gone, or it isn't yours to delete."
  }
  return null
}
