-- 014_listing_private_contacts.sql
--
-- The broker or owner a poster is dealing with, for their own reference only.
--
-- WHY THIS IS A SEPARATE TABLE AND NOT TWO COLUMNS ON `listings`
--
-- This codebase has no per-column privacy. The SELECT policy on listings is
-- row-level (007), the grant is whole-table (002:41), and every read path uses
-- `select('*')` (types.ts LISTING_SELECT). `listings` is also in the
-- supabase_realtime publication, which ships WHOLE ROWS regardless of what the
-- UI renders. So two ordinary columns would hand this broker's name and phone
-- number to all twenty competing brokers in plain JSON on their first board
-- load — exactly the disclosure this feature exists to prevent.
--
-- `rate_visible` is NOT a precedent to copy: migration 006 states plainly that
-- it is "a courtesy curtain, not cryptographic secrecy", enforced only in the
-- UI. This table is the real thing — the server returns nothing at all to a
-- non-owner.
--
-- Both fields are optional. A broker posting a lead in a hurry must never be
-- blocked by them, so a row exists only when something was actually filled in.

create table public.listing_private_contacts (
  listing_id uuid primary key
    references public.listings(id) on delete cascade,
  name  text,
  phone text check (phone is null or phone ~ '^[6-9][0-9]{9}$'),
  updated_at timestamptz not null default now()
);

comment on table public.listing_private_contacts is
  'Third-party contact (broker/owner) for a listing. Visible ONLY to the '
  'listing''s creator — never shared, never broadcast, never in a share text.';

alter table public.listing_private_contacts enable row level security;

-- Supabase's default schema privileges hand every role full DML on any new
-- public table, so this one arrives readable by `anon` and with TRUNCATE
-- granted to `authenticated`. RLS already blocks anon — its only policy is
-- scoped to `authenticated` — but the most sensitive data in the app should
-- not rest on a single mechanism.
revoke all on public.listing_private_contacts from anon, public;
revoke all on public.listing_private_contacts from authenticated;

grant select, insert, update, delete
  on public.listing_private_contacts to authenticated;

-- One policy covering every verb: you may touch a private contact only for a
-- listing you posted.
--
-- The subquery runs under the caller's own RLS on `listings`, so it sees public
-- rows and their own; the explicit `created_by = auth.uid()` then narrows that
-- from "visible to me" to "mine". Same inheritance shape as the media policy in
-- 007, but deliberately stricter — media follows visibility, this follows
-- ownership.
create policy "private contact: owner only"
  on public.listing_private_contacts for all
  to authenticated
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id and l.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.listings l
      where l.id = listing_id and l.created_by = auth.uid()
    )
  );

-- Deliberately NOT added to supabase_realtime. The publication delivers whole
-- rows to every subscriber whose RLS lets the row through, and there is no
-- reason for this table to ever stream anywhere.

create trigger listing_private_contacts_set_updated_at
  before update on public.listing_private_contacts
  for each row execute function public.set_updated_at();
