# Development Log

A chronological record of how PlotBoard was built with Claude Code — what was
done, in what order, and the reasoning behind the notable decisions. Newest
entries are added at the top as work continues.

Format: each stage lists **what shipped** and, where relevant, **why**.

---

## Stage 0 — Foundations

**Supabase project & schema.** Created Supabase project `oiqqweqyamakfhubpbtk`
(ap-south-1). Wrote and applied migrations 001–004:
- **001** — enums, core tables (`profiles`, `listings`, `listing_media`,
  `status_history`, `notifications`), triggers, the `update_listing_status`
  RPC, and generated columns (`area_sqft`, `deal_value`).
- **002** — Row Level Security policies, Data API grants (`anon` gets nothing),
  realtime publication.
- **003** — private `listing-media` Storage bucket + policies.
- **004** — security hardening (pinned `search_path`, revoked EXECUTE on
  trigger functions), from the Supabase advisor.

**Project scaffold.** Vite + React + TypeScript + Tailwind 4, Supabase client,
Leaflet, `browser-image-compression`, router. Env wired via `.env.local`.

> **Key decision — invite-only.** No public sign-up. Chose Supabase Auth
> invites driven by an admin-only Edge Function so the service-role key never
> reaches the browser.

---

## Stage 1 — Auth, invites, devices, PWA

- **Auth flow** — login page, `/welcome` set-password + profile page for
  invitees, route guards (`Protected`): session → device → completed profile →
  admin.
- **2-device login limit** — added `user_devices` (migration 005) with a
  DB trigger that hard-caps 2 devices per user. A third login shows a device
  picker to evict one; the evicted device signs itself out (realtime + periodic
  check). *Requested addition beyond the original spec.*
- **Admin bootstrap** — the profile trigger auto-flags the admin email so the
  first admin needs no manual SQL.
- **Invite Edge Function** — `invite-user`, service-role, admin-gated. Emails
  a Supabase invite; the in-app Invites page lets the admin send them.
- **PWA** — manifest, generated icons, service worker (`vite-plugin-pwa`),
  installable on phones. Mobile bottom tab bar + desktop sidebar shell.

---

## Stage 2 — The listing board

- **Board (list view)** — responsive card grid (3 per row on desktop, 1 on
  mobile). Each card: a **photos ⇄ map** media carousel, deal value in Indian
  compact format (₹ L / ₹ Cr), status chip, poster contact.
- Fixed two bugs found during verification: area rounding (3.5 acre showed as
  4) and Leaflet marker icons broken under Vite.
- **Left sidebar navigation** — moved the desktop nav into a fixed left sidebar
  (app name on top, links below, sign-out at the bottom). *User request.*

---

## Stage 3 — Settings & navigation refinements

Driven by a series of user requests:
- **Settings modal** (Claude-style popup) with **Details**, **Account**, and
  **Devices** sections. Fixed a z-index bug where Leaflet map layers painted
  over the modal (`isolate` on cards + high modal z-index).
- Moved **Details** into the settings popup; renamed the old "Profile" tab.
- Moved **Sign out** into the settings popup (red, pinned to the bottom).
- Removed the user's name from the sidebar bottom.

---

## Stage 4 — Add / edit listings

- **Migration 006** — replaced single `locality` with a **structured address**
  (line1/line2, city, state, pincode) so out-of-Chhattisgarh properties work;
  widened the coordinate check to an India bounding box; added the
  `rate_visible` flag and the `Others` property type.
- **Add-listing form** — address fields, property type, area + unit, **rate
  with an eye toggle** (share/hide the rate from others), a Leaflet
  **location picker** (tap the map / search a place / paste Google-Maps
  coordinates or link / use my location), notes.
- **Media pipeline** — up to 4 photos compressed client-side (≤1600 px,
  ~500 KB) and 1 video with **duration + size checked before upload** (30 s /
  20 MB). All limits centralized in `src/lib/limits.ts`.

