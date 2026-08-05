-- 012_contact_type_three_way.sql
--
-- Splits contact_type from two values into three, so a listing says how far
-- the poster actually is from the property:
--
--   Owner   the contact IS the owner
--   Direct  exactly one broker in between
--   Broker  a longer chain of brokers
--
-- Existing 'Owner direct' rows become 'Owner' — that label always meant the
-- owner themselves, and 'Direct' is a genuinely new, narrower category that no
-- existing row was ever recorded against.
--
-- The enum becomes text + a check constraint, matching how `visibility` (007)
-- and `rate_unit` (010) are already modelled. Postgres cannot add a value to
-- an enum and use it in the same transaction, so every future change to this
-- list would otherwise need its own two-step migration; a check constraint is
-- a single ALTER.

-- The default is dropped first: it is an expression of the old enum type and
-- would block the column's type change.
alter table public.listings alter column contact_type drop default;

-- Convert and remap in one pass, so no row is ever left holding a value the
-- new constraint would reject.
alter table public.listings
  alter column contact_type type text
  using case contact_type::text
         when 'Owner direct' then 'Owner'
         else contact_type::text
       end;

alter table public.listings alter column contact_type set default 'Broker';

alter table public.listings
  add constraint listings_contact_type_check
  check (contact_type in ('Broker', 'Direct', 'Owner'));

-- Nothing references the enum any more (verified: listings.contact_type was
-- its only dependant — no other column, function argument or return type).
drop type public.contact_type;
