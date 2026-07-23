-- ============================================================================
-- PlotBoard — Migration 008: broadcast notifications
--
-- Adds two board-wide notification events on top of the existing personal
-- "someone changed your listing's status" notification:
--   * new_listing — every member (except the poster) is notified when a
--     PUBLIC listing is added.
--   * sold        — every member (except the person who marked it and the
--     poster) is notified when a public listing's status becomes Sold.
--
-- Rows land in the existing notifications table (one per recipient), which is
-- already in the supabase_realtime publication, so each client receives its
-- own rows live via Realtime (RLS keeps them private to the recipient).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- New public listing → notify everyone else.
-- ----------------------------------------------------------------------------
create or replace function public.on_listing_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := new.created_by;
  actor_name text;
begin
  if new.visibility = 'public' then
    select name into actor_name from public.profiles where id = actor;
    insert into public.notifications (user_id, actor_id, listing_id, type, message)
    select
      p.id,
      actor,
      new.id,
      'new_listing',
      coalesce(nullif(actor_name, ''), 'A member')
        || ' added ' || new.property_type
        || ' at ' || new.address_line1 || ', ' || new.city
    from public.profiles p
    where p.id <> actor;
  end if;
  return new;
end;
$$;

create trigger listings_notify_insert
  after insert on public.listings
  for each row execute function public.on_listing_insert();

revoke execute on function public.on_listing_insert() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Status change: keep the personal notify-the-poster behaviour AND broadcast
-- a 'sold' notification to everyone when a public listing is marked Sold.
-- (CREATE OR REPLACE keeps the existing listings_status_change trigger.)
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

    select name into actor_name from public.profiles where id = actor;

    -- Personal: tell the poster when someone else changed their listing.
    if actor is distinct from new.created_by then
      insert into public.notifications (user_id, actor_id, listing_id, type, message)
      values (
        new.created_by,
        actor,
        new.id,
        'status_change',
        coalesce(nullif(actor_name, ''), 'Someone')
          || ' changed "' || new.address_line1 || ', ' || new.city
          || '" from ' || old.status || ' to ' || new.status
      );
    end if;

    -- Broadcast: tell everyone (except the actor and the poster) when Sold.
    if new.status = 'Sold' and new.visibility = 'public' then
      insert into public.notifications (user_id, actor_id, listing_id, type, message)
      select
        p.id,
        actor,
        new.id,
        'sold',
        'Sold: ' || new.property_type || ' at ' || new.address_line1 || ', ' || new.city
      from public.profiles p
      where p.id <> actor and p.id <> new.created_by;
    end if;
  end if;
  return new;
end;
$$;
