# Development Log

A **dated running log** of changes to PlotBoard, newest first. Each dated
section is one working session. Entries from the initial build (before the repo
existed) are grouped under a single date range and broken down by feature
stage.

Format going forward: add a new `## YYYY-MM-DD` heading at the top for each
session, with bullets for what shipped and *why* where it matters.

---

## 2026-08-12 (later)

**Shares no longer leak prices, and route enquiries to the person sharing.**
Both reported after the first day with real brokers, and both are commercially
wrong on a board of competing agents.

- **No price ever leaves the app** — not the rate, not the total, and not even
  when the poster marked the rate public. There is deliberately **no parameter**
  to switch this back on: `buildShareText` lost its `canSeeRate` argument
  entirely rather than being passed `false`, so the guarantee is structural
  instead of depending on every future caller passing the right flag. The
  `formatINR`/`formatRateEntered` imports went with it — an absent import is a
  signal to the next reader.
  Members still see rates **inside** the app. Those gates
  (`ListingCard`, `ListingDetailPage`, `MapViewPage`) are untouched: what a
  member sees is a different question from what gets forwarded to an outsider.
- **The contact is now the sharer, not the poster.** Forwarding someone else's
  listing used to carry the original poster's number, routing the enquiry
  straight past the broker who sent it. `useAuth().profile` already held the
  current user's name and phone, so this needed no new query.
- **The poster's `contact_type` is dropped from the share.** It describes
  *their* relationship to the property, so printing "(Owner)" beside the
  sharer's name would be actively misleading.

Verified end-to-end on a real listing posted by **another user** with
`rate_visible = true` — the strongest case, since the rate is public and the
poster is someone else. Result: no rate, no total, no `₹`, poster's number
absent, sharer's number present. Confirmed for both the single-listing menu and
the multi-select bar (2 blocks, both contacts rewritten).

## 2026-08-12

**The location search box now accepts pasted links and coordinates.** Reported
on the first day of real use: brokers could only set a pin by finding the plot
by eye and tapping it, which is on the critical path of every listing.

Three compounding faults, not one:

- `parseCoords` had exactly **one** call site — a React `onKeyDown` Enter
  handler. Google's legacy Places `Autocomplete` widget attaches a *native*
  keydown listener to the same input and calls `stopPropagation()` on Enter
  while its dropdown is open; React 19 delegates at the root, so the handler
  never fired and `parseCoords` never ran.
- Enter then fell through to **implicit submission of the listing form**, which
  answered "Drop the location pin on the map" — the misleading message brokers
  actually saw.
- Unparseable text was a **silent no-op**, indistinguishable from a dead box.

Fixes:

- **An explicit "Go" button.** A click cannot be swallowed by a native keydown
  listener, so the manual path no longer depends on Google at all. Enter still
  works, and now calls `preventDefault()` unconditionally so it can never
  submit a half-filled listing.
- **Paste just works** — pasting a link or coordinates drops the pin with no
  second action, reading from the paste event rather than state (which
  `onChange` has not yet updated).
- **Unrecognised text now says so**, naming the formats that do work.
- **`parseCoords` widened** from 3 formats to 11, each one a form someone
  actually pasted: `?api=1&query=` (the *official* Maps URL format, which the
  old `[?&]q=` pattern could never match), `!3d..!4d..` from the `data=`
  segment, `ll=`/`center=`/`daddr=`, `/place/lat,lng`, `geo:` URIs, degree +
  hemisphere (`21.2514° N, 81.6296° E` — what Maps shows on long-press),
  coordinates embedded mid-sentence, and integer-only pairs. Out-of-range
  values are now rejected rather than dropping a pin in the sea.
- **The Places widget is wrapped in try/catch.** It is deprecated for Google
  Cloud projects created after 1 Mar 2025 and there is no error boundary in
  this app — an unhandled throw unmounts the whole React root and shows a white
  screen mid-listing. Losing the type-ahead is survivable; losing the app is not.
