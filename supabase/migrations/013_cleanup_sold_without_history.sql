-- 013_cleanup_sold_without_history.sql
--
-- Fixes a silent storage leak in the sold-media sweep.
--
-- media_pending_cleanup found the sale date via
--   (select max(changed_at) from status_history where new_status = 'Sold')
-- which returns NULL for a listing that has no recorded Sold *transition* —
-- one created already Sold, or sold before the history trigger existed. In SQL
-- `NULL < anything` is NULL, not true, so those rows never matched and their
-- media would have been retained forever.
--
-- That is exactly the case the 10 GB free tier cannot afford: storage that only
-- grows. A real listing in this database already has status = 'Sold' with no
-- Sold row in status_history, so this is not hypothetical.
--
-- The fallback is `updated_at` rather than `created_at` deliberately. Deleting
-- media is irreversible, so the tie-breaker should err toward keeping files
-- too long rather than dropping them too early: a listing sold long before the
-- trigger existed would, under created_at, be swept on the very first run.

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
    and coalesce(
          (
            select max(sh.changed_at)
            from public.status_history sh
            where sh.listing_id = l.id
              and sh.new_status = 'Sold'
          ),
          l.updated_at
        ) < now() - make_interval(days => retention_days);
$$;

-- CREATE OR REPLACE preserves existing grants, but this is re-asserted so the
-- guarantee lives with the definition: the sweep runs without a user session
-- and must never be callable by a member.
revoke execute on function public.media_pending_cleanup(int) from public, anon, authenticated;
