-- ============================================================================
-- PlotBoard — Migration 006: structured address, India-wide coords,
-- rate privacy toggle, "Others" property type
--
-- Properties can now be outside Chhattisgarh, so:
--   * locality (one line) → address_line1 (required), address_line2, city
--     (required), state (required, default Chhattisgarh), pincode (optional,
--     6-digit check)
--   * the coordinate sanity check widens to an India bounding box
-- rate_visible: the poster chooses whether other members see the rate (and
-- therefore the computed total). Enforced in the UI; all members are trusted
-- invitees, so this is a courtesy curtain, not cryptographic secrecy.
-- ============================================================================

-- Coordinates: Chhattisgarh box → India box (Kashmir to Kanyakumari).
alter table public.listings drop constraint listings_latitude_check;
alter table public.listings drop constraint listings_longitude_check;
alter table public.listings
  add constraint listings_latitude_check  check (latitude  between 6.5 and 37.5),
  add constraint listings_longitude_check check (longitude between 68.0 and 97.5);

-- Structured address. Backfill existing rows from locality (all current
-- sample data is Raipur), then drop the old column.
alter table public.listings
  add column address_line1 text,
  add column address_line2 text,
  add column city          text,
  add column state         text,
  add column pincode       text;

update public.listings
set address_line1 = locality,
    city          = 'Raipur',
    state         = 'Chhattisgarh';

alter table public.listings
  alter column address_line1 set not null,
  alter column city          set not null,
  alter column state         set not null,
  alter column state         set default 'Chhattisgarh';

alter table public.listings
  add constraint listings_address_line1_check check (length(trim(address_line1)) > 0),
  add constraint listings_city_check          check (length(trim(city)) > 0),
  add constraint listings_pincode_check
    check (pincode is null or pincode ~ '^[1-9][0-9]{5}$');

drop index if exists listings_locality_idx;
create index listings_city_idx on public.listings (lower(city));

alter table public.listings drop column locality;

-- Rate privacy: poster decides if others see ₹/sqft (and the total).
alter table public.listings
  add column rate_visible boolean not null default true;

-- Property type: everything from the fixed list, plus a catch-all.
alter type public.property_type add value 'Others';

-- Status-change notification message referenced the dropped locality column.
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

    if actor is distinct from new.created_by then
      select name into actor_name from public.profiles where id = actor;
      insert into public.notifications (user_id, actor_id, listing_id, type, message)
      values (
        new.created_by,
        actor,
        new.id,
        'status_change',
        coalesce(nullif(actor_name, ''), 'Someone')
          || ' changed "' || new.address_line1 || ', ' || new.city || '" from '
          || old.status || ' to ' || new.status
      );
    end if;
  end if;
  return new;
end;
$$;
