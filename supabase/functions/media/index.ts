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

const ACCOUNT_ID = Deno.env.get("R2_ACCOUNT_ID")!;
const BUCKET = Deno.env.get("R2_BUCKET")!;
const R2_ENDPOINT = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;

const r2 = new AwsClient({
  accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!,
  secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
  service: "s3",
  region: "auto",
});

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
  const signed = await r2.sign(url.toString(), { method, signQuery: true });
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
            const res = await r2.fetch(objectUrl(row.storage_path), { method: "DELETE" });
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
        const res = await r2.fetch(objectUrl(row.storage_path), { method: "DELETE" });
        if (res.ok || res.status === 404) deleted++;
      }
      return json({ ok: true, deleted });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
