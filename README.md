# PlotBoard

A shared property-listing board for a small group of real-estate brokers in
Raipur, Chhattisgarh (India). Every member is a broker who can post property
leads that the whole group sees, filters, and shares — one shared board, no
owner/broker split. Invite-only, mobile-first, installable as a PWA.

> **Live data backend:** Supabase project `oiqqweqyamakfhubpbtk` (region
> ap-south-1 / Mumbai). Hosted on Vercel.

---

## Features

- **Invite-only auth** — no public sign-up. The admin invites members by email
  or a shareable WhatsApp link; invitees set their own password and profile.
- **2-device limit** — each account may be signed in on at most 2 devices; a
  third login must evict one (enforced in the database).
- **Listing board** — cards with a photos ⇄ map media carousel, computed deal
  value in Indian format (₹ Lakh / Crore), status and visibility chips.
- **Search & filters** — text search plus city, property type, status, area
  range (sq ft) and rate range (₹/sqft).
- **Add / edit listings** — structured address (works outside Chhattisgarh),
  property type, area + unit, rate with a **show/hide toggle** (rate privacy),
  a Leaflet map pin (tap / search / paste Google-Maps coordinates), notes, up
  to **4 client-compressed photos** and **1 video** (≤30 s, ≤20 MB, checked
  before upload).
- **Public / Private listings** — private leads are visible only to their
  poster (enforced by Row Level Security, not just the UI).
- **Single-listing view** — full-size gallery (photos + video + interactive
  map) with all details; owners get Edit/Delete inside.
- **Sharing** — per-card WhatsApp + copy-to-clipboard, plus a WhatsApp-style
  **multi-select** bar to share several listings at once.
- **Real-time notifications** — a bell with unread badge, an in-app toast, and
  OS-level pop-ups. Everyone is notified when a listing is **added** or **sold**.
- **PWA** — installable on phones ("Add to Home Screen"), offline app shell.

---

## Tech stack

| Layer      | Choice                                                            |
| ---------- | ----------------------------------------------------------------- |
| Frontend   | React 19 · Vite · TypeScript                                      |
| Styling    | Tailwind CSS 4                                                    |
| Maps       | Leaflet + OpenStreetMap (no API key)                             |
| Backend    | Supabase — Postgres, Auth, Row Level Security, Realtime          |
| Media      | Cloudflare R2 (10 GB free, unlimited free egress)                |
| Serverless | Supabase Edge Functions (`invite-user`, `media`)                 |
| Media      | `browser-image-compression` (client-side)                        |
| PWA        | `vite-plugin-pwa` (Workbox)                                      |
| Hosting    | Vercel                                                            |

---

## Quick start (local)

```bash
npm install
cp .env.example .env.local   # then fill in the two values below
npm run dev
```

`.env.local` (never committed — it matches `*.local` in `.gitignore`):

```
VITE_SUPABASE_URL=https://oiqqweqyamakfhubpbtk.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key from Supabase → Settings → API>
```

Both values are safe to expose in the browser — **Row Level Security is the
real security boundary**, not the key. The service-role key is never in this
repo; it lives only in the Edge Function's environment on Supabase.

### Scripts

| Command           | What it does                             |
| ----------------- | ---------------------------------------- |
| `npm run dev`     | Start the Vite dev server                |
| `npm run build`   | Type-check (`tsc -b`) and build to `dist`|
| `npm run preview` | Preview the production build             |
| `npm run lint`    | Lint with oxlint                         |

---

## Deployment

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for the full walkthrough
(Supabase migrations, Edge Function, Vercel env vars, and the post-deploy
Supabase URL configuration that invite links depend on).

---

## Project structure

```
plotboard/
├── src/
│   ├── main.tsx, App.tsx        # entry + routes
│   ├── context/                 # Auth, Notifications, ShareSelection
│   ├── pages/                   # Login, Welcome, Board, MyListings,
│   │                            #   Add/Edit/Detail listing, Invites
│   ├── components/              # Layout, cards, forms, gallery, bell, etc.
│   ├── hooks/                   # useListings, useListing
│   └── lib/                     # supabase client, types, format, geo,
│                                #   media, share, notify, limits, …
├── supabase/
│   ├── migrations/              # 001–008 SQL (schema, RLS, triggers, …)
│   └── functions/invite-user/   # admin Edge Function (service-role)
├── public/icons/                # PWA icons
├── vercel.json                  # SPA rewrite for client-side routing
└── docs/                        # detailed documentation (see below)
```

---

## Documentation

- **[docs/DATABASE.md](docs/DATABASE.md)** — schema, every migration, RLS
  policies, triggers, the notification model, and the Edge Functions.
- **[docs/STORAGE.md](docs/STORAGE.md)** — Cloudflare R2 setup, the cost model,
  and how legacy Supabase files keep working alongside R2.
- **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** — Supabase + Vercel setup,
  environment variables, and post-deploy configuration.
- **[docs/CHANGELOG.md](docs/CHANGELOG.md)** — the full development history:
  what was built, in what order, and the key decisions behind it.

---

## Status & known follow-ups

- **Web Push when the app is fully closed** is not yet implemented. In-app
  toasts and OS pop-ups (while the app runs or is backgrounded) work; true
  background push needs VAPID keys + a push-subscription table + a sender
  function. Tracked in the changelog.
- Public sign-up must be **disabled** in the Supabase dashboard (Authentication
  → Sign In / Up) to keep the board invite-only.
