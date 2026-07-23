# Database & Backend

Everything server-side lives in Supabase project `oiqqweqyamakfhubpbtk`
(ap-south-1). The schema is defined by the ordered SQL files in
`supabase/migrations/`. Apply them in order (Supabase SQL editor, or the
Supabase CLI / MCP). This document describes the current state after all
migrations are applied.

## Tables

### `profiles`
One row per auth user (`id` → `auth.users.id`, cascade delete). Created
automatically by a trigger the moment a user is invited.

| Column       | Notes                                                    |
| ------------ | -------------------------------------------------------- |
| `id`         | PK, references `auth.users`                              |
| `name`       | Full name (shown as the poster contact)                 |
| `phone`      | 10-digit mobile                                          |
| `is_admin`   | Gates the Invites screen + Edge Function. SQL-set only.  |
| `created_at`, `updated_at` | timestamps                                |

### `listings`
The shared board. Validation lives in the DB, not just the UI.

| Column           | Notes                                                       |
| ---------------- | ---------------------------------------------------------- |
| `id`             | PK (uuid)                                                   |
| `address_line1`  | required                                                    |
| `address_line2`  | optional                                                    |
| `city`, `state`  | required (state defaults `Chhattisgarh`)                    |
| `pincode`        | optional, 6-digit check                                     |
| `property_type`  | enum: Residential Plot / Commercial Plot / Agricultural / Farmhouse Land / Industrial / Others |
| `area`, `area_unit` | `area > 0`; unit `acre` \| `sqft`                        |
| `rate`           | ₹ per sqft, `rate > 0`                                      |
| `rate_visible`   | poster's choice to show/hide the rate from others          |
| `contact_type`   | enum: Owner direct \| Broker                                |
| `notes`          | optional                                                    |
| `latitude`, `longitude` | India bounding-box check (6.5–37.5 N, 68–97.5 E)     |
| `status`         | enum: Available \| Under discussion \| Sold                |
| `visibility`     | `public` \| `private` (private = poster-only)              |
| `area_sqft`      | **generated**: acre → sqft (× 43 560) or sqft as-is         |
| `deal_value`     | **generated**: `area_sqft × rate`                          |
| `created_by`     | defaults `auth.uid()`, references `profiles`               |
| `created_at`, `updated_at` | auto-maintained                                  |

Indexes: city (lower), status, property_type, created_at desc, created_by,
lat/lng, visibility.

### `listing_media`
Up to **5 photos + 1 video** per listing (hard-capped by a trigger). Files
live in the private `listing-media` Storage bucket; this table maps storage
paths to listings. Columns: `listing_id`, `media_type` (`photo`|`video`),
`storage_path` (unique), `position`, `created_by`.

> The UI currently allows **4 photos** (`PHOTO_LIMIT` in `src/lib/limits.ts`);
> the DB cap is 5, so the limit can be raised in one place without a migration.

### `status_history`
Append-only audit trail of every status change: `listing_id`, `old_status`,
`new_status`, `changed_by`, `changed_at`. Written only by a trigger.

### `notifications`
One row per recipient. Columns: `user_id` (recipient), `actor_id`,
`listing_id`, `type` (`new_listing` | `sold` | `status_change`), `message`,
`read`, `created_at`. Written only by triggers. In the realtime publication.

### `user_devices`
Tracks active devices for the 2-device limit. PK `(user_id, device_id)`.
Columns: `device_name`, `created_at`, `last_seen`. A trigger caps rows at 2
per user. In the realtime publication.

## Security model (Row Level Security)

RLS is enabled on every table (deny-by-default). The Data API roles get only
what they need via explicit grants — `anon` gets **nothing** on app tables, so
a logged-out visitor can read nothing.

| Table            | authenticated can …                                                |
| ---------------- | ------------------------------------------------------------------ |
| `profiles`       | read all; update **own** name/phone only (column grant blocks self-promotion to admin) |
| `listings`       | read **public or own**; insert as self; update/delete **own** only |
| `listing_media`  | read media of visible listings; attach to own listings; delete own |
| `status_history` | read all; writes only via trigger                                  |
| `notifications`  | read **own**; mark **own** read; inserts only via trigger          |
| `user_devices`   | full manage of **own** device rows                                 |

