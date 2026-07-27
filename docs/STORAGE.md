# Media Storage — Cloudflare R2

Listing photos and video live in **Cloudflare R2**; all text/relational data
stays in Supabase. This document covers the setup steps, the cost model, and
how the hybrid old/new file handling works.

## Why R2

For an app whose main job is showing photos to ~18 brokers all day, **egress
(bandwidth) is the meter that bites first, not storage**. R2 is the only major
provider with **zero egress charges, permanently**.

| | Supabase (before) | Cloudflare R2 | Storj |
| --- | --- | --- | --- |
| Free storage | 1 GB | **10 GB** | 25 GB |
| Free egress | 5 GB/mo | **Unlimited** | 25 GB/mo |
| Over-limit storage | $0.021/GB | **$0.015/GB** | $0.004/GB |
| Over-limit egress | $0.09/GB | **$0** | $0.007/GB |

A realistic board-browsing load (18 brokers × ~10 opens/day × ~15 thumbnails)
is roughly **24 GB of egress per month** — which would exhaust Storj's monthly
allowance in about a week and stop images loading for everyone. On R2 that
traffic is free no matter how much it grows.

---

## Payment structure

R2 bills three things. Only the first one will ever realistically cost you
anything.

### 1. Storage — $0.015 per GB per month, first **10 GB free**

| Total stored | Billable | Cost/month | ≈ INR |
| --- | --- | --- | --- |
| Under 10 GB | 0 | **$0.00** | ₹0 |
| 20 GB | 10 GB | $0.15 | ~₹13 |
| 50 GB | 40 GB | $0.60 | ~₹53 |
| 100 GB | 90 GB | $1.35 | ~₹120 |
| 150 GB | 140 GB | $2.10 | ~₹185 |

### 2. Operations — effectively free at your scale

| Class | What it covers | Free per month | Your usage |
| --- | --- | --- | --- |
| Class A | uploads (PUT), listing | 1,000,000 | ~150 |
| Class B | downloads (GET) | 10,000,000 | ~80,000 |

You'd use well under **1%** of either allowance. Treat operations as free.

### 3. Egress — **$0, always.** Not metered, no cap.

### What this means in practice

With WebP photos (~350 KB each) a listing averages ~2 MB without video, ~20 MB
with. Because **media of sold listings is deleted 30 days after the sale**,
storage reaches a *steady state* rather than growing forever:

> ~180 active listings × ~8 MB ≈ **1.4 GB** — comfortably inside the free
> 10 GB, indefinitely.

So the realistic expected bill is **₹0/month**, with a worst case of a few
hundred rupees only if the board grows far beyond current expectations.

Two practical notes:
- **R2 requires a payment method on file** even to use the free tier. You are
  not charged while under the limits.
- If you do exceed the free tier, R2 **keeps working and bills the difference**
  — it does not cut you off mid-month the way a hard-capped free tier does.
  Set a billing alert in Cloudflare → Notifications if you want a heads-up.

---

## One-time setup

### 1. Create the bucket
Cloudflare dashboard → **R2** → *Create bucket* → name it `plotboard-media`.
Location: **Automatic** (or APAC for India). Add a payment method if prompted.

### 2. Create an API token
R2 → **Manage R2 API Tokens** → *Create API token*:
- Permission: **Object Read & Write**
- Scope: only the `plotboard-media` bucket

Copy the three values — they're shown once:
`Account ID`, `Access Key ID`, `Secret Access Key`.

### 3. Add the CORS policy
Bucket → **Settings → CORS policy** → paste (swap in your real Vercel domain):

```json
[
  {
    "AllowedOrigins": ["http://localhost:5173", "https://YOUR-APP.vercel.app"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Without this, browser uploads fail even with a valid presigned URL.

### 4. Apply migration 009
Run `supabase/migrations/009_media_storage_provider.sql` in the Supabase SQL
editor. **Do this before deploying the frontend** (the app tolerates either
order, but the new column is what routes files to R2).

### 5. Set the Edge Function secrets
Supabase → **Edge Functions → Secrets**:

```
R2_ACCOUNT_ID        = <Account ID>
R2_ACCESS_KEY_ID     = <Access Key ID>
R2_SECRET_ACCESS_KEY = <Secret Access Key>
R2_BUCKET            = plotboard-media
CLEANUP_SECRET       = <any long random string you generate>
```

These never appear in the repo or the browser bundle.

### 6. Deploy the function
```bash
supabase functions deploy media
```
Or paste `supabase/functions/media/index.ts` into the dashboard editor.

### 7. Flip new uploads to R2
Set the env var in **both** places:
- `.env.local` → `VITE_MEDIA_PROVIDER=r2`
- Vercel → Settings → Environment Variables → `VITE_MEDIA_PROVIDER=r2`, redeploy

Until this is set, uploads keep going to Supabase. **Setting it back to
`supabase` is the rollback** — files already in R2 keep loading either way.

### 8. Schedule the sold-media cleanup
In the Supabase SQL editor (needs `pg_cron` + `pg_net`, both available on the
free plan):

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'plotboard-cleanup-sold-media',
  '30 2 * * *',                      -- daily, 02:30 UTC (08:00 IST)
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/media',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-cleanup-secret', '<CLEANUP_SECRET>'
               ),
    body    := jsonb_build_object('action', 'cleanup-sold', 'retentionDays', 30)
  );
  $$
);
```

To change the retention window later, edit `retentionDays` here and
`SOLD_MEDIA_RETENTION_DAYS` in `src/lib/limits.ts`.

---

## How the hybrid works

Every `listing_media` row carries `storage_provider`:

- `'supabase'` — files uploaded before the switch. Still read via Supabase
  signed URLs. Nothing had to be migrated.
- `'r2'` — new uploads. Read via presigned R2 URLs minted by the `media`
  Edge Function.

`src/lib/mediaStorage.ts` is the only module that talks to either store. It
splits a batch by provider, resolves URLs in one round trip each, and merges
the result — so the UI never knows or cares where a file lives.

**Security:** R2 credentials exist only in the Edge Function's environment.
The browser receives short-lived presigned URLs (1 h for reads, 10 min for
uploads). Authorization reuses the database's own RLS — the function queries
`listing_media` with the *caller's* JWT, so a member cannot obtain a URL for
someone else's private listing.

## Optional: retire Supabase Storage later

Once R2 has been running cleanly for a while, the remaining legacy objects can
be copied over and `storage_provider` flipped to `'r2'`, freeing the Supabase
Storage tier entirely. Not required — the hybrid can run indefinitely.
