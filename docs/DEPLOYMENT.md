# Deployment

PlotBoard = a Vite static frontend on **Vercel** + a **Supabase** backend.
This guide covers a fresh deploy and the ongoing workflow.

## 1. Supabase (backend)

The project (`oiqqweqyamakfhubpbtk`) already exists. For a fresh project you'd
recreate it from these steps.

### 1a. Apply the migrations
Run the files in `supabase/migrations/` **in order** (001 → 008) via the
Supabase SQL editor or the CLI:

```bash
supabase link --project-ref <ref>
supabase db push          # or paste each file into the SQL editor in order
```

### 1b. Deploy the Edge Function
```bash
supabase functions deploy invite-user
```
The function reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from its
environment (Supabase injects these automatically — do **not** add them to the
repo).

### 1c. Disable public sign-up
Dashboard → **Authentication → Sign In / Up** → turn **off** "Allow new users
to sign up". This is what makes the board invite-only.

### 1d. Bootstrap the admin
Invite the admin email (`rathiyash12@gmail.com`) once — the `handle_new_user`
trigger auto-sets `is_admin = true` for that address. Additional admins:
`update public.profiles set is_admin = true where id = '<uuid>';`

### 1e. Media storage (Cloudflare R2)
Listing photos/video are stored in Cloudflare R2, not Supabase Storage. The
bucket, API token, CORS policy, Edge Function secrets, and the sold-media
cleanup schedule are all covered in **[STORAGE.md](STORAGE.md)** — including
the cost model. Deploy the `media` function alongside `invite-user`:

```bash
supabase functions deploy media
```

## 2. Vercel (frontend)

1. **Import** the GitHub repo `yashrajrathiii/PlotBoard`. Vercel auto-detects
   **Vite** (build `npm run build`, output `dist`). `vercel.json` already adds
   the SPA rewrite so client-side routes (`/listing/:id`, `/my-listings`, the
   `/welcome` invite landing, etc.) don't 404.

2. **Environment variables** (Settings → Environment Variables) — required,
   since `.env.local` is not in the repo:

   ```
   VITE_SUPABASE_URL=https://oiqqweqyamakfhubpbtk.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key: Supabase → Settings → API>
   VITE_MEDIA_PROVIDER=r2      # omit or set 'supabase' to keep uploads on Supabase
   ```

   Add them to Production (and Preview if you want preview deploys to work).

3. **Deploy.**

## 3. Post-deploy: point Supabase at the Vercel URL

This step is easy to forget and breaks invite/magic links until done.

Dashboard → **Authentication → URL Configuration**:
- **Site URL** → your Vercel domain (e.g. `https://plotboard.vercel.app`).
- **Redirect URLs** → add `https://<your-domain>/**` (keep
  `http://localhost:5173/**` for local dev).

Invite links and WhatsApp invite links redirect through this allowlist; without
the production URL they keep pointing at localhost.

## 4. Ongoing workflow

- **Frontend changes:** push to `main` → Vercel auto-builds and deploys.
  ```bash
  git add -A && git commit -m "…" && git push
  ```
- **Schema changes:** add a new `supabase/migrations/00X_*.sql` file and apply
  it to the project. Never edit an already-applied migration — add a new one.
- **Edge Function changes:** edit `supabase/functions/invite-user/index.ts` and
  redeploy with `supabase functions deploy invite-user`.

## Environment variables reference

| Variable                        | Where            | Secret? | Notes                                  |
| ------------------------------- | ---------------- | ------- | -------------------------------------- |
| `VITE_SUPABASE_URL`             | Vercel + `.env.local` | No | Project URL                             |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Vercel + `.env.local` | No | Browser-safe; RLS is the security line  |
| `VITE_MEDIA_PROVIDER`           | Vercel + `.env.local` | No | `r2` or `supabase`; routes new uploads   |
| `SUPABASE_SERVICE_ROLE_KEY`     | Supabase function env | **Yes** | Auto-injected; never in the repo      |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | Supabase function env | **Yes** | R2 credentials — function only |
| `CLEANUP_SECRET`                | Supabase function env | **Yes** | Guards the scheduled cleanup sweep      |

## Troubleshooting

- **Deep link 404s on Vercel** → `vercel.json` rewrite missing or env not set.
- **Invite links open localhost** → add the Vercel URL to Supabase Redirect URLs.
- **"invite already registered"** → the address was already invited; use *Get
  WhatsApp link* to resend, or cancel the pending invite on the Invites page.
- **No realtime notifications** → confirm migration 008 is applied and the
  table is in the `supabase_realtime` publication (migration 002).
