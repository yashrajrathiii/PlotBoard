// LD Board — resolve-maps-link Edge Function
//
// Turns a Google Maps SHORT link into coordinates.
//
// WHY THIS EXISTS
// The Google Maps app's share sheet produces `https://maps.app.goo.gl/AbC123`,
// which carries no coordinates at all — they only appear after following the
// redirect. A browser cannot do that: reading a cross-origin redirect target is
// blocked, and Google sends no CORS headers. Since a phone share sheet is the
// single most common way a broker sends a location, resolving these server-side
// is the difference between "paste the link" and "read the numbers out loud".
//
// SECURITY
// This function fetches a URL supplied by the caller, which is an SSRF shape.
// It is contained by a strict HOST ALLOWLIST — only Google's own short-link
// domains — checked after parsing the URL, not by substring matching. It is NOT
// a general fetch proxy and must never become one. The caller must also be a
// signed-in member.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Exact hostnames only. Checked with `===` against the parsed URL's hostname —
 * never `includes()`, which `maps.app.goo.gl.evil.com` would satisfy.
 */
const ALLOWED_HOSTS = new Set([
  "maps.app.goo.gl",
  "goo.gl",
  "www.google.com",
  "google.com",
  "maps.google.com",
]);

/** Don't hang the broker's pin drop on a slow redirect chain. */
const TIMEOUT_MS = 8000;
/** A redirect chain longer than this is a loop or a tracker, not a map link. */
const MAX_REDIRECTS = 5;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const LAT = String.raw`-?\d{1,2}(?:\.\d+)?`;
const LNG = String.raw`-?\d{1,3}(?:\.\d+)?`;

/**
 * Mirrors the URL half of `src/lib/geo.ts` `parseCoords`. Deliberately
 * duplicated rather than shared: Edge Functions are deployed independently of
 * the bundle and cannot import from `src/`. Keep the two in step — the browser
 * handles the human-typed formats, this handles what a redirect lands on.
 */
function coordsFrom(text: string): { lat: number; lng: number } | null {
  const patterns = [
    // The authoritative pin in a resolved place URL.
    new RegExp(String.raw`!3d(${LAT})!4d(${LNG})`),
    new RegExp(String.raw`[?&](?:query|q|ll|center|daddr|destination)=(${LAT}),\s*(${LNG})`, "i"),
    new RegExp(String.raw`@(${LAT}),(${LNG})`),
    new RegExp(String.raw`/(?:place|dir)/(?:[^/]*/)?(${LAT}),(${LNG})`, "i"),
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    return { lat, lng };
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // Signed-in members only — this endpoint makes outbound requests, so it is
    // not something to leave open.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: userData, error: userError } = await admin.auth.getUser(jwt);
    if (userError || !userData.user) {
      return json(
        { error: "Your session has expired. Please sign in again.", code: "session_expired" },
        401,
      );
    }

    const body = await req.json().catch(() => ({}));
    const raw = typeof body.url === "string" ? body.url.trim() : "";
    if (!raw) return json({ error: "url is required" }, 400);
    if (raw.length > 2048) return json({ error: "That link is too long." }, 400);

    let target: URL;
    try {
      target = new URL(raw);
    } catch {
      return json({ error: "That doesn't look like a link." }, 400);
    }
    if (target.protocol !== "https:" && target.protocol !== "http:") {
      return json({ error: "Only http(s) links are supported." }, 400);
    }
    if (!ALLOWED_HOSTS.has(target.hostname.toLowerCase())) {
      return json(
        { error: "Only Google Maps links can be opened here.", code: "host_not_allowed" },
        400,
      );
    }

    // Follow the chain by hand rather than with `redirect: 'follow'`, so every
    // hop is re-checked against the allowlist. Without that, one open redirect
    // on Google's side would turn this into a general-purpose proxy.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let current = target.toString();
    let finalUrl = current;
    let bodyText = "";

    try {
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const res = await fetch(current, {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            // Google serves a coordinate-free interstitial to unknown agents.
            "User-Agent":
              "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36",
            "Accept-Language": "en-IN,en;q=0.9",
          },
        });

        const location = res.headers.get("location");
        if (res.status >= 300 && res.status < 400 && location) {
          const next = new URL(location, current);
          if (!ALLOWED_HOSTS.has(next.hostname.toLowerCase())) {
            return json(
              { error: "That link redirects somewhere unexpected.", code: "redirect_not_allowed" },
              400,
            );
          }
          current = next.toString();
          finalUrl = current;
          // The redirect target itself usually carries the coordinates.
          const early = coordsFrom(current);
          if (early) return json({ ok: true, ...early, resolvedFrom: "redirect" });
          continue;
        }

        finalUrl = res.url || current;
        // Last resort: the coordinates are sometimes only in the page body.
        bodyText = (await res.text()).slice(0, 200_000);
        break;
      }
    } finally {
      clearTimeout(timer);
    }

    const found = coordsFrom(finalUrl) ?? (bodyText ? coordsFrom(bodyText) : null);
    if (!found) {
      return json(
        {
          ok: false,
          code: "no_coords",
          error:
            "Couldn't read a location from that link. Open it in Google Maps, long-press the plot, and copy the numbers.",
        },
        200,
      );
    }
    return json({ ok: true, ...found, resolvedFrom: "final" });
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    console.error("[resolve-maps-link]", e);
    return json(
      {
        ok: false,
        code: aborted ? "timeout" : "error",
        error: aborted ? "That link took too long to open." : "Could not open that link.",
      },
      aborted ? 504 : 500,
    );
  }
});
