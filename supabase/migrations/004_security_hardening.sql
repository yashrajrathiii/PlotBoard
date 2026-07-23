-- ============================================================================
-- PlotBoard — Migration 004: security hardening (from Supabase advisor run)
--
-- 1. Pin search_path on the remaining trigger functions so a malicious role
--    cannot hijack unqualified references inside them.
-- 2. Trigger functions should never be callable via the Data API RPC
--    endpoint (/rest/v1/rpc/...). Revoke EXECUTE from the API roles; Postgres
--    still fires them as triggers regardless of EXECUTE privileges.
--
-- Deliberately NOT revoked: update_listing_status() for `authenticated` —
-- that RPC is the designed path for non-owners to change a listing's status.
-- ============================================================================

alter function public.check_media_limits() set search_path = public;
alter function public.set_updated_at()     set search_path = public;

revoke execute on function public.handle_new_user()          from public, anon, authenticated;
revoke execute on function public.on_listing_status_change() from public, anon, authenticated;
revoke execute on function public.check_media_limits()       from public, anon, authenticated;
revoke execute on function public.set_updated_at()           from public, anon, authenticated;
