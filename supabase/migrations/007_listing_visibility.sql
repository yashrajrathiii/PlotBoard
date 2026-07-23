-- ============================================================================
-- PlotBoard — Migration 007: public/private listings
--
-- A broker can keep a listing private (own reference only). Enforced with
-- RLS, not just UI: the SELECT policy itself hides private rows from
-- everyone but the poster, so the Data API and Realtime never ship them to
-- other members at all. Media rows inherit the rule by checking the parent
-- listing's visibility through its own RLS.
-- ============================================================================

alter table public.listings
  add column visibility text not null default 'public'
  check (visibility in ('public', 'private'));

create index listings_visibility_idx on public.listings (visibility);

comment on column public.listings.visibility is
  'public = every member sees it on the board; private = only the poster.';

-- Replace the read-all policy: public rows or your own.
drop policy "listings: authenticated can read all" on public.listings;
create policy "listings: read public or own"
  on public.listings for select
  to authenticated
  using (visibility = 'public' or created_by = auth.uid());

-- Media follows its listing: the subquery runs under the caller's listings
-- RLS, so media of someone else's private listing yields no parent row.
drop policy "media: authenticated can read all" on public.listing_media;
create policy "media: read via visible listing"
  on public.listing_media for select
  to authenticated
  using (
    exists (select 1 from public.listings l where l.id = listing_id)
  );

-- The status RPC is definer-rights (bypasses RLS), so it must repeat the
-- visibility rule: you can only change status on listings you can see.
create or replace function public.update_listing_status(
  p_listing_id uuid,
  p_status public.listing_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.listings
  set status = p_status
  where id = p_listing_id
    and (visibility = 'public' or created_by = auth.uid());

  if not found then
    raise exception 'Listing not found';
  end if;
end;
$$;