- **The no-key branch now renders the input it always promised.** It claimed
  "you can still paste coordinates below" while rendering no input at all, so a
  lapsed key left brokers with no way to set a pin whatsoever. `LocationInput`
  is now split out with no dependency on Google and used by both branches.

**New `resolve-maps-link` Edge Function** for short links. `maps.app.goo.gl` is
what the Google Maps *share sheet* produces — the most common paste from a
phone — and it carries no coordinates; only the redirect target does, which a
browser cannot read cross-origin.

This endpoint fetches a caller-supplied URL, which is an SSRF shape, so it is
contained deliberately: a **strict host allowlist** compared with `===` against
the parsed hostname (never `includes()`, which `maps.app.goo.gl.evil.com` would
satisfy), redirects followed **one hop at a time with the allowlist re-checked
at each**, a signed-in caller, a 2 KB URL cap, 5-redirect and 8-second limits.
Verified rejecting the lookalike host, a foreign host, and `file://`.

- **DMS is now accepted** — `21°18'11.2"N 81°35'03.3"E`. This is what Google
  Maps puts in its *search box* when you copy coordinates, so it is a very
  common paste, and the decimal-degree pattern could not match it. Also covers
  degrees + decimal minutes (`21°18.1867'N`, seconds omitted), curly primes
  (`′ ″`) as well as straight quotes, comma or space separators, S/W negation,
  and a longitude-first paste. DMS is matched **before** the bare-pair rule:
  `21°18'11.2"N 81°35'03.3"E` contains digit pairs that the loose pattern would
  otherwise read as a decimal coordinate, dropping the pin ~30 km away.
- `parseCoords` was restructured so each pattern carries **its own converter**
  rather than the caller inferring meaning from `match.length` — that was
  already fragile with two shapes and would not survive DMS's eight groups.

- **Plus Codes and place names now resolve** via Google forward geocoding —
  `8H3H+9WX Tendua-1, Chhattisgarh`. Worth allowing because Plus Codes are the
  addressing system that actually works in rural Chhattisgarh, where plots have
  no street address. A *full* code could be decoded offline, but the form
  people share is the **short** one, which is meaningless without resolving the
  town named after it — so the whole string goes to the geocoder as-is.
- **Approximate results are labelled.** A village-name lookup returns the
  *centroid*, potentially kilometres from the plot, and on screen that pin is
  indistinguishable from a precise one — a listing would be saved badly wrong
  with nobody noticing. Those now show "Approximate — drag the pin onto the
  exact plot".
  The precision test keys on `types`, **not** `location_type`: Google returns a
  Plus Code as `GEOMETRIC_CENTER`, the same value it uses for a road midpoint,
  despite pinning a ~4 m square. Keying off `location_type` flagged every Plus
  Code as approximate, and a warning that fires on everything is one brokers
  stop reading. Verified: Plus Code → no warning, `Tendua-1` → warning.

Tests: 50 passing (22 new coordinate cases + 3 short-link detection).

## 2026-08-10 (later)

**The Import button was invisible on every phone.**

- `BoardPage.tsx` styled it `hidden sm:flex`, so it disappeared below 640px —
  on all phones. The `/import` route existed and worked; nothing linked to it.
  Reinstalling the PWA could never have revealed it, which is worth stating
  plainly because that is what was tried.
- It now follows the pattern the Share button beside it already used: always
  rendered, label hidden below `sm`, with an `aria-label` so the icon-only form
  stays accessible.
- This was the wrong way round to begin with. Importing a pasted WhatsApp
  message is *more* useful on a phone than on a desktop — the phone is where
  the message arrives.

## 2026-08-10

**Cloudflare R2 is live — uploads, reads, deletes and cached thumbnails all
verified end to end.**

- **`read-urls` could never resolve a cached thumbnail.** It looked every path
  up in `listing_media`, but a static map path lives on `listings
  .static_map_path`, so thumbnails were filtered out and silently returned no
  URL. The static-map feature had never been able to render. It now checks both
  tables, still entirely through the caller's client so RLS remains the
  authorization boundary. (`media` v5)
