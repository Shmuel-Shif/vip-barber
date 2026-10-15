-- Review only. Do not run until the SQL is approved.
-- Paste this whole file once in the Supabase SQL editor. Do not run 0001–0005 again.
-- Replaces request_appointment with the same customer checks plus a hold id.
-- A repeated send returns only the order created from that same hold id.
-- It does not look up an older order by time. There is no modulo check.
-- A start may be 18:10. It must still be inside open hours and earlier than closing.
-- The haircut may end after closing. Travel is only part of the reserved gap.
-- Approving, rejecting, and cancelling stay on the existing update path.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS source_hold_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS orders_source_hold_id_uidx
  ON public.orders (source_hold_id);

CREATE TABLE IF NOT EXISTS public.slot_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL UNIQUE REFERENCES public.profiles (id) ON DELETE CASCADE,
  appointment_date date NOT NULL,
  appointment_time time NOT NULL,
  adults integer NOT NULL CHECK (adults >= 0 AND adults <= 20),
  children integer NOT NULL CHECK (children >= 0 AND children <= 20),
  beards integer NOT NULL CHECK (beards >= 0 AND beards <= adults),
  CHECK (adults + children BETWEEN 2 AND 5),
  service_minutes integer NOT NULL CHECK (service_minutes >= 10 AND service_minutes <= 600),
  travel_minutes integer NOT NULL CHECK (travel_minutes >= 0 AND travel_minutes <= 180),
  span tstzrange NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS slot_holds_date_idx
  ON public.slot_holds (appointment_date);

