import { supabase } from './supabase'

/**
 * The broker or owner a poster is dealing with — their own private note on a
 * listing.
 *
 * THE SERVER IS THE GUARD, NOT THIS MODULE. `listing_private_contacts` has RLS
 * scoped to `listings.created_by = auth.uid()`, so a non-owner asking for
 * someone else's row simply gets nothing back. That means the UI needs no
 * ownership check of its own — and, more importantly, that a UI bug cannot leak
 * the data the way `rate_visible` would (which is only a UI curtain).
 *
 * Deliberately never imported by `share.ts`: the share text is built from
 * `Listing`, which has no such field, so there is no code path from here to a
 * WhatsApp message.
 */
export interface PrivateContact {
  name: string
  phone: string
}

/** Null for a non-owner, and null when nothing was ever saved. */
export async function getPrivateContact(listingId: string): Promise<PrivateContact | null> {
  const { data, error } = await supabase
    .from('listing_private_contacts')
    .select('name, phone')
    .eq('listing_id', listingId)
    .maybeSingle()

  if (error || !data) return null
  return { name: data.name ?? '', phone: data.phone ?? '' }
}

/**
 * Upsert, or delete the row when nothing is left to store.
 *
 * Both fields are optional, so "no contact" is represented by the absence of a
 * row rather than a row of empty strings — that keeps `getPrivateContact`
 * honest and stops a listing switched to `Owner` from quietly retaining a
 * third party's phone number.
 *
 * Failures are returned, not thrown: a listing must still save even if this
 * side note doesn't.
 */
export async function savePrivateContact(
  listingId: string,
  contact: { name: string; phone: string } | null,
): Promise<{ error: string | null }> {
  const name = contact?.name.trim() ?? ''
  const phone = contact?.phone.trim() ?? ''

  if (!name && !phone) {
    const { error } = await supabase
      .from('listing_private_contacts')
      .delete()
      .eq('listing_id', listingId)
    return { error: error?.message ?? null }
  }

  const { error } = await supabase.from('listing_private_contacts').upsert(
    {
      listing_id: listingId,
      name: name || null,
      phone: phone || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'listing_id' },
  )
  return { error: error?.message ?? null }
}