- Verified in the browser: the board now renders a satellite thumbnail from R2
  **and** legacy Supabase photos side by side, proving the hybrid path.
- Full round trip confirmed: presigned PUT `200` with a readable `ETag` (so
  `ExposeHeaders` is right), presigned GET returning the exact bytes, `delete`
  removing the object, and a fresh GET afterwards returning `404`. The test
  object and its temporary row were removed; only the real thumbnail remains.
- `MAPBOX_TOKEN` confirmed working — the server-side Mapbox fetch succeeded.

- **Production switched to R2** (`VITE_MEDIA_PROVIDER=r2` on Vercel) and
  confirmed in the deployed bundle, where `activeProvider()` is constant-folded
  to `` function Tu(){return`r2`} ``. Unset, Vite would have folded it to
  `"supabase"` instead, so the compiled output is proof rather than inference.
- **Backfilled satellite thumbnails for all 9 listings** — 8 Mapbox calls
  against a 50,000/month free tier. The board now serves 16 images from R2 and
  2 legacy photos from Supabase Storage, none broken: the hybrid read path
  working at full board scale rather than on a single test row.

**Two diagnoses worth keeping.**

- **A browser "CORS" error on upload was not CORS.** R2 rejected the presigned
  PUT with `401`, and error responses carry no `Access-Control-Allow-Origin`
  header, so the browser reported the missing header instead of the real
  status. The bucket's CORS policy was correct all along — confirmed by curling
  the preflight, which needs no credentials and returned the right headers.