### Status changes by non-owners
Postgres RLS is row-level, not column-level, so "anyone may change status but
only the owner may edit other fields" can't be a single policy. The pattern:

- RLS `UPDATE` on `listings` is **owner-only** (covers full edits).
- `update_listing_status(listing_id, status)` — a `SECURITY DEFINER` RPC whose
  body only ever touches the `status` column — lets any authenticated user
  change a visible listing's status. It repeats the visibility check so private
  rows stay private.

## Triggers & functions

| Function                    | Fires                          | Purpose                                                        |
| --------------------------- | ------------------------------ | -------------------------------------------------------------- |
| `handle_new_user`           | after insert on `auth.users`   | create the profile; auto-flag the bootstrap admin email        |
| `set_updated_at`            | before update on profiles/listings | maintain `updated_at`                                       |
| `check_media_limits`        | before insert on `listing_media` | enforce ≤5 photos / ≤1 video                                  |
| `enforce_device_limit`      | before insert on `user_devices` | reject a 3rd device (`raise DEVICE_LIMIT`)                     |
| `on_listing_insert`         | after insert on `listings`     | notify every other member of a new **public** listing          |
| `on_listing_status_change`  | after update on `listings`     | write `status_history`; notify the poster on any status change by someone else; broadcast a **sold** notification to everyone when marked Sold |

All definer functions pin `search_path = public` and have `EXECUTE` revoked
from the API roles (they run as triggers, not RPCs).

## Storage

One **private** bucket, `listing-media` (20 MB/file cap, image + common video
MIME types). Path convention `<listing_id>/<uuid>.<ext>`. Policies: any signed-
in user can read; uploads must be as self; only the uploader can delete their
files. The app displays media via **signed URLs** (1-hour expiry), so nothing
is publicly reachable.

## Realtime

The `supabase_realtime` publication includes `listings`, `notifications`, and
`user_devices`. Clients subscribe to Postgres-changes; RLS is applied to the
stream, so each client only receives rows it may read (e.g. its own
notifications).

## Edge Function — `invite-user`

`supabase/functions/invite-user/index.ts`. The only place the **service-role
key** is used (from the function's env, never the frontend). Every call is
gated on the caller's `profiles.is_admin`. Actions (POST body `{ action, … }`):

| action   | Does                                                                 |
| -------- | ------------------------------------------------------------------- |
| `invite` | send a Supabase Auth invite email; returns `code: already_registered` if the address exists |
| `link`   | generate a shareable invite/magic link (no email sent) for WhatsApp |
| `list`   | return all members with **email** + `joined` status                 |
| `delete` | remove a user by id (cancel a pending invite / remove a member)     |

Email validation rejects spaces and commas to catch typos like
`a,b@x.com`.

## Migration history

| File                                   | Adds                                                                 |
| -------------------------------------- | ------------------------------------------------------------------- |
| `001_schema.sql`                       | enums, `profiles`/`listings`/`listing_media`/`status_history`/`notifications`, triggers, `update_listing_status` RPC, generated columns |
| `002_rls_and_grants.sql`               | RLS policies, Data API grants, realtime publication (listings, notifications) |
| `003_storage.sql`                      | private `listing-media` bucket + storage policies                   |
| `004_security_hardening.sql`           | `search_path` pins, revoke EXECUTE on trigger functions             |
| `005_devices_and_admin_bootstrap.sql`  | `user_devices` + 2-device trigger; auto-flag admin email            |
| `006_address_rate_privacy.sql`         | structured address, India-wide coords, `rate_visible`, `Others` type (replaced `locality`) |
| `007_listing_visibility.sql`           | `visibility` column + RLS/RPC updates for public/private            |
| `008_broadcast_notifications.sql`      | `new_listing` + `sold` broadcast notification triggers              |
