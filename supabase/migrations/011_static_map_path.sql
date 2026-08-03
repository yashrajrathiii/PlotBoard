-- ============================================================================
-- PlotBoard — Migration 011: cached satellite thumbnail per listing
--
-- Listing cards must never mount a live map. Each card previously created its
-- own Leaflet instance, which was free on OpenStreetMap but would be ruinous
-- on a metered provider: a 15-card board = 15 billable map loads per view,
-- roughly $500/month at this team's usage.
--
-- Instead each listing gets ONE satellite image, fetched once from the Mapbox
-- Static Images API and stored in R2. Cards then render a cached picture from
-- R2's free egress, so browsing the board costs nothing no matter how often
-- it is opened.
--
-- Nullable by design: listings created before this (or while R2 is not yet
-- configured) simply have no thumbnail, and the card falls back to a
-- placeholder. Nothing breaks.
-- ============================================================================

alter table public.listings
  add column static_map_path text;

comment on column public.listings.static_map_path is
  'R2 object path of the cached satellite thumbnail. Null = not generated yet; the card falls back to a placeholder.';