- **The cause was a hand-transcribed Access Key ID**: `dal51d…` where R2 keys
  are 32 *hexadecimal* characters, so the `l` was an `l`-for-`1` typo. Worth
  noting that a `200` from `upload-url` proves nothing about credentials — it
  signs locally and never contacts R2. The test that actually touches R2 is
  `static-map`, which PUTs server-side where CORS cannot interfere.
  Both are now written up in [STORAGE.md](STORAGE.md#troubleshooting-uploads).

## 2026-08-05

**Cloudflare R2 groundwork — migration 009 applied, `media` function deployed.**

- **Migration 009 had never actually been applied.** The migration history
  showed 008, 009 and 010 all missing, but checking the real schema found only
  `listing_media.storage_provider` absent — 008 and 010 had been run through the
  SQL editor, which doesn't record history. Nobody noticed because
  `LISTING_SELECT` uses `listing_media(*)` rather than naming columns, so the
  board kept working without it. That column is what routes a file to R2, so R2
  could never have worked. Now applied; the 3 existing media rows are stamped
  `'supabase'` and keep loading untouched.
- **The `media` Edge Function is deployed** with `verify_jwt` off, deliberately:
  `cleanup-sold` is invoked by pg_cron with a shared secret rather than a user
  session, so the platform JWT gate would block it. The function authenticates
  itself — a member's JWT for user actions, `CLEANUP_SECRET` for the sweep.
- **R2 config is now checked, not assumed.** The signer was built at module
  scope from `Deno.env.get(...)!`, so missing secrets meant an opaque signing
  failure mid-upload — or possibly a module-load crash taking down every action
  including the Supabase half of the sweep. The client is now built lazily, and
  any action needing R2 returns a 503 **naming the missing variables**. The
  likely setup mistake is flipping `VITE_MEDIA_PROVIDER=r2` before adding the
  secrets; that now says so in plain words instead of failing cryptically.
  Verified against the deployed function: `upload-url` and `read-urls` return
  the named 503, and `cleanup-sold` still returns a clean 403 rather than
  crashing.

**Contact type is now three-way: Broker / Direct / Owner.**

- Migration `012_contact_type_three_way.sql` (applied). The listing now records
  **how far the poster is from the property**:
  | Value | Meaning |
  | --- | --- |
  | `Owner` | the contact is the owner |
  | `Direct` | exactly one broker in between |
  | `Broker` | a longer chain of brokers |
- **The 4 existing `Owner direct` listings became `Owner`.** That label always
  meant the owner themselves; `Direct` is a genuinely new, narrower category
  that no existing row was ever recorded against.
- **The enum became text + a check constraint**, matching how `visibility`
  (007) and `rate_unit` (010) are already modelled. Postgres cannot add a value
  to an enum and use it in the same transaction, so every future change to this
  list would otherwise need its own two-step migration. Verified beforehand
  that `listings.contact_type` was the enum's only dependant — no other column,
  function argument or return type — before dropping it.
- `CONTACT_TYPES` is now a single exported const in `types.ts` that the form
  maps over, so the next change to this list is one line rather than a hunt for
  hardcoded `<option>` tags.
- **Parser rules updated, most-specific-first.** An owner claim beats a
  "direct" claim: a broker writing "owner direct" is saying the owner is
  reachable, not that there is one broker in the chain. Bare "direct" with no
  owner word is the middle case. "malik"/"maalik" now count as owner.
- **Gemini prompt and schema updated** (`parse-listing` v4). Verified live —
  all five distinctions correct, including *"ek broker beech me hai, direct"*
  → `Direct`:
  | Text | Result |
  | --- | --- |
  | `owner direct` | Owner |
  | `direct deal no chain` | Direct |
  | `broker ke through, 2-3 log beech me hai` | Broker |
  | `seedha malik se baat karo` | Owner |
  | `ek broker beech me hai, direct` | Direct |
- Four new parser tests pin the three-way split; suite is now **25 passing**.

## 2026-08-04

**AI parsing of broker text, with the rules kept as the floor.**

- **Gemini now reads pasted messages.** New `parse-listing` Edge Function
  (deployed, v2) sends the text to Gemini with a fixed JSON response schema and
  returns listing fields. Both capture flows — Import from WhatsApp and Add
  from map — use it via the new `smartParser`.
  Rationale: three separate parser bugs shipped in one week (`sq/ft`
  separators, the rate pattern matching the *area*, a spec line becoming the
  address), and each fix only covered the case we happened to see. The one
  distinction rules genuinely cannot make is **rate vs total** — "@2500" is a
  per-sqft rate, "price 45 lakh" is the whole deal — which needs reading
  comprehension, not pattern matching.
- **The rule-based parser is not gone; it is the floor.** `smartParser` runs it
  first (instant, free, offline) and layers the AI on top: AI wins where it
  produced a value, rules fill every gap. *Any* failure — no key, offline,
  timeout, rate-limited, malformed reply — silently returns the rule-based
  result, so the app behaves exactly as it did before this change. Verified
  end-to-end before the key existed.
- **`mergeParsed` keeps units with their values.** Taking the AI's `area` while
  keeping the rules' `area_unit` would turn 5 acres into 5 sqft, so
  `area`/`area_unit`, `rate`/`rate_unit` and `front`/`front_unit` are each
  applied only when both halves are present. Five new tests pin this; the suite
  is now **19 passing** and runs with no network and no key.
- **Model: `gemini-3.5-flash-lite`**, chosen on the free tier's
  requests-per-day cap rather than on quality. Flash models allow 20 RPD,
  Flash-Lite allows 500. Twenty brokers sharing 20 parses/day would be
  exhausted by one person importing a backlog; 500 turns ~4× headroom into
  ~100×. Override with the `GEMINI_MODEL` secret, no redeploy. **Cost: ₹0**,
  entirely inside the free tier.
- **The banner now says how the text was read** — "read by AI" or "read
  offline". Without it there is no way to tell whether the key is working,
  because the fallback is deliberately silent.
- **`{ action: "models" }`** on the function lists the model IDs the key can
  actually reach. A wrong model ID fails as a 404 that looks identical to "the
  AI isn't working"; this makes it a fact instead of a guess.
- **The key is server-side only.** Unlike the Mapbox and Google Maps *browser*
  keys — public by design, protected by domain restrictions — a Gemini key has
  no such protection and must never become a `VITE_*` variable. It lives in the
  Edge Function's secrets with the service-role key. Spend is bounded by
  requiring a signed-in caller, a 4,000-character input cap, and a 12s timeout.
- Pasted text is treated as **untrusted data, not instructions**. The model's
  only output channel is the fixed schema, and every field is re-validated
  server-side against the allowed enums and numeric ranges before it reaches
  the form.
- **Stale notes are now cleared.** The rules keep leftover lines as notes, so
  "@3000" survived into the notes of a listing whose rate field already said
  3000 — the AI had correctly captured it, but "rules fill the gaps" preserved
  the base's copy. `notes` is now owned by the AI outright when it runs: notes
  is *derived from what's left over*, so once the AI has extracted a line, the
  rules' copy of it is stale by definition. Every other field keeps normal
  gap-filling, because there "absent" means the same thing from both engines.
- New [`docs/PARSER.md`](PARSER.md) covers all of the above, plus setup.

**Verified against the live key** — `gemini-3.5-flash-lite` confirmed reachable,
~1.8s per parse:

| Input | Result |
| --- | --- |
| `residential plot 5000sq/ft` + `@3000` | 5000 sqft, ₹3000/sqft, notes empty |
| `2400 sqft plot` + `price 45 lakh` | area 2400; rate **not** set, total kept in notes |
| `5 acer agriculture plot, @3000000` | 5 acre, ₹30,00,000/acre |
| `200 gaj ka makan … rate 1800 per gaj` | 1800 sqft, ₹200/sqft (÷9), owner direct, 25 ft front |
| `3 hectare … 1.2 cr per acre … pin 492002` | 7.41 acre, ₹1,20,00,000/acre, pincode |
| Prompt-injection attempt | Ignored entirely; only real property data extracted |
| `bhai kal milte hain chai peene` | Empty — nothing hallucinated |

**Dependency advisories cleared (`npm audit fix`).** `brace-expansion`,
`fast-uri` and `postcss` patched — all three are build-tooling transitive deps
that never reach the browser (they disappear under `npm audit --omit=dev`).
Only `package-lock.json` changed, and the built CSS hash was byte-identical
afterwards, so the postcss bump altered no output.

**`react-router` was deliberately left alone.** It is flagged high for
[GHSA-qwww-vcr4-c8h2](https://github.com/advisories/GHSA-qwww-vcr4-c8h2), *"RSC
Mode CSRF Bypass"* — a vulnerability in React Router's **React Server
Components** mode, which requires a server runtime and an explicit opt-in.
PlotBoard is a static client-side SPA using `BrowserRouter` (`main.tsx:28`)
with no React Router server, so nothing the bypass targets exists here. The
offered remedy is worse than the problem: `npm audit fix --force` *downgrades*
to `react-router-dom@7.11.0`, a breaking change, to escape a vulnerability we
don't have. **Upgrade forward when a patched 7.x ships.**

**Supabase security advisors reviewed** — two warnings, one actionable:
- `update_listing_status` being `SECURITY DEFINER` and callable by
  `authenticated` is **intentional**. That is precisely the RPC pattern that
  lets any member change a listing's status without being able to edit other
  fields of someone else's listing. The linter cannot see the intent. No action.
- **Leaked password protection is disabled** — genuine. Enable it under
  Authentication → password settings so Supabase checks new passwords against
  HaveIBeenPwned.

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
- **A spec line is no longer mistaken for an address.** "2400sq.feet
  residential plot, @2500" was being taken as `address_line1`, which then beat
  the locality from the map pin. Lines containing an area, a rate or an `@` are
  now rejected as address candidates — while a genuine line like "Plot 42, near
  water tank" is still used and still wins over the pin.
- **`sq/ft` and `sq-ft` now parse.** The area pattern accepted "sq ft",
  "sq.ft" and "sqft" but not a slash or hyphen, so "5000sq/ft" produced no
  area — and because the area went unrecognised, the line also failed the
  spec-line test and leaked into the address field. One gap, two symptoms.
- While fixing it, a too-broad heuristic briefly rejected "Plot 42, near water
  tank" as a spec line. The type-word check now only fires on *strong* type
  words (residential/commercial/agricultural/industrial), never on
  "plot"/"land", which appear in genuine addresses.
- Parser suite now 14/14.

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
