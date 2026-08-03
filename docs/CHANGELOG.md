# Development Log

A **dated running log** of changes to PlotBoard, newest first. Each dated
section is one working session. Entries from the initial build (before the repo
existed) are grouped under a single date range and broken down by feature
stage.

Format going forward: add a new `## YYYY-MM-DD` heading at the top for each
session, with bullets for what shipped and *why* where it matters.

---

## 2026-08-02

**Locality from the map pin, and `@` rate semantics.**

- **Pin → locality.** Dropping a pin now looks up the *colony* name —
  "Gudhiyari", "Shankar Nagar" — via Google reverse geocoding and pre-fills
  address, city, state and pincode. It deliberately returns the sublocality
  rather than a full postal address, because that is how brokers actually
  describe a plot. Typed text always wins over the lookup: "Plot 42, near water
  tank" is more useful than "Gudhiyari", so the pin only fills what is empty.
  Falls back to the smallest administrative area for rural land with no colony.
- **`@` now infers the rate unit from the area.** "2400 sq.feet plot, @2500"
  means ₹2,500/**sqft**; "5 acer agriculture plot, @3000000" means
  ₹30,00,000/**acre**. The unit is inherited from whatever the plot is measured
  in, which is how brokers write it.
  Deliberately limited to `@`: "price 45 lakh" almost always means the TOTAL,
  and treating that as a rate would be wildly wrong — there is a regression
  test pinning exactly that.
- Common misspellings accepted: **acer / acers / ekad / ekar** for acre.
- Parser suite now 10/10.

**Setup gap found while verifying:** reverse geocoding failed with
`REQUEST_DENIED: The webpage is not allowed to use the geocoder` because the
setup guide only enabled Maps JavaScript + Places. The **Geocoding API** is a
third, separate API that must be enabled and added to the key restrictions.
`docs/MAPS.md` now says so, and the code logs a one-off actionable warning
instead of failing silently.

---

## 2026-08-01

**Phase 4: add from the map, and import from WhatsApp.** Both funnel through
one rule-based parser and the normal listing form — nothing is ever saved
without the broker reviewing it, which is what makes rule-based parsing good
enough here.

- **`listingParser.ts`** extracts area + unit (including **gaj**, **decimal**,
  **guntha** and **hectare**, which brokers here actually use), rate per sqft
  *or* per acre, lakh/crore amounts, Indian comma grouping, frontage, pincode,
  property type, status and owner-vs-broker. Behind a `ListingParser`
  interface so an AI parser can replace the rules without touching the UI.
- **A parser test suite** (`npm run test:parser`) caught a real bug before it
  shipped: the rate pattern was matching the *area*, so "2400 sqft" parsed as
  a ₹2,400 rate. Rates now require an explicit signal — a cue word/symbol, a
  per/slash split, or the `psf` suffix. 7/7 samples pass.
- **`/import`** — paste a WhatsApp message, review, post.
- **`/map/add`** — find the plot in Google (Places search + satellite), drop
  the pin, describe it in plain text, continue to the form with the
  coordinates already set.
- `ListingForm` gained `initial` + `autofilled`: parsed values pre-fill the
  form, each flagged with a small "from text" badge, plus a banner telling the
  broker how many fields to check.

Verified live with both keys: "Amleshwar farm land / 2 acre / 80 lakh per acre
/ 30 ft front, owner direct" → 10 fields filled, rate 8000000 per **acre**;
and a map pin at 21.21, 81.70 carried into the form with area 2400 sqft, front
40 ft, rate 3200/sqft, type Commercial Plot.

---

## 2026-07-31

**Phase 3: Map View tab** — `/map`, one Mapbox satellite map with a pin per
listing. Verified live with real keys: 8 listings → 1 canvas, 8 markers,
satellite tiles loading.

- **Filters are shared with the board**, not duplicated. Filter state moved
  out of `ListingResults` into `ListingFiltersContext`, and the search/filter
  UI into a reusable `ListingFilterBar`. Narrowing on the board and tapping
  Map now shows exactly those pins — verified: "barbanda" on the board →
  Map View opens with the search carried over and 1 pin of 8.
- **Tapping a pin** opens a compact card (thumbnail, type, address, status,
  area, rate, deal value) linking to the listing. Respects rate privacy.
- The map **auto-centres on the listings shown**, so a filtered set fills the
  view instead of sitting off-screen.
- Own **private listings appear on the map** alongside public ones, so a
  broker sees their full inventory geographically.
- `mapbox-gl` stays a lazy chunk here too — one map instance per visit, and
  panning/zooming inside it is free.

Also fixed: **invite links pointed at localhost.** `redirectTo` used
`window.location.origin`, so an invite sent while the admin was on localhost
produced a dead link on the recipient's phone — blocking broker onboarding.
Added `VITE_APP_URL` (via an `appUrl` helper) to pin invite redirects to the
deployed site.

---

## 2026-07-30

**Phase 2: Leaflet → Mapbox, with Google for placing pins.**

- **`src/lib/maps/`** is the only place that knows a map vendor:
  `SatelliteMap` (Mapbox display), `PinPicker` (Google + Places), `config`,
  and a `MapPlaceholder` for when a key is missing.
- **Listing cards no longer mount a live map.** Each card used to create its
  own Leaflet instance — free on OSM, but ~$500/month on a metered provider at
  20 brokers' usage (a 15-card board = 15 billable loads *per view*). Cards now
  show photos, falling back to a cached satellite thumbnail. **Verified: a
  15-card board triggers zero map instantiations and zero tile requests.**
- **Migration 011** — `listings.static_map_path`, plus a `static-map` action on
  the `media` function that fetches one Mapbox static image per listing and
  stores it in R2, so cards are served from R2's free egress forever.
- **The detail map is lazy** in both senses: the slide only renders when
  opened, and `mapbox-gl` (~500 KB gzipped) is now a `React.lazy` chunk rather
  than part of the main bundle. Main CSS dropped 72 KB → 31 KB.
- **Google is used only to place a pin**, for its stronger Indian address
  search. Kept the free `parseCoords` shortcut for pasted coordinates/URLs and
  the `withinIndia` guard; replaced Nominatim with Places Autocomplete.
  Fixed the old `FlyTo` bug that re-ran `flyTo` on every render.
- **Leaflet fully removed** — `leaflet`, `react-leaflet`, `@types/leaflet`,
  `leafletSetup.ts`, `LocationPicker.tsx`, and the global CSS import.
- **Degrades gracefully without keys**: maps render a labelled placeholder,
  the app works, console is clean. Setup guide in `docs/MAPS.md`.

---

## 2026-07-29

**Phase 1 of the maps/capture round: invite fixes + `front` + per-acre rates.**

- **Migration 010** — `front` + `front_unit` (ft/m), `rate_unit` (sqft/acre),
  a generated `rate_per_sqft`, and a regenerated `deal_value`.
- **Per-acre rates.** Rates can now be quoted per acre as well as per sqft.
  `deal_value` converts the *area* into the rate's unit rather than normalising
  the rate to ₹/sqft — algebraically identical, but `rate / 43560` is a
  non-terminating decimal that Postgres numeric truncates, which would have
  stored ₹1,59,99,999.9999… for "2 acres @ ₹80,00,000/acre".
- **Filter bug prevented.** `ListingResults` compared raw `rate`, so a
  "max ₹5,000/sqft" filter would have matched *every* per-acre listing once
  mixed units existed (acre rates are in the millions). It now compares
  `rate_per_sqft`, mirroring how the area filter already uses `area_sqft`.
- **`formatRateEntered` / `formatFront`** replace four hardcoded `/sqft`
  strings — card, detail page, and the **WhatsApp share text**, where a wrong
  unit would have been the most visible failure. Front is shown on the detail
  page and included in shares.
- **`front`** is optional, a road-facing **length** (not an area).

**Invite bug — root cause found in the logs: a dead session.** The Edge
Function logs showed `POST /invite-user → 401` while the auth log at the same
timestamp showed `"Session not found"`, minutes after a logout — and earlier,
`Invalid Refresh Token: Refresh Token Not Found`. The app was holding a stale
token after its session ended and kept calling the function with it, so every
invite failed while the page still looked signed in. Fixed on both sides: the
function now returns `code: "session_expired"` with a clear message, and the
client signs out on a 401 so the route guard sends the user to `/login`
instead of stranding them. Also surfaced Supabase's free-tier mail rate limit
as a real message pointing at the WhatsApp-link flow, which sends no email.

**Invite bug — two further defects fixed:**

- `callFn` called `error.context.json()` unconditionally. For a
  `FunctionsFetchError` (network, CORS, function not deployed) `context` is a
  plain Error with no `.json`, so it threw
  `TypeError: ...json is not a function` and buried the actual cause. Now
  type-checked, with a fallback through the platform's `{code, message}` shape.
- `loadMembers` swallowed every failure in a bare `catch {}` and silently
  rendered a profiles-only list — the page looked healthy while every function
  call failed, which is exactly why this was hard to diagnose. It now shows a
  visible "couldn't reach the invite service" banner with the real reason and
  logs to the console.
- **Re-invites no longer dead-end.** An already-invited address could never be
  re-invited by email. The `invite` action now falls back to generating a fresh
  sign-in link and returns it, and matches on GoTrue's `email_exists` code
  rather than only a drifting error message.

Also: corrected `docs/STORAGE.md`, which projected a 1.4 GB steady state based
on ~30 listings/month. At 20 brokers posting 100-150/month it is **~5.6-8 GB**,
which makes the 30-day sold-media cleanup load-bearing rather than optional.

---

## 2026-07-28

**Listing media moved to Cloudflare R2** — text/relational data stays in
Supabase. Supabase's free tier allows only 1 GB of storage and 5 GB/month of
egress, which media would have exhausted after ~80 listings; R2 gives 10 GB
free with **unlimited free egress**, which matters most here because browsing
the board is almost entirely image downloads.

- **Migration 009** — `listing_media.storage_provider` (`'supabase'`|`'r2'`),
  an index for the sold-media sweep, and `media_pending_cleanup()`.
- **`media` Edge Function** — holds the R2 credentials (never the browser) and
  mints short-lived presigned URLs. **Authorization reuses RLS**: it queries
  with the caller's JWT, so nobody can obtain a URL for a listing they can't
  see. Actions: `upload-url`, `read-urls`, `delete`, `cleanup-sold`.
- **`src/lib/mediaStorage.ts`** — the single module that talks to either store.
  Reads always handle both providers, so **legacy Supabase files keep working
  with no migration**. All six call sites (form, both hooks, edit page,
  listing actions) now go through it.
- **WebP photos** — `compressPhoto()` outputs WebP instead of JPEG, ~25-35%
  smaller at the same quality. Existing JPEGs are unaffected.
- **Sold-media cleanup** — photos/video of a listing are deleted 30 days after
  it is marked Sold (the listing's text, price, and location stay forever).
  This is what keeps storage bounded instead of growing without limit. Driven
  off `status_history`, since R2 lifecycle rules can only expire by upload age.
- **`VITE_MEDIA_PROVIDER`** gates where *new* uploads go (`supabase` by
  default). Flipping it back is the rollback.
- Docs: added `docs/STORAGE.md` (setup + payment structure).

Bug caught during verification: the new shared query asked for
`storage_provider` before migration 009 exists, which **blanked the entire
board**. Switched to `listing_media(*)` so the frontend works either side of
the migration — no deploy-order trap.

Considered and rejected: rotating multiple free accounts to avoid ever paying.
Beyond violating provider terms, it fails mechanically — free storage
accumulates rather than rotating, and on an egress-capped provider like Storj
the 25 GB/month allowance would break image loading within weeks (moving 25 GB
between accounts would itself consume the entire monthly allowance).

---

## 2026-07-27

- **Settings is now a page, not a modal.** Moved settings to a `/settings`
  route so the mobile bottom tab bar stays visible while in it. Mobile shows an
  **Instagram-style list** of section rows (Details / Account / Devices), each
  drilling into its own view with a back arrow; desktop keeps a two-pane
  list + content layout. Removed the old `SettingsModal`.
- **Instagram-style back buttons.** Added a reusable circular back control
  (`BackButton`) and used it across the app: the listing **detail** page, the
  **add / edit listing** form, and the **settings** section views. The
  add-listing and settings back arrows return to Home.
- **Changelog** switched to this dated running-log format.

---

## 2026-07-23

First push to GitHub + documentation.

- **Repository** — pushed the app to `github.com/yashrajrathiii/PlotBoard`
  (for Vercel hosting). Added `vercel.json` (SPA rewrite so deep links / the
  `/welcome` invite landing don't 404). Verified `.env.local`, `node_modules`,
  and `dist` stay out of the repo — no secrets committed.
- **Docs** — replaced the default Vite README with a project overview; added
  `docs/` (DATABASE, DEPLOYMENT, and this CHANGELOG).
- **Invite management** — extended the `invite-user` Edge Function with `list`
  (members with **email** + joined status) and `delete` (cancel a pending
  invite / remove a member); stricter email validation (rejects commas/spaces).
  The Invites page now shows each member's email and a cancel/remove control,
  so wrong or duplicate invites are identifiable and removable. Verified live.

---

## 2026-07-17 – 2026-07-23 · Initial build

The full first build of the app, by feature stage.

### Stage 0 — Foundations
Created Supabase project `oiqqweqyamakfhubpbtk` (ap-south-1). Migrations 001–004:
enums + core tables (`profiles`, `listings`, `listing_media`, `status_history`,
`notifications`), triggers, the `update_listing_status` RPC, generated columns
(`area_sqft`, `deal_value`); RLS + Data API grants (`anon` gets nothing);
private `listing-media` Storage bucket; security hardening. Scaffolded Vite +
React + TS + Tailwind 4 with Supabase, Leaflet, and image compression.

> **Decision — invite-only.** No public sign-up; Supabase Auth invites driven by
> an admin-only Edge Function so the service-role key never reaches the browser.

### Stage 1 — Auth, invites, devices, PWA
Login, `/welcome` set-password + profile page, route guards. **2-device login
limit** (`user_devices`, migration 005) with a DB trigger and a device-picker
eviction screen. Admin bootstrap (profile trigger auto-flags the admin email).
`invite-user` Edge Function + Invites page. **PWA** (manifest, icons, service
worker) — installable on phones.

### Stage 2 — The listing board
Responsive card grid with a **photos ⇄ map** carousel per card, deal value in
Indian compact format (₹ L / ₹ Cr), status chips. Moved desktop nav into a
left sidebar. Fixed area-rounding and Leaflet-marker bugs.

### Stage 3 — Settings & nav refinements
Settings modal (Details / Account / Devices); fixed a z-index bug where map
layers painted over the modal. Moved Details and Sign out into settings; tidied
the sidebar. *(Settings later became a page — see 2026-07-27.)*

### Stage 4 — Add / edit listings
Migration 006: **structured address** (line1/2, city, state, pincode),
India-wide coordinate check, `rate_visible` flag, `Others` property type
(replaced `locality`). Add-listing form with a **rate show/hide toggle**, a
Leaflet **location picker** (tap / search / paste Google-Maps coordinates / use
my location), and a **client-side media pipeline** (≤4 photos compressed to
~500 KB; 1 video with duration + size checked before upload). Limits centralized
in `src/lib/limits.ts`.

> **Decision — rate privacy is app-level.** For a trusted invited group, hiding
> the rate in the UI/shares is a courtesy curtain, not cryptographic secrecy.

### Stage 5 — Public/Private, My Listings, detail view
Migration 007: `visibility` (`public`/`private`) enforced by **RLS** — a private
listing is never sent to anyone but its poster. Public/Private toggle in the
form; **My Listings** tab; **single-listing detail page** (`/listing/:id`) with
a full gallery; clickable cards; Edit/Delete moved into the detail view.

### Stage 6 — Sharing
Per-card WhatsApp + copy; WhatsApp **invite links**; WhatsApp-style
**multi-select** share bar (share several listings at once); zero-width-space
trick to suppress WhatsApp's misleading single-listing link preview on
multi-shares.

### Stage 7 — Search & filters
Shared `ListingResults`: text search + a filter panel (city, type, status, area
range, rate range) with an active-filter badge and a "no matches" state.

### Stage 8 — Real-time notifications
Migration 008: `new_listing` and `sold` **broadcast** notification triggers.
Frontend `NotificationsContext` subscribes to Realtime (RLS-scoped), keeps the
unread count, and shows an **in-app toast** + an **OS pop-up** (service-worker
`showNotification`). Notification **bell** with a dropdown panel. Verified
end-to-end with a throwaway second account.

> **Known follow-up — Web Push.** OS pop-ups fire while the app is open/
> backgrounded; true push when the app is **fully closed** needs VAPID keys +
> a push-subscription table + a sender function + a SW `push` handler. Not built.

### Stage 9 — Ship prep
`vercel.json` for SPA routing; verified all flows at mobile width and that the
PWA output (manifest, SW, icons) stays intact.