> **Key decision — rate privacy is app-level.** For a trusted invited group,
> hiding the rate in the UI/shares is a courtesy curtain, not cryptographic
> secrecy (the value is still in the row). Noted for a possible future
> server-side hardening.

---

## Stage 5 — Public/Private, My Listings, detail view

- **Migration 007** — `visibility` column (`public`/`private`) enforced by
  **RLS**: a private listing is never sent to anyone but its poster (verified
  by querying as a simulated second user). Realtime and the status RPC respect
  the same rule.
- **Public / Private toggle** in the create/edit form (labeled buttons).
- **My Listings** tab — the broker's own listings (public + private) with a
  visibility badge.
- **Single-listing detail page** (`/listing/:id`) — a full-size gallery
  (photos + video + interactive map) on top, details below. Cards are now
  clickable to open it.
- **Edit/Delete moved into the detail view** (owner only) instead of the grid.
- Made card footers line up across a row (full-height flex + `mt-auto`).

---

## Stage 6 — Sharing

- **Per-card share** — WhatsApp (`wa.me` with the listing pre-filled — the user
  just picks contacts) and copy-to-clipboard. Text includes type, address,
  size, rate/total (respecting rate privacy), status, notes, a Google-Maps pin
  link, and poster contact.
- **WhatsApp invite links** — the Invites page can generate a shareable invite
  link (no email) to send over WhatsApp; the recipient lands on the sign-up
  page.
- **Multi-select sharing** (WhatsApp-style) — a "Share" button and a
  per-card "Select multiple" enter a selection mode with checkboxes; a bottom
  bar copies/sends **all selected listings at once**.
- **Link-preview suppression** — a leading zero-width space on the multi-share
  WhatsApp text stops WhatsApp from heading the message with only the first
  listing's map preview.

---

## Stage 7 — Search & filters

- **`ListingResults`** component (shared by Home and My Listings): text search
  (address / city / type / notes) plus a filter panel — city, property type,
  status, area range (sq ft), rate range (₹/sqft) — with an active-filter
  badge and a "no matches" state.
- Fixed a latent horizontal-overflow bug on narrow cards (title truncation).

---

## Stage 8 — Real-time notifications

- **Migration 008** — `on_listing_insert` notifies every other member of a new
  **public** listing; `on_listing_status_change` also **broadcasts a "sold"**
  notification to everyone (on top of the existing personal "someone changed
  your listing" notification).
- **Frontend** — `NotificationsContext` subscribes to Realtime on the
  `notifications` table (RLS-scoped to the user), maintains the list + unread
  count, and on each arrival shows an **in-app toast** and an **OS-level
  pop-up** (via the service worker's `showNotification`).
- **Notification bell** with unread badge + dropdown panel (mark-all-read, tap
  to open the listing). "Turn on pop-up alerts" requests OS permission.
- Placed the bell top-right (mobile top bar; later moved into the desktop board
  header next to Share, per user request).
- **Verified end-to-end** with a throwaway second account: adding a listing and
  marking one sold both delivered live (bell badge 0→1→2, correct messages),
  then all test data was cleaned up. Added a re-sync on channel subscribe to
  close a first-event startup race found during testing.

> **Known follow-up — Web Push.** OS pop-ups fire while the app is open or
> backgrounded. True push when the app is **fully closed** needs Web Push
> (VAPID keys + a `push_subscriptions` table + a sender function + a SW `push`
> handler). Not yet built.

---

## Stage 9 — Ship

- **`vercel.json`** — SPA rewrite so deep links / refreshes / the `/welcome`
  invite landing don't 404 in production.
- Verified all flows at mobile width and confirmed PWA output (manifest, SW,
  icons) stays intact.
- Extended the `invite-user` function: **list members with emails + joined
  status** and **cancel/remove invites**, so the admin can identify and clean
  up wrong/pending invites. Stricter email validation (rejects commas/spaces).
- **Pushed to GitHub** (`yashrajrathiii/PlotBoard`) and documented the repo
  (this `docs/` folder + README).