ALTER TABLE public.slot_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slot_holds FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.slot_holds FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.orders FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.orders_prepare()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_at timestamptz;
  travel integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.appointment_date IS NULL OR NEW.appointment_time IS NULL OR NEW.payment IS NULL THEN
      RAISE EXCEPTION 'invalid appointment';
    END IF;
    IF NEW.adults + NEW.children > 5 THEN
      RAISE EXCEPTION 'party too large';
    END IF;
    IF NEW.source_hold_id IS NULL THEN
      RAISE EXCEPTION 'hold expired';
    END IF;
    IF EXTRACT(SECOND FROM NEW.appointment_time) <> 0
       OR EXTRACT(MINUTE FROM NEW.appointment_time)::integer NOT BETWEEN 0 AND 59 THEN
      RAISE EXCEPTION 'invalid appointment';
    END IF;
    IF NEW.payment NOT IN ('paybox', 'cash', 'transfer') THEN
      RAISE EXCEPTION 'invalid appointment';
    END IF;
    PERFORM public.lock_service_date(NEW.appointment_date);
    SELECT travel_minutes INTO travel FROM public.business_settings WHERE id = true;
    IF travel IS NULL THEN
      RAISE EXCEPTION 'travel time is not configured';
    END IF;
    NEW.service_minutes := public.visit_duration(NEW.adults, NEW.children, NEW.beards);
    NEW.travel_minutes := travel;
    start_at := (NEW.appointment_date + NEW.appointment_time) AT TIME ZONE 'Asia/Jerusalem';
    NEW.span := tstzrange(start_at, start_at + make_interval(mins => NEW.service_minutes), '[)');
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'authentication required';
    END IF;
    NEW.customer_id := auth.uid();
    NEW.status := 'pending';
    NEW.full_name := btrim(NEW.full_name);
    NEW.phone := btrim(NEW.phone);
    NEW.cancelled_by := NULL;
    NEW.cancelled_at := NULL;
    NEW.local_order_key := NULL;
    RETURN NEW;
  END IF;

  PERFORM public.lock_service_dates(OLD.appointment_date, NEW.appointment_date);
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.adults IS DISTINCT FROM OLD.adults
     OR NEW.children IS DISTINCT FROM OLD.children
     OR NEW.beards IS DISTINCT FROM OLD.beards
     OR NEW.appointment_date IS DISTINCT FROM OLD.appointment_date
     OR NEW.appointment_time IS DISTINCT FROM OLD.appointment_time
     OR NEW.service_minutes IS DISTINCT FROM OLD.service_minutes
     OR NEW.travel_minutes IS DISTINCT FROM OLD.travel_minutes
     OR NEW.span IS DISTINCT FROM OLD.span
     OR NEW.full_name IS DISTINCT FROM OLD.full_name
     OR NEW.phone IS DISTINCT FROM OLD.phone
     OR NEW.city IS DISTINCT FROM OLD.city
     OR NEW.street IS DISTINCT FROM OLD.street
     OR NEW.house_number IS DISTINCT FROM OLD.house_number
     OR NEW.entrance IS DISTINCT FROM OLD.entrance
     OR NEW.floor IS DISTINCT FROM OLD.floor
     OR NEW.apartment IS DISTINCT FROM OLD.apartment
     OR NEW.entry_code IS DISTINCT FROM OLD.entry_code
     OR NEW.notes IS DISTINCT FROM OLD.notes
     OR NEW.payment IS DISTINCT FROM OLD.payment
     OR NEW.photo_path IS DISTINCT FROM OLD.photo_path
     OR NEW.local_order_key IS DISTINCT FROM OLD.local_order_key
     OR NEW.source_hold_id IS DISTINCT FROM OLD.source_hold_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'appointment cannot be rewritten';
  END IF;

  IF auth.uid() IS NOT NULL
     AND OLD.customer_id = auth.uid()
     AND NEW.status = 'cancelled'
     AND NEW.cancelled_by = 'customer' THEN
    IF OLD.status NOT IN ('pending', 'approved')
       OR lower(OLD.span) - now() <= interval '7 hours' THEN
      RAISE EXCEPTION 'customer cannot change this order';
    END IF;
    NEW.cancelled_by := 'customer';
    NEW.cancelled_at := now();
  ELSIF public.is_admin() THEN
    IF NEW.status = 'approved' AND OLD.status = 'pending' THEN
      NEW.cancelled_by := NULL;
      NEW.cancelled_at := NULL;
    ELSIF NEW.status = 'rejected' AND OLD.status = 'pending' THEN
      NEW.cancelled_by := NULL;
      NEW.cancelled_at := NULL;
    ELSIF NEW.status = 'cancelled' AND OLD.status IN ('pending', 'approved') THEN
      NEW.cancelled_by := 'admin';
      NEW.cancelled_at := now();
    ELSE
      RAISE EXCEPTION 'invalid status change';
    END IF;
  ELSE
    RAISE EXCEPTION 'authentication required';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_visit(
  p_adults integer,
  p_children integer,
  p_beards integer,
  p_date date,
  p_time time
)
RETURNS TABLE (
  service_minutes integer,
  travel_minutes integer,
  start_at timestamptz,
  service_span tstzrange
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  day record;
  today_local date := (now() AT TIME ZONE 'Asia/Jerusalem')::date;
  open_until date;
  v_service integer;
  v_travel integer;
  v_start timestamptz;
  v_end timestamptz;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_span tstzrange;
  item jsonb;
  blocked_slot text;
  blocked_start timestamptz;
BEGIN
  IF p_adults IS NULL OR p_children IS NULL OR p_beards IS NULL
     OR p_date IS NULL OR p_time IS NULL
     OR p_adults < 0 OR p_children < 0 OR p_beards < 0
     OR p_adults > 20 OR p_children > 20
     OR p_adults + p_children < 2
     OR p_beards > p_adults
     OR EXTRACT(SECOND FROM p_time) <> 0
     OR EXTRACT(MINUTE FROM p_time)::integer NOT BETWEEN 0 AND 59 THEN
    RAISE EXCEPTION 'invalid appointment';
  END IF;
  IF p_adults + p_children > 5 THEN
    RAISE EXCEPTION 'party too large';
  END IF;

  open_until := today_local + (6 - EXTRACT(DOW FROM today_local)::integer) + 7;
  IF p_date < today_local OR p_date > open_until THEN
    RAISE EXCEPTION 'outside the open booking week';
  END IF;

  SELECT status, start_time, end_time, breaks, blocked
  INTO day
  FROM (
    SELECT status, start_time, end_time, breaks, blocked, 1 AS rank
    FROM public.date_exceptions
    WHERE service_date = p_date
    UNION ALL
    SELECT status, start_time, end_time, breaks, blocked, 2
    FROM public.week_overrides
    WHERE week_start = (p_date - EXTRACT(DOW FROM p_date)::integer)
      AND weekday = EXTRACT(DOW FROM p_date)::integer
    UNION ALL
    SELECT status, start_time, end_time, breaks, blocked, 3
    FROM public.weekly_hours
    WHERE weekday = EXTRACT(DOW FROM p_date)::integer
  ) AS choices
  ORDER BY rank
  LIMIT 1;

  IF day.status IS DISTINCT FROM 'hours' OR day.start_time IS NULL OR day.end_time IS NULL THEN
    RAISE EXCEPTION 'closed';
  END IF;

  v_service := public.visit_duration(p_adults, p_children, p_beards);
  SELECT settings.travel_minutes INTO v_travel
  FROM public.business_settings AS settings
  WHERE settings.id = true;
  IF v_travel IS NULL THEN
    RAISE EXCEPTION 'travel time is not configured';
  END IF;
  v_start := (p_date + p_time) AT TIME ZONE 'Asia/Jerusalem';
  v_end := v_start + make_interval(mins => v_service);
  v_day_start := (p_date + day.start_time) AT TIME ZONE 'Asia/Jerusalem';
  v_day_end := (p_date + day.end_time) AT TIME ZONE 'Asia/Jerusalem';
  v_span := tstzrange(v_start, v_end, '[)');

  IF v_start <= now() OR v_start < v_day_start OR v_start >= v_day_end THEN
    RAISE EXCEPTION 'outside open hours';
  END IF;

  IF day.breaks IS NULL OR jsonb_typeof(day.breaks) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid break';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(day.breaks)
  LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object'
       OR NULLIF(item->>'start', '') IS NULL
       OR NULLIF(item->>'end', '') IS NULL THEN
      RAISE EXCEPTION 'invalid break';
    END IF;
    IF v_span && tstzrange(
      (p_date + (item->>'start')::time) AT TIME ZONE 'Asia/Jerusalem',
      (p_date + (item->>'end')::time) AT TIME ZONE 'Asia/Jerusalem',
      '[)'
    ) THEN
      RAISE EXCEPTION 'overlaps a break';
    END IF;
  END LOOP;

  FOREACH blocked_slot IN ARRAY COALESCE(day.blocked, '{}')
  LOOP
    IF blocked_slot IS NULL OR blocked_slot !~ '^([01][0-9]|2[0-3]):(00|30)$' THEN
      RAISE EXCEPTION 'invalid block';
    END IF;
    blocked_start := (p_date + blocked_slot::time) AT TIME ZONE 'Asia/Jerusalem';
    IF v_span && tstzrange(blocked_start, blocked_start + interval '30 minutes', '[)') THEN
      RAISE EXCEPTION 'blocked';
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_service, v_travel, v_start, v_span;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_slot_clear(
  p_date date,
  p_start timestamptz,
  p_service integer,
  p_travel integer,
  p_span tstzrange
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  previous_end timestamptz;
  previous_travel integer;
  visit record;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.orders
    WHERE status IN ('pending', 'approved')
      AND span && p_span
  ) OR EXISTS (
    SELECT 1
    FROM public.slot_holds
    WHERE expires_at > clock_timestamp()
      AND span && p_span
  ) THEN
    RAISE EXCEPTION 'time already taken';
  END IF;

  previous_end := NULL;
  FOR visit IN
    SELECT starts_at, service_minutes, travel_minutes
    FROM (
      SELECT lower(orders.span) AS starts_at, orders.service_minutes, orders.travel_minutes
      FROM public.orders
      WHERE orders.appointment_date = p_date
        AND orders.status IN ('pending', 'approved')
      UNION ALL
      SELECT lower(slot_holds.span), slot_holds.service_minutes, slot_holds.travel_minutes
      FROM public.slot_holds
      WHERE slot_holds.appointment_date = p_date
        AND slot_holds.expires_at > clock_timestamp()
      UNION ALL
      SELECT p_start, p_service, p_travel
    ) AS visits
    ORDER BY starts_at
  LOOP
    IF previous_end IS NOT NULL
       AND visit.starts_at < previous_end + make_interval(mins => previous_travel) THEN
      RAISE EXCEPTION 'travel gap too small';
    END IF;
    previous_end := visit.starts_at + make_interval(mins => visit.service_minutes);
    previous_travel := visit.travel_minutes;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.hold_slot(
  p_adults integer,
  p_children integer,
  p_beards integer,
  p_date date,
  p_time time
)
RETURNS TABLE (
  hold_id uuid,
  expires_at timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  visit record;
  new_id uuid;
  new_expires timestamptz;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = actor) THEN
    RAISE EXCEPTION 'profile missing';
  END IF;
  IF coalesce(p_adults, 0) + coalesce(p_children, 0) > 5 THEN
    RAISE EXCEPTION 'party too large';
  END IF;

  PERFORM public.lock_service_date(p_date);
  DELETE FROM public.slot_holds WHERE slot_holds.expires_at <= clock_timestamp();
  DELETE FROM public.slot_holds WHERE slot_holds.customer_id = actor;

  SELECT prepared.service_minutes, prepared.travel_minutes, prepared.start_at, prepared.service_span
  INTO visit
  FROM public.prepare_visit(p_adults, p_children, p_beards, p_date, p_time) AS prepared;

  IF visit.service_span IS NULL THEN
    RAISE EXCEPTION 'invalid appointment';
  END IF;
  PERFORM public.assert_slot_clear(p_date, visit.start_at, visit.service_minutes, visit.travel_minutes, visit.service_span);

  INSERT INTO public.slot_holds (
    customer_id,
    appointment_date,
    appointment_time,
    adults,
    children,
    beards,
    service_minutes,
    travel_minutes,
    span,
    expires_at
  ) VALUES (
    actor,
    p_date,
    p_time,
    p_adults,
    p_children,
    p_beards,
    visit.service_minutes,
    visit.travel_minutes,
    visit.service_span,
    clock_timestamp() + interval '10 minutes'
  )
  RETURNING id, slot_holds.expires_at INTO new_id, new_expires;

  hold_id := new_id;
  expires_at := new_expires;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_hold()
RETURNS TABLE (
  hold_id uuid,
  appointment_date date,
  appointment_time time,
  adults integer,
  children integer,
  beards integer,
  expires_at timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  RETURN QUERY
  SELECT
    slot_holds.id,
    slot_holds.appointment_date,
    slot_holds.appointment_time,
    slot_holds.adults,
    slot_holds.children,
    slot_holds.beards,
    slot_holds.expires_at
  FROM public.slot_holds
  WHERE slot_holds.customer_id = actor
    AND slot_holds.expires_at > clock_timestamp();
END;
$$;

CREATE OR REPLACE FUNCTION public.release_my_hold()
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  PERFORM public.lock_schedule();
  DELETE FROM public.slot_holds WHERE slot_holds.customer_id = actor;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_busy_spans(p_from date, p_to date)
RETURNS TABLE (
  appointment_date date,
  starts_at timestamptz,
  service_ends_at timestamptz,
  blocked_until timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to > p_from + 14 THEN
    RAISE EXCEPTION 'invalid range';
  END IF;
  RETURN QUERY
  SELECT
    orders.appointment_date,
    lower(orders.span),
    lower(orders.span) + make_interval(mins => orders.service_minutes),
    lower(orders.span) + make_interval(mins => orders.service_minutes + orders.travel_minutes)
  FROM public.orders
  WHERE orders.status IN ('pending', 'approved')
    AND orders.appointment_date BETWEEN p_from AND p_to
  UNION ALL
  SELECT
    slot_holds.appointment_date,
    lower(slot_holds.span),
    lower(slot_holds.span) + make_interval(mins => slot_holds.service_minutes),
    lower(slot_holds.span) + make_interval(mins => slot_holds.service_minutes + slot_holds.travel_minutes)
  FROM public.slot_holds
  WHERE slot_holds.expires_at > clock_timestamp()
    AND slot_holds.appointment_date BETWEEN p_from AND p_to;
END;
$$;

DROP FUNCTION IF EXISTS public.request_appointment(
  integer, integer, integer, date, time,
  text, text, text, text, text, text, text, text, text, text, text
);

CREATE FUNCTION public.request_appointment(
  p_adults integer,
  p_children integer,
  p_beards integer,
  p_date date,
  p_time time,
  p_full_name text,
  p_phone text,
  p_city text,
  p_street text,
  p_house_number text,
  p_entrance text,
  p_floor text,
  p_apartment text,
  p_entry_code text,
  p_notes text,
  p_payment text,
  p_hold uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  found public.slot_holds%ROWTYPE;
  visit record;
  new_id uuid;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = actor) THEN
    RAISE EXCEPTION 'profile missing';
  END IF;
  IF coalesce(p_adults, 0) + coalesce(p_children, 0) > 5 THEN
    RAISE EXCEPTION 'party too large';
  END IF;
  IF p_adults IS NULL OR p_children IS NULL OR p_beards IS NULL
     OR p_date IS NULL OR p_time IS NULL OR p_payment IS NULL
     OR p_adults < 0 OR p_children < 0 OR p_beards < 0
     OR p_adults > 20 OR p_children > 20
     OR p_adults + p_children < 2
     OR p_beards > p_adults
     OR EXTRACT(SECOND FROM p_time) <> 0
     OR EXTRACT(MINUTE FROM p_time)::integer NOT BETWEEN 0 AND 59
     OR char_length(btrim(coalesce(p_full_name, ''))) NOT BETWEEN 1 AND 80
     OR char_length(btrim(coalesce(p_phone, ''))) NOT BETWEEN 1 AND 20
     OR char_length(btrim(coalesce(p_city, ''))) > 60
     OR char_length(btrim(coalesce(p_street, ''))) > 80
     OR char_length(btrim(coalesce(p_house_number, ''))) > 20
     OR char_length(btrim(coalesce(p_entrance, ''))) > 20
     OR char_length(btrim(coalesce(p_floor, ''))) > 10
     OR char_length(btrim(coalesce(p_apartment, ''))) > 20
     OR char_length(btrim(coalesce(p_entry_code, ''))) > 20
     OR char_length(btrim(coalesce(p_notes, ''))) > 400
     OR p_payment NOT IN ('paybox', 'cash', 'transfer') THEN
    RAISE EXCEPTION 'invalid appointment';
  END IF;
  IF p_hold IS NULL THEN
    RAISE EXCEPTION 'hold expired';
  END IF;

  PERFORM public.lock_service_date(p_date);

  SELECT * INTO found
  FROM public.slot_holds
  WHERE slot_holds.id = p_hold
    AND slot_holds.customer_id = actor
  FOR UPDATE;

  IF found.id IS NULL THEN
    SELECT orders.id INTO new_id
    FROM public.orders
    WHERE orders.source_hold_id = p_hold
      AND orders.customer_id = actor
      AND orders.appointment_date = p_date
      AND orders.appointment_time = p_time
      AND orders.adults = p_adults
      AND orders.children = p_children
      AND orders.beards = p_beards;
    IF new_id IS NOT NULL THEN
      RETURN new_id;
    END IF;
    RAISE EXCEPTION 'hold expired';
  END IF;

  IF found.appointment_date IS DISTINCT FROM p_date
     OR found.appointment_time IS DISTINCT FROM p_time
     OR found.adults IS DISTINCT FROM p_adults
     OR found.children IS DISTINCT FROM p_children
     OR found.beards IS DISTINCT FROM p_beards THEN
    RAISE EXCEPTION 'hold does not match';
  END IF;

  IF NOT (found.expires_at > clock_timestamp()) THEN
    SELECT orders.id INTO new_id
    FROM public.orders
    WHERE orders.source_hold_id = p_hold
      AND orders.customer_id = actor
      AND orders.appointment_date = p_date
      AND orders.appointment_time = p_time
      AND orders.adults = p_adults
      AND orders.children = p_children
      AND orders.beards = p_beards;
    IF new_id IS NOT NULL THEN
      RETURN new_id;
    END IF;
    RAISE EXCEPTION 'hold expired';
  END IF;

  DELETE FROM public.slot_holds
  WHERE slot_holds.expires_at <= clock_timestamp()
    AND slot_holds.id IS DISTINCT FROM found.id;
  DELETE FROM public.slot_holds WHERE slot_holds.id = found.id;

  SELECT prepared.service_minutes, prepared.travel_minutes, prepared.start_at, prepared.service_span
  INTO visit
  FROM public.prepare_visit(p_adults, p_children, p_beards, p_date, p_time) AS prepared;

  IF visit.service_span IS NULL THEN
    RAISE EXCEPTION 'invalid appointment';
  END IF;
  PERFORM public.assert_slot_clear(p_date, visit.start_at, visit.service_minutes, visit.travel_minutes, visit.service_span);

  IF NOT (found.expires_at > clock_timestamp()) THEN
    RAISE EXCEPTION 'hold expired';
  END IF;

  INSERT INTO public.orders (
    customer_id,
    adults,
    children,
    beards,
    appointment_date,
    appointment_time,
    service_minutes,
    travel_minutes,
    span,
    full_name,
    phone,
    city,
    street,
    house_number,
    entrance,
    floor,
    apartment,
    entry_code,
    notes,
    payment,
    source_hold_id
  ) VALUES (
    actor,
    p_adults,
    p_children,
    p_beards,
    p_date,
    p_time,
    visit.service_minutes,
    visit.travel_minutes,
    visit.service_span,
    btrim(p_full_name),
    btrim(p_phone),
    NULLIF(btrim(coalesce(p_city, '')), ''),
    NULLIF(btrim(coalesce(p_street, '')), ''),
    NULLIF(btrim(coalesce(p_house_number, '')), ''),
    NULLIF(btrim(coalesce(p_entrance, '')), ''),
    NULLIF(btrim(coalesce(p_floor, '')), ''),
    NULLIF(btrim(coalesce(p_apartment, '')), ''),
    NULLIF(btrim(coalesce(p_entry_code, '')), ''),
    NULLIF(btrim(coalesce(p_notes, '')), ''),
    p_payment,
    p_hold
  )
  RETURNING id INTO new_id;

  RETURN new_id;
EXCEPTION
  WHEN exclusion_violation THEN
    RAISE EXCEPTION 'time already taken';
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_visit(integer, integer, integer, date, time) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_slot_clear(date, timestamptz, integer, integer, tstzrange) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hold_slot(integer, integer, integer, date, time) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.current_hold() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_my_hold() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_appointment(integer, integer, integer, date, time, text, text, text, text, text, text, text, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.orders_prepare() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_busy_spans(date, date) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.list_busy_spans(date, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hold_slot(integer, integer, integer, date, time) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_hold() TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_my_hold() TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_appointment(integer, integer, integer, date, time, text, text, text, text, text, text, text, text, text, text, text, uuid) TO authenticated;
