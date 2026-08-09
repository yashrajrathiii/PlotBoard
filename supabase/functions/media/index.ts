// PlotBoard — media Edge Function (Cloudflare R2 gateway)
//
// Listing photos/video live in Cloudflare R2 (10 GB free + free egress) while
// all text stays in Supabase. R2 credentials live ONLY here, never in the
// browser bundle — the client asks this function for short-lived presigned
// URLs instead of ever seeing a key.
//
// Authorization deliberately reuses the database's own RLS rather than
// re-implementing permissions: queries run through a Supabase client carrying
// the CALLER's JWT, so policies from migrations 002/007 apply automatically
// (including the rule that hides other members' private listings).
//
// Actions (POST body { action, ... }):
//   upload-url  — caller must OWN the listing → presigned PUT URL + object path
//   read-urls   — batch presigned GET URLs, filtered to media the caller may see
//   delete      — delete objects the caller owns
//   cleanup-sold— scheduled sweep: drop media of listings sold > N days ago
//                 (called with a shared secret, not a user JWT)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { AwsClient } from "npm:aws4fetch@1.0.20";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cleanup-secret",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const R2_VARS = {
  R2_ACCOUNT_ID: Deno.env.get("R2_ACCOUNT_ID"),
  R2_BUCKET: Deno.env.get("R2_BUCKET"),
  R2_ACCESS_KEY_ID: Deno.env.get("R2_ACCESS_KEY_ID"),
  R2_SECRET_ACCESS_KEY: Deno.env.get("R2_SECRET_ACCESS_KEY"),
};
/** Names of any R2 secret not set yet — reported verbatim so setup is fixable. */
const R2_MISSING = Object.entries(R2_VARS)
  .filter(([, v]) => !v)
  .map(([k]) => k);
const r2Ready = R2_MISSING.length === 0;

const ACCOUNT_ID = R2_VARS.R2_ACCOUNT_ID ?? "";
const BUCKET = R2_VARS.R2_BUCKET ?? "";
const R2_ENDPOINT = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;

/**
 * Built on first use, not at module load. Constructing a signer with undefined
 * credentials risks throwing during import, which would take down *every*
 * action — including `cleanup-sold`, whose Supabase half needs no R2 at all.
 */
let _r2: AwsClient | null = null;
function r2Client(): AwsClient {
  _r2 ??= new AwsClient({
    accessKeyId: R2_VARS.R2_ACCESS_KEY_ID!,
    secretAccessKey: R2_VARS.R2_SECRET_ACCESS_KEY!,
    service: "s3",
    region: "auto",
  });
  return _r2;
}

