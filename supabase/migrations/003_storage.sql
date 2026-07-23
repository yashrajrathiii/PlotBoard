-- ============================================================================
-- PlotBoard — Migration 003: Storage bucket + policies for listing media
--
-- One PRIVATE bucket, 'listing-media'. Nothing in it is publicly reachable;
-- the app displays files via signed URLs (or authenticated download), so a
-- leaked link does not expose photos to non-members.
--
-- Path convention used by the frontend:  <listing_id>/<uuid>.<ext>
-- Server-side caps (defence in depth behind the client-side checks):
--   * file_size_limit 20 MB — the video hard cap; photos are compressed
--     client-side to ~500 KB, far below this.
--   * allowed_mime_types — images and common phone-camera video formats only.
-- The 30-second video duration cap can only be checked client-side (the
-- storage layer cannot inspect media duration).
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-media',
  'listing-media',
  false,                     -- private: reads require an authenticated session
  20971520,                  -- 20 MB hard cap per file
  array[
    'image/jpeg', 'image/png', 'image/webp',
    'video/mp4', 'video/webm', 'video/quicktime'
  ]
);

-- ----------------------------------------------------------------------------
-- storage.objects policies (RLS is already enabled on storage tables).
-- Supabase sets objects.owner_id to the uploader's auth.uid() automatically,
-- which gives us "only the poster can delete their own files" for free.
-- ----------------------------------------------------------------------------

-- Any signed-in user can view any listing's media.
create policy "listing-media: authenticated read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'listing-media');

-- Uploads must land in this bucket as yourself.
create policy "listing-media: authenticated upload as self"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'listing-media'
    and owner_id = (select auth.uid()::text)
  );

-- Only the uploader can delete their own files.
create policy "listing-media: owner delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'listing-media'
    and owner_id = (select auth.uid()::text)
  );
