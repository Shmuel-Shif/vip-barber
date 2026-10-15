-- Requires 0006 and 0007 to already be applied. This file does not rewrite existing orders.
-- 0008 is unrelated. Run this only after business_settings.service_minutes exists.
-- Do not run it twice.
--
-- service_minutes on business_settings stays the length for one person.
-- A visit blocks that length once for every adult and child. A beard is not another person.
-- Travel is still added once, after the visit, by the existing gap checks.
-- Stored orders and holds keep the minutes already written on their rows.
-- New holds and new orders pick up the multiplied length through visit_duration.
--
-- Five people at 180 minutes need 900 stored minutes. The old checks stopped at 600.

DO $$
DECLARE
  old_name text;
BEGIN
  FOR old_name IN
    SELECT con.conname
    FROM pg_constraint AS con
    JOIN pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'orders'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%service_minutes%'
  LOOP
    EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT %I', old_name);
  END LOOP;
END;
$$;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_service_minutes_check
  CHECK (service_minutes >= 10 AND service_minutes <= 900);

DO $$
DECLARE
  old_name text;
BEGIN
  FOR old_name IN
    SELECT con.conname
    FROM pg_constraint AS con
    JOIN pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'slot_holds'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%service_minutes%'
  LOOP
    EXECUTE format('ALTER TABLE public.slot_holds DROP CONSTRAINT %I', old_name);
  END LOOP;
END;
$$;

ALTER TABLE public.slot_holds
  ADD CONSTRAINT slot_holds_service_minutes_check
  CHECK (service_minutes >= 10 AND service_minutes <= 900);

CREATE OR REPLACE FUNCTION public.visit_duration(
  p_adults integer,
  p_children integer,
  p_beards integer
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  per_person integer;
  people integer;
BEGIN
  IF p_adults IS NULL OR p_children IS NULL OR p_beards IS NULL
     OR p_adults < 0 OR p_children < 0 OR p_beards < 0
     OR p_adults > 20 OR p_children > 20
     OR p_beards > p_adults
     OR p_adults + p_children < 2 THEN
    RAISE EXCEPTION 'invalid party';
  END IF;
  SELECT settings.service_minutes INTO per_person
  FROM public.business_settings AS settings
  WHERE settings.id = true;
  IF per_person IS NULL OR per_person < 10 OR per_person > 180 THEN
    RAISE EXCEPTION 'service durations are not configured';
  END IF;
  people := p_adults + p_children;
  RETURN per_person * people;
END;
$$;
