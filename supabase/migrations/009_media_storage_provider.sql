-- ============================================================================
-- PlotBoard — Migration 009: multi-provider media storage
--
-- Photos and video move to Cloudflare R2 (10 GB free + unlimited free egress);
-- text/relational data stays in Supabase. This migration only teaches the
-- schema *where* each file lives — existing rows keep pointing at Supabase
-- Storage, so nothing breaks and no file has to be migrated.
--
--   storage_provider = 'supabase' → legacy files, read via signed Storage URLs
--   storage_provider = 'r2'       → new files, read via presigned R2 URLs
--
-- Also adds an index supporting the "delete media 30 days after a listing was
-- marked Sold" sweep, which reads the most recent Sold transition out of
-- status_history.
-- ============================================================================

alter table public.listing_media
  add column storage_provider text not null default 'supabase'
  check (storage_provider in ('supabase', 'r2'));

comment on column public.listing_media.storage_provider is
  'Which object store holds this file. New uploads are ''r2''; ''supabase'' is legacy.';

-- The cleanup sweep looks up "when did this listing last become Sold?".
create index if not exists status_history_sold_idx
  on public.status_history (listing_id, new_status, changed_at desc);

-- ----------------------------------------------------------------------------
-- media_pending_cleanup — media belonging to listings that were marked Sold
-- more than `retention_days` ago. The scheduled cleanup job reads this and
-- deletes the objects from R2 (and then these rows).
--
-- SECURITY DEFINER + admin/service-only execute: the job runs without a user
-- session, and this must never be callable by a normal member.
-- ----------------------------------------------------------------------------
create or replace function public.media_pending_cleanup(retention_days int default 30)
returns table (
  id uuid,
  listing_id uuid,
  storage_path text,
  storage_provider text
)
language sql
security definer
set search_path = public
as $$
  select lm.id, lm.listing_id, lm.storage_path, lm.storage_provider
  from public.listing_media lm
  join public.listings l on l.id = lm.listing_id
  where l.status = 'Sold'
    and (
      select max(sh.changed_at)
      from public.status_history sh
      where sh.listing_id = l.id
        and sh.new_status = 'Sold'
    ) < now() - make_interval(days => retention_days);
$$;

revoke execute on function public.media_pending_cleanup(int) from public, anon, authenticated;
