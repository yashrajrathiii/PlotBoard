-- ============================================================================
-- PlotBoard — Migration 005: 2-device login limit + admin bootstrap
--
-- Device limit design: Supabase Auth cannot cap concurrent sessions per user,
-- so we track devices ourselves. The frontend stores a random device_id in
-- localStorage and registers it here after login. A trigger hard-caps each
-- user at 2 device rows. Logging in on a third device fails the insert; the
-- app then shows the two existing devices and lets the user delete one.
-- The deleted device notices (realtime + periodic check) and signs itself out.
-- ============================================================================

create table public.user_devices (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  device_id   uuid not null,               -- random id persisted in the browser
  device_name text not null default 'Unknown device', -- e.g. "Chrome on Windows"
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  primary key (user_id, device_id)
);

comment on table public.user_devices is
  'Active devices per user, max 2 (enforced by trigger). Third login must evict one.';

-- Hard cap at the DB level so a misbehaving client cannot hold >2 slots.
create or replace function public.enforce_device_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (select count(*) from public.user_devices where user_id = new.user_id) >= 2 then
    -- The frontend matches on DEVICE_LIMIT to show the device picker.
    raise exception 'DEVICE_LIMIT';
  end if;
  return new;
end;
$$;

create trigger user_devices_limit
  before insert on public.user_devices
  for each row execute function public.enforce_device_limit();

revoke execute on function public.enforce_device_limit() from public, anon, authenticated;

-- RLS: a user manages only their own device rows.
alter table public.user_devices enable row level security;

grant select, insert, delete            on public.user_devices to authenticated;
grant update (last_seen, device_name)   on public.user_devices to authenticated;

create policy "devices: read own"
  on public.user_devices for select
  to authenticated
  using (user_id = auth.uid());

create policy "devices: register own"
  on public.user_devices for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "devices: touch own"
  on public.user_devices for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "devices: remove own"
  on public.user_devices for delete
  to authenticated
  using (user_id = auth.uid());

-- Realtime so an evicted device signs itself out immediately.
alter publication supabase_realtime add table public.user_devices;

-- ----------------------------------------------------------------------------
-- Admin bootstrap: the very first admin account cannot be invited through the
-- app (the invite Edge Function requires an existing admin). Instead, the
-- profile-creation trigger flags the known admin email automatically, so the
-- one-time dashboard invite of this address yields an admin profile with no
-- manual SQL. Additional admins: update profiles set is_admin = true.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, phone, is_admin)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    coalesce(new.email, '') = 'rathiyash12@gmail.com'  -- bootstrap admin
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
