-- ============================================================================
-- PlotBoard — Migration 002: Row Level Security + Data API grants
--
-- Two layers work together here:
--   1. GRANTs — new Supabase projects require explicit Postgres privileges
--      for the Data API roles (anon / authenticated). No grant = no access,
--      before RLS is even consulted. We grant `anon` nothing on our tables:
--      this app is invite-only, so logged-out visitors can read nothing.
--   2. RLS policies — per-row rules for the `authenticated` role.
--
-- Permission model (all users share one role):
--   listings:        everyone reads; insert as self; edit/delete own rows only;
--                    non-owners change status via the update_listing_status RPC.
--   listing_media:   everyone reads; attach only to your own listings; delete own.
--   profiles:        everyone reads (poster name/phone on cards); edit own
--                    name+phone only (column grant stops is_admin self-promotion).
--   status_history:  read-only for everyone; written only by the definer trigger.
--   notifications:   you see only your own; you can only mark them read.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enable RLS everywhere. deny-by-default until a policy grants access.
-- ----------------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.listings       enable row level security;
alter table public.listing_media  enable row level security;
alter table public.status_history enable row level security;
alter table public.notifications  enable row level security;

-- ----------------------------------------------------------------------------
-- Grants (Data API). Schema usage for both API roles; table privileges only
-- for authenticated, and only the operations each table actually needs.
-- ----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

-- profiles: column-level UPDATE grant means even the owner cannot flip
-- their own is_admin flag — Postgres rejects the column before RLS runs.
grant select                on public.profiles to authenticated;
grant update (name, phone)  on public.profiles to authenticated;

grant select, insert, update, delete on public.listings      to authenticated;
grant select, insert, delete         on public.listing_media to authenticated;
grant select                         on public.status_history to authenticated;
grant select                         on public.notifications  to authenticated;
grant update (read)                  on public.notifications  to authenticated;

-- Identity sequences (status_history, notifications) are only used by
-- definer-rights triggers, so no sequence grants are needed for API roles.

-- ----------------------------------------------------------------------------
-- profiles policies
-- ----------------------------------------------------------------------------
create policy "profiles: authenticated can read all"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles: users update own name/phone"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- No INSERT/DELETE policies: rows are created by the auth trigger and
-- removed via the auth.users cascade.

-- ----------------------------------------------------------------------------
-- listings policies
-- ----------------------------------------------------------------------------
create policy "listings: authenticated can read all"
  on public.listings for select
  to authenticated
  using (true);

-- created_by defaults to auth.uid(); the check stops anyone spoofing another
-- user as poster.
create policy "listings: insert as self"
  on public.listings for insert
  to authenticated
  with check (created_by = auth.uid());

-- Full-field edits: owner only. Non-owners change status through the
-- update_listing_status() RPC (see migration 001), which is definer-rights
-- and therefore not subject to this policy.
create policy "listings: owner updates own"
  on public.listings for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy "listings: owner deletes own"
  on public.listings for delete
  to authenticated
  using (created_by = auth.uid());

-- ----------------------------------------------------------------------------
-- listing_media policies
-- ----------------------------------------------------------------------------
create policy "media: authenticated can read all"
  on public.listing_media for select
  to authenticated
  using (true);

-- You may only attach media to listings you posted.
create policy "media: attach to own listings"
  on public.listing_media for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.listings l
      where l.id = listing_id and l.created_by = auth.uid()
    )
  );

create policy "media: delete own"
  on public.listing_media for delete
  to authenticated
  using (created_by = auth.uid());

-- ----------------------------------------------------------------------------
-- status_history policies — read-only audit trail. No insert/update/delete
-- policies exist; only the definer-rights trigger writes here.
-- ----------------------------------------------------------------------------
create policy "history: authenticated can read all"
  on public.status_history for select
  to authenticated
  using (true);

-- ----------------------------------------------------------------------------
-- notifications policies — private to the recipient.
-- ----------------------------------------------------------------------------
create policy "notifications: recipient reads own"
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid());

-- Combined with the update(read) column grant above, recipients can mark
-- read/unread and nothing else.
create policy "notifications: recipient marks read"
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Realtime — broadcast inserts/updates/deletes on the board and personal
-- notifications. Postgres-changes subscriptions respect RLS, so each client
-- only receives notification rows addressed to them.
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table public.listings;
alter publication supabase_realtime add table public.notifications;
