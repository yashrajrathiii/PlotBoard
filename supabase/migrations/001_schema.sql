-- ============================================================================
-- PlotBoard — Migration 001: core schema
-- Shared property-listing board for ~15-20 brokers in Raipur, Chhattisgarh.
-- All users share one role; invite-only auth (public signup disabled in the
-- Supabase dashboard: Authentication → Sign In / Up → "Allow new users to
-- sign up" = OFF).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enums — enforce the fixed vocabularies at the database level so bad values
-- can never be inserted, regardless of what the frontend sends.
-- ----------------------------------------------------------------------------
create type public.property_type as enum (
  'Residential Plot',
  'Commercial Plot',
  'Agricultural',
  'Farmhouse Land',
  'Industrial'
);

create type public.area_unit as enum ('acre', 'sqft');

create type public.listing_status as enum (
  'Available',
  'Under discussion',
  'Sold'
);

create type public.contact_type as enum ('Owner direct', 'Broker');

-- ----------------------------------------------------------------------------
-- profiles — one row per auth user. Every user has the same role; is_admin
-- only gates the invite screen (it grants no extra listing permissions).
-- ----------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text not null default '',
  phone      text not null default '',
  is_admin   boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'One profile per auth user. name/phone shown as poster contact on listings.';
comment on column public.profiles.is_admin is
  'Gates the invite-users screen only. Set manually via SQL for the admin account.';

-- Auto-create a profile row the moment an invited user is created in
-- auth.users. Runs as definer so it can insert regardless of RLS.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- listings — the shared board.
-- Validation lives here, not just in the UI:
--   * area and rate must be strictly positive
--   * coordinates constrained to a generous Chhattisgarh bounding box
--     (state spans ~17.8–24.1 N, ~80.2–84.4 E; we allow 17–25 N, 79–85 E
--     so border-area plots are not rejected)
-- area_sqft and deal_value are STORED generated columns: the acre→sqft
-- conversion (1 acre = 43,560 sqft) and deal value (sqft × ₹/sqft) are
-- computed by Postgres so every client sees identical numbers.
-- ----------------------------------------------------------------------------
create table public.listings (
  id            uuid primary key default gen_random_uuid(),
  locality      text not null check (length(trim(locality)) > 0),
  property_type public.property_type not null,
  area          numeric not null check (area > 0),
  area_unit     public.area_unit not null,
  rate          numeric not null check (rate > 0), -- ₹ per sqft
  contact_type  public.contact_type not null default 'Broker',
  notes         text,
  latitude      double precision not null check (latitude  between 17.0 and 25.0),
  longitude     double precision not null check (longitude between 79.0 and 85.0),
  status        public.listing_status not null default 'Available',
  area_sqft     numeric generated always as (
                  case when area_unit = 'acre' then area * 43560 else area end
                ) stored,
  deal_value    numeric generated always as (
                  (case when area_unit = 'acre' then area * 43560 else area end) * rate
                ) stored,
  created_by    uuid not null default auth.uid() references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on column public.listings.rate is 'Rate in ₹ per sqft (regardless of area_unit).';
comment on column public.listings.deal_value is 'Computed: area in sqft × rate (₹).';

-- Board is filtered by these constantly; keep them indexed.
create index listings_locality_idx      on public.listings (lower(locality));
create index listings_status_idx        on public.listings (status);
create index listings_property_type_idx on public.listings (property_type);
create index listings_created_at_idx    on public.listings (created_at desc);
create index listings_created_by_idx    on public.listings (created_by);
-- Supports the duplicate-detection bounding-box query on coordinates.
create index listings_lat_lng_idx       on public.listings (latitude, longitude);

-- ----------------------------------------------------------------------------
-- listing_media — up to 5 photos + 1 video per listing (enforced client-side
-- for UX and by check_media_limits trigger below for integrity).
-- Files live in the private 'listing-media' storage bucket; this table maps
-- storage paths to listings.
-- ----------------------------------------------------------------------------
create table public.listing_media (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings (id) on delete cascade,
  media_type   text not null check (media_type in ('photo', 'video')),
  storage_path text not null unique,
  position     int  not null default 0, -- photo ordering; first photo = card thumbnail
  created_by   uuid not null default auth.uid() references public.profiles (id),
  created_at   timestamptz not null default now()
);

create index listing_media_listing_idx on public.listing_media (listing_id);

-- Hard limit: max 5 photos and 1 video per listing, enforced in the DB so a
-- misbehaving client can't exceed it.
create or replace function public.check_media_limits()
returns trigger
language plpgsql
as $$
declare
  photo_count int;
  video_count int;
begin
  select
    count(*) filter (where media_type = 'photo'),
    count(*) filter (where media_type = 'video')
  into photo_count, video_count
  from public.listing_media
  where listing_id = new.listing_id;

  if new.media_type = 'photo' and photo_count >= 5 then
    raise exception 'A listing can have at most 5 photos';
  end if;
  if new.media_type = 'video' and video_count >= 1 then
    raise exception 'A listing can have at most 1 video';
  end if;
  return new;
end;
$$;

create trigger listing_media_limits
  before insert on public.listing_media
  for each row execute function public.check_media_limits();

-- ----------------------------------------------------------------------------
-- status_history — audit trail of every status change: who, when, from, to.
-- Rows are written ONLY by the on_listing_status_change trigger below;
-- clients never insert here directly.
-- ----------------------------------------------------------------------------
create table public.status_history (
  id         bigint generated always as identity primary key,
  listing_id uuid not null references public.listings (id) on delete cascade,
  old_status public.listing_status not null,
  new_status public.listing_status not null,
  changed_by uuid not null references public.profiles (id),
  changed_at timestamptz not null default now()
);

create index status_history_listing_idx on public.status_history (listing_id, changed_at desc);

-- ----------------------------------------------------------------------------
-- notifications — in-app notifications. Currently one type: someone else
-- changed the status of your listing. Written only by the trigger below.
-- ----------------------------------------------------------------------------
create table public.notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade, -- recipient
  actor_id   uuid references public.profiles (id),                            -- who did it
  listing_id uuid references public.listings (id) on delete cascade,
  type       text not null default 'status_change',
  message    text not null,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- updated_at maintenance
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger listings_set_updated_at
  before update on public.listings
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Status-change audit + notification.
-- Fires on ANY status change (owner edits AND the RPC below), so the audit
-- trail is complete no matter which path changed the status. Definer rights
-- let it write to status_history/notifications, which clients cannot touch.
-- auth.uid() inside still returns the calling user.
-- ----------------------------------------------------------------------------
create or replace function public.on_listing_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  actor_name text;
begin
  if old.status is distinct from new.status then
    insert into public.status_history (listing_id, old_status, new_status, changed_by)
    values (new.id, old.status, new.status, actor);

    -- Notify the original poster only when someone ELSE changed the status.
    if actor is distinct from new.created_by then
      select name into actor_name from public.profiles where id = actor;
      insert into public.notifications (user_id, actor_id, listing_id, type, message)
      values (
        new.created_by,
        actor,
        new.id,
        'status_change',
        coalesce(nullif(actor_name, ''), 'Someone')
          || ' changed "' || new.locality || '" from '
          || old.status || ' to ' || new.status
      );
    end if;
  end if;
  return new;
end;
$$;

create trigger listings_status_change
  after update on public.listings
  for each row execute function public.on_listing_status_change();

-- ----------------------------------------------------------------------------
-- update_listing_status(listing_id, status) — the ONLY path for a non-owner
-- to change a listing.
--
-- Why an RPC instead of RLS column rules: Postgres RLS policies are row-level,
-- not column-level — you cannot write a policy saying "anyone may update
-- status but only the owner may update other columns". The clean pattern is:
--   * RLS UPDATE policy: owner-only (covers full edits)
--   * this SECURITY DEFINER function: any authenticated user, but the function
--     body only ever touches the status column, so that is all they can do.
-- The status-change trigger above fires inside this call, so history and
-- notifications are recorded identically for both paths.
-- ----------------------------------------------------------------------------
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
  where id = p_listing_id;

  if not found then
    raise exception 'Listing not found';
  end if;
end;
$$;

-- Lock the RPC down to signed-in users only.
revoke all on function public.update_listing_status(uuid, public.listing_status) from public, anon;
grant execute on function public.update_listing_status(uuid, public.listing_status) to authenticated;
