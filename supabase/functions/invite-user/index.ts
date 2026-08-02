// PlotBoard — invite-user Edge Function (admin member management)
//
// The ONLY place the service-role key is used; it lives in the function's
// environment (auto-injected by Supabase), never in the frontend bundle.
// Every request is gated on the caller's profile having is_admin = true.
//
// Actions (POST body { action, ... }):
//   "invite"  (default) — send a Supabase Auth invite email. On an already-
//                         invited address, returns code:"already_registered".
//   "link"              — generate a shareable invite link (for WhatsApp),
//                         no email sent; falls back to a magic link if the
//                         address already exists.
//   "list"              — return all members with email + joined status, so
//                         the admin can see exactly who was invited.
//   "delete"            — remove a user by id (cancel a pending invite or
//                         remove a member). Cannot remove yourself.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Reject spaces and commas (common typos like "a,b@x.com") as well as the
// obvious shape requirements.
const EMAIL_RE = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Identify the caller and confirm they're the admin.
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: userData, error: userError } = await admin.auth.getUser(jwt);
    if (userError || !userData.user) {
      // Distinguish an expired/revoked session from a missing one so the
      // client can sign the user out and re-prompt instead of showing a
      // generic failure on an otherwise healthy-looking page.
      return json({
        error: "Your session has expired. Please sign in again.",
        code: "session_expired",
      }, 401);
    }
    const callerId = userData.user.id;
    const { data: profile } = await admin
      .from("profiles")
      .select("is_admin")
      .eq("id", callerId)
      .single();
    if (!profile?.is_admin) {
      return json({ error: "Only the admin can manage members" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "invite";
    const redirect = typeof body.redirectTo === "string" ? body.redirectTo : undefined;

    // -------- list members (with email + joined status) --------
    if (action === "list") {
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, name, phone, is_admin, created_at")
        .order("created_at", { ascending: true });
      const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const byId = new Map((list?.users ?? []).map((u) => [u.id, u]));
      const members = (profiles ?? []).map((p) => {
        const u = byId.get(p.id);
        return {
          id: p.id,
          name: p.name,
          phone: p.phone,
          is_admin: p.is_admin,
          created_at: p.created_at,
          email: u?.email ?? null,
          // "joined" = has actually signed in at least once (accepted invite
          // and set a password). Pending invites have no last_sign_in_at.
          joined: !!u?.last_sign_in_at,
        };
      });
      return json({ ok: true, members });
    }

    // -------- delete / cancel a member --------
    if (action === "delete") {
      const targetId = body.userId;
      if (!targetId || typeof targetId !== "string") {
        return json({ error: "userId is required" }, 400);
      }
      if (targetId === callerId) {
        return json({ error: "You can't remove yourself." }, 400);
      }
      const { error } = await admin.auth.admin.deleteUser(targetId);
      if (error) {
        // A member who has posted listings can't be hard-deleted (their
        // listings reference them). Surface a clear message.
        const fk = /foreign key|violates|constraint/i.test(error.message);
        return json({
          error: fk
            ? "This member has posted listings, so they can't be removed until those listings are deleted."
            : error.message,
        }, 400);
      }
      return json({ ok: true });
    }

    // -------- invite / link both require a valid email --------
    const email = (body.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      return json({ error: "Enter a valid email address (no spaces or commas)." }, 400);
    }

    if (action === "link") {
      let { data, error } = await admin.auth.admin.generateLink({
        type: "invite",
        email,
        options: { redirectTo: redirect },
      });
      if (
        error &&
        ((error as { code?: string }).code === "email_exists" ||
          /already.*(registered|exists)/i.test(error.message))
      ) {
        ({ data, error } = await admin.auth.admin.generateLink({
          type: "magiclink",
          email,
          options: { redirectTo: redirect },
        }));
      }
      if (error || !data) {
        return json({ error: error?.message ?? "Could not create link" }, 400);
      }
      return json({
        ok: true,
        link: data.properties.action_link,
        user: { id: data.user.id, email: data.user.email },
      });
    }

    // action === "invite"
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: redirect,
    });
    if (error) {
      // Match on the error code first — GoTrue's wording drifts between
      // versions, and relying on the message alone has silently broken this
      // path before. Fall back to the message for older versions.
      const already =
        (error as { code?: string }).code === "email_exists" ||
        /already.*(registered|exists)/i.test(error.message);

      if (already) {
        // Don't dead-end: an already-invited address can never be re-invited
        // by email, so hand back a fresh usable link instead of an error the
        // admin can do nothing about.
        const { data: linkData } = await admin.auth.admin.generateLink({
          type: "magiclink",
          email,
          options: { redirectTo: redirect },
        });
        if (linkData?.properties?.action_link) {
          return json({
            ok: true,
            code: "already_registered",
            link: linkData.properties.action_link,
            user: { id: linkData.user.id, email: linkData.user.email },
            notice:
              "This email was already invited, so we generated a fresh sign-in link you can share instead.",
          });
        }
      }
      // Supabase's built-in mailer is rate limited on the free tier; say so
      // plainly and point at the link flow, which doesn't send email.
      const rateLimited =
        (error as { code?: string }).code === "over_email_send_rate_limit" ||
        /rate limit/i.test(error.message);

      return json(
        {
          error: already
            ? "This email has already been invited."
            : rateLimited
              ? 'Supabase\'s email limit was hit. Use "Get WhatsApp link" instead — it doesn\'t send email.'
              : error.message,
          code: already ? "already_registered" : rateLimited ? "rate_limited" : undefined,
        },
        400,
      );
    }
    return json({ ok: true, user: { id: data.user.id, email: data.user.email } });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