const objectUrl = (path: string) =>
  `${R2_ENDPOINT}/${BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;

/**
 * Presign a single-object operation. NOTE: Content-Type is deliberately NOT
 * signed — including it makes browser PUT uploads fail (the browser sets its
 * own boundary/charset), even though curl would work.
 */
async function presign(path: string, method: "GET" | "PUT", expiresIn: number) {
  const url = new URL(objectUrl(path));
  url.searchParams.set("X-Amz-Expires", String(expiresIn));
  const signed = await r2Client().sign(url.toString(), { method, signQuery: true });
  return signed.url;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXT_RE = /^[a-z0-9]{1,5}$/;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    // Every action below except `cleanup-sold` presigns or writes to R2. The
    // usual setup mistake is flipping VITE_MEDIA_PROVIDER=r2 before adding the
    // secrets, which would otherwise surface to the broker as an opaque
    // signing failure mid-upload. Name the missing variables instead.
    if (!r2Ready && action !== "cleanup-sold") {
      return json(
        {
          error:
            `Cloudflare R2 is not configured yet — missing ${R2_MISSING.join(", ")} ` +
            `in the Edge Function secrets. Until then set VITE_MEDIA_PROVIDER=supabase.`,
          code: "not_configured",
        },
        503,
      );
    }

    // ---------- scheduled sweep (no user session) ----------
    if (action === "cleanup-sold") {
      const secret = req.headers.get("x-cleanup-secret");
      if (!secret || secret !== Deno.env.get("CLEANUP_SECRET")) {
        return json({ error: "Forbidden" }, 403);
      }
      const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const retentionDays = Number(body.retentionDays ?? 30);
      const { data: rows, error } = await admin.rpc("media_pending_cleanup", {
        retention_days: retentionDays,
      });
      if (error) return json({ error: error.message }, 500);

      const doomed = (rows ?? []) as {
        id: string;
        storage_path: string;
        storage_provider: string;
      }[];

      let deleted = 0;
      const failures: string[] = [];
      for (const row of doomed) {
        try {
          if (row.storage_provider === "r2") {
            // The Supabase half of the sweep still runs without R2 configured;
            // only the R2 objects have to wait.
            if (!r2Ready) {
              failures.push(`${row.storage_path}: R2 not configured`);
              continue;
            }
            const res = await r2Client().fetch(objectUrl(row.storage_path), { method: "DELETE" });
            // R2 returns 204 on delete; 404 means it's already gone (fine).
            if (!res.ok && res.status !== 404) {
              failures.push(`${row.storage_path}: HTTP ${res.status}`);
              continue;
            }
          } else {
            await admin.storage.from("listing-media").remove([row.storage_path]);
          }
          await admin.from("listing_media").delete().eq("id", row.id);
          deleted++;
        } catch (e) {
          failures.push(`${row.storage_path}: ${e instanceof Error ? e.message : e}`);
        }
      }
      return json({ ok: true, considered: doomed.length, deleted, failures });
    }

    // ---------- everything else runs as the calling member ----------
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    // Anon key + the caller's JWT => every query below is subject to RLS.
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userError } = await userClient.auth.getUser(jwt);
    if (userError || !userData.user) return json({ error: "Not authenticated" }, 401);
    const userId = userData.user.id;

    // ---------- presigned PUT for a new file ----------
    if (action === "upload-url") {
      const { listingId, ext } = body;
      if (!UUID_RE.test(listingId ?? "")) {
        return json({ error: "A valid listingId is required" }, 400);
      }
      if (!EXT_RE.test(ext ?? "")) {
        return json({ error: "Invalid file extension" }, 400);
      }
      // You may only attach media to a listing you posted. (RLS lets you READ
      // public listings, so ownership is checked explicitly here.)
      const { data: listing } = await userClient
        .from("listings")
        .select("id")
        .eq("id", listingId)
        .eq("created_by", userId)
        .maybeSingle();
      if (!listing) return json({ error: "You can only add media to your own listing" }, 403);

      const path = `${listingId}/${crypto.randomUUID()}.${ext}`;
      const uploadUrl = await presign(path, "PUT", 600); // 10 minutes
      return json({ ok: true, path, uploadUrl, provider: "r2" });
    }

    // ---------- batch presigned GETs ----------
    if (action === "read-urls") {
      const paths: string[] = Array.isArray(body.paths) ? body.paths : [];
      if (paths.length === 0) return json({ ok: true, urls: {} });

      // RLS on listing_media ("read via visible listing") filters this down to
      // the files this member is actually allowed to see — private listings
      // belonging to others simply don't come back.
      const { data: visible, error } = await userClient
        .from("listing_media")
        .select("storage_path")
        .in("storage_path", paths)
        .eq("storage_provider", "r2");
      if (error) return json({ error: error.message }, 500);

      const urls: Record<string, string> = {};
      for (const row of visible ?? []) {
        urls[row.storage_path] = await presign(row.storage_path, "GET", 3600); // 1 hour
      }
      return json({ ok: true, urls });
    }

    // ---------- cache a satellite thumbnail for a listing ----------
    // Fetched ONCE per listing and stored in R2, so listing cards render a
    // picture from R2's free egress instead of mounting a billable live map.
    if (action === "static-map") {
      const { listingId, lat, lng } = body;
      if (!UUID_RE.test(listingId ?? "")) {
        return json({ error: "A valid listingId is required" }, 400);
      }
      if (typeof lat !== "number" || typeof lng !== "number") {
        return json({ error: "lat and lng are required" }, 400);
      }
      const mapboxToken = Deno.env.get("MAPBOX_TOKEN");
      if (!mapboxToken) {
        // Not configured yet — cards fall back to a placeholder. Not an error.
        return json({ ok: true, skipped: "MAPBOX_TOKEN not set" });
      }
      // Ownership: you may only generate a thumbnail for your own listing.
      const { data: listing } = await userClient
        .from("listings")
        .select("id")
        .eq("id", listingId)
        .eq("created_by", userId)
        .maybeSingle();
      if (!listing) return json({ error: "Not your listing" }, 403);

      const styleUrl =
        "https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static";
      const marker = `pin-s+e11d48(${lng},${lat})`;
      const src =
        `${styleUrl}/${marker}/${lng},${lat},15,0/600x400@2x` +
        `?access_token=${mapboxToken}&logo=false&attribution=false`;

      const res = await fetch(src);
      if (!res.ok) {
        return json({ error: `Mapbox static image failed (HTTP ${res.status})` }, 502);
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      const path = `${listingId}/map-${crypto.randomUUID()}.png`;
      const put = await r2Client().fetch(objectUrl(path), {
        method: "PUT",
        body: bytes,
        headers: { "Content-Type": "image/png" },
      });
      if (!put.ok) {
        return json({ error: `Could not store thumbnail (HTTP ${put.status})` }, 502);
      }

      // Replace any previous thumbnail (coordinates may have been edited).
      // userClient, not service-role: the listings UPDATE policy is owner-only,
      // so RLS already guarantees a member can only touch their own row.
      const { data: prev } = await userClient
        .from("listings")
        .select("static_map_path")
        .eq("id", listingId)
        .maybeSingle();
      const { error: updateError } = await userClient
        .from("listings")
        .update({ static_map_path: path })
        .eq("id", listingId);
      if (updateError) return json({ error: updateError.message }, 500);
      if (prev?.static_map_path && prev.static_map_path !== path) {
        await r2Client().fetch(objectUrl(prev.static_map_path), { method: "DELETE" });
      }

      return json({ ok: true, path });
    }

    // ---------- delete objects the caller owns ----------
    if (action === "delete") {
      const paths: string[] = Array.isArray(body.paths) ? body.paths : [];
      if (paths.length === 0) return json({ ok: true, deleted: 0 });

      const { data: owned, error } = await userClient
        .from("listing_media")
        .select("storage_path")
        .in("storage_path", paths)
        .eq("created_by", userId)
        .eq("storage_provider", "r2");
      if (error) return json({ error: error.message }, 500);

      let deleted = 0;
      for (const row of owned ?? []) {
        const res = await r2Client().fetch(objectUrl(row.storage_path), { method: "DELETE" });
        if (res.ok || res.status === 404) deleted++;
      }
      return json({ ok: true, deleted });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
