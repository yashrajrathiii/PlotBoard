-- ============================================================================
-- PlotBoard — Migration 010: road frontage + per-acre rates
--
-- Two broker-requested additions:
--   * front / front_unit — the road-facing frontage of the plot. This is a
--     LENGTH (running feet or metres), not an area, so it gets its own unit
--     domain (ft|m) separate from area_unit (acre|sqft). Optional.
--   * rate_unit — rates may now be quoted per ACRE as well as per sqft, which
--     is how agricultural and farmhouse land is normally priced here.
--
-- Both use text + check rather than enums, following the `visibility`
-- precedent in migration 007: `alter type ... add value` cannot run inside a
-- transaction with other DDL, which makes enums awkward to extend later.
-- ============================================================================

alter table public.listings
  add column front      numeric,
  add column front_unit text not null default 'ft',
  add column rate_unit  text not null default 'sqft';

alter table public.listings
  add constraint listings_front_check       check (front is null or front > 0),
  add constraint listings_front_unit_check  check (front_unit in ('ft', 'm')),
  add constraint listings_rate_unit_check   check (rate_unit in ('sqft', 'acre'));

comment on column public.listings.front is
  'Road-facing frontage as a LENGTH (see front_unit), not an area. Optional.';
comment on column public.listings.rate_unit is
  'Unit the poster quoted `rate` in: per sqft or per acre.';

-- ----------------------------------------------------------------------------
-- rate_per_sqft — `rate` normalised to ₹/sqft so mixed-unit listings can be
-- compared and filtered fairly.
--
-- Without this, a "max ₹5,000/sqft" filter would match every per-acre listing,
-- because an acre rate is a number in the millions. This mirrors how area_sqft
-- already normalises acre/sqft areas for the area filter.
-- ----------------------------------------------------------------------------
alter table public.listings
  add column rate_per_sqft numeric generated always as (
    case when rate_unit = 'acre' then rate / 43560 else rate end
  ) stored;

comment on column public.listings.rate_per_sqft is
  'rate normalised to ₹/sqft. Filter and compare on this, never on raw rate.';

-- ----------------------------------------------------------------------------
-- deal_value must now account for the rate unit as well as the area unit.
-- A STORED generated column''s expression cannot be altered in place, so the
-- column is dropped and re-added.
--
-- Existing rows are unaffected in value: rate_unit defaults to 'sqft', which
-- reduces the new expression to exactly the old one (area_sqft * rate).
-- ----------------------------------------------------------------------------
-- Formula note: this converts the AREA into the rate's unit and multiplies,
-- rather than normalising the rate to ₹/sqft first. Both are algebraically
-- equal, but `rate / 43560` is a non-terminating decimal that Postgres numeric
-- truncates, so the normalised form would store ₹1,59,99,999.9999… for
-- "2 acres @ ₹80,00,000/acre". This form is exact whenever the two units
-- match — which is the overwhelmingly common case.
alter table public.listings drop column deal_value;

alter table public.listings
  add column deal_value numeric generated always as (
    case
      when rate_unit = 'acre'
        then (case when area_unit = 'acre' then area else area / 43560 end) * rate
      else (case when area_unit = 'acre' then area * 43560 else area end) * rate
    end
  ) stored;

comment on column public.listings.deal_value is
  'Computed: area in sqft × rate in ₹/sqft, honouring both unit choices.';

-- Filters sort/range on the normalised rate.
create index if not exists listings_rate_per_sqft_idx
  on public.listings (rate_per_sqft);
