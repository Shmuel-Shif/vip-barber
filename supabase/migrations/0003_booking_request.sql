-- Review only. Do not run until the SQL is approved.
-- service_minutes = adult minutes × adults + child minutes × children + beard minutes × beards.
-- travel_minutes is read once from business_settings and stored on the order.
-- It is the single gap before the next visit, never between people in the same order.
-- span = [start, start + service_minutes). That is the haircut end shown to the customer.
-- blocked_until = service end + that one travel gap. The next visit cannot start earlier.
-- Travel after the last visit may pass closing time. The haircut may end after closing too.
-- The start itself must be inside open hours and earlier than closing.
-- There is no customer_id, status, service_minutes, travel_minutes, or span argument.
-- Every order write takes lock_service_date before the row changes.

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
  mens integer;
  kids integer;
  beard integer;
  total integer;
BEGIN
  IF p_adults IS NULL OR p_children IS NULL OR p_beards IS NULL
     OR p_adults < 0 OR p_children < 0 OR p_beards < 0
     OR p_adults > 20 OR p_children > 20
     OR p_beards > p_adults
     OR p_adults + p_children < 2 THEN
    RAISE EXCEPTION 'invalid party';
  END IF;
  SELECT minutes INTO mens FROM public.services WHERE id = 'mens-haircut' AND active;
  SELECT minutes INTO kids FROM public.services WHERE id = 'kids-haircut' AND active;
  SELECT minutes INTO beard FROM public.services WHERE id = 'beard' AND active;
  IF mens IS NULL OR kids IS NULL OR beard IS NULL THEN
    RAISE EXCEPTION 'service durations are not configured';
  END IF;
  total := (mens * p_adults) + (kids * p_children) + (beard * p_beards);
  IF total < 10 OR total > 600 THEN
    RAISE EXCEPTION 'visit duration is out of range';
  END IF;
  RETURN total;
END;
$$;

CREATE OR REPLACE FUNCTION public.lock_schedule()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('vip-barber-schedule')::bigint);
END;
$$;

CREATE OR REPLACE FUNCTION public.lock_service_date(p_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_date IS NULL THEN
    RAISE EXCEPTION 'invalid appointment';
  END IF;
  PERFORM public.lock_schedule();
  PERFORM pg_advisory_xact_lock(hashtext(p_date::text)::bigint);
END;
$$;

CREATE OR REPLACE FUNCTION public.lock_service_dates(p_first date, p_second date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_first IS NULL THEN
    RAISE EXCEPTION 'invalid appointment';
  END IF;
  IF p_second IS NULL OR p_second = p_first THEN
    PERFORM public.lock_service_date(p_first);
    RETURN;
  END IF;
  IF p_first < p_second THEN
    PERFORM public.lock_service_date(p_first);
    PERFORM public.lock_service_date(p_second);
  ELSE
    PERFORM public.lock_service_date(p_second);
    PERFORM public.lock_service_date(p_first);
  END IF;
END;
$$;

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
    IF EXTRACT(SECOND FROM NEW.appointment_time) <> 0
       OR EXTRACT(MINUTE FROM NEW.appointment_time)::integer NOT IN (0, 30) THEN
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

DROP TRIGGER IF EXISTS orders_prepare_row ON public.orders;
CREATE TRIGGER orders_prepare_row
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.orders_prepare();

CREATE OR REPLACE FUNCTION public.assert_day_gaps(p_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  previous_end timestamptz;
  previous_travel integer;
  visit record;
BEGIN
  PERFORM public.lock_service_date(p_date);
  previous_end := NULL;
  FOR visit IN
    SELECT lower(span) AS starts_at, service_minutes, travel_minutes
    FROM public.orders
    WHERE appointment_date = p_date
      AND status IN ('pending', 'approved')
    ORDER BY lower(span), id
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

CREATE OR REPLACE FUNCTION public.enforce_travel_gaps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_day_gaps(NEW.appointment_date);
  IF TG_OP = 'UPDATE' AND OLD.appointment_date IS DISTINCT FROM NEW.appointment_date THEN
    PERFORM public.assert_day_gaps(OLD.appointment_date);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS orders_travel_gap ON public.orders;
CREATE CONSTRAINT TRIGGER orders_travel_gap
  AFTER INSERT OR UPDATE ON public.orders
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_travel_gaps();

CREATE OR REPLACE FUNCTION public.validate_schedule_day()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item jsonb;
  slot text;
  break_start time;
  break_end time;
  slot_time time;
  seen text[] := '{}';
BEGIN
  PERFORM public.lock_schedule();
  IF NEW.breaks IS NULL OR jsonb_typeof(NEW.breaks) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid break';
  END IF;
  IF jsonb_array_length(NEW.breaks) > 12 THEN
    RAISE EXCEPTION 'invalid break';
  END IF;
  IF NEW.blocked IS NULL OR COALESCE(array_length(NEW.blocked, 1), 0) > 48 THEN
    RAISE EXCEPTION 'invalid block';
  END IF;
  IF NEW.status = 'hours'
     AND (NEW.start_time IS NULL OR NEW.end_time IS NULL OR NEW.end_time <= NEW.start_time) THEN
    RAISE EXCEPTION 'invalid hours';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(NEW.breaks)
  LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object'
       OR NULLIF(item->>'start', '') IS NULL
       OR NULLIF(item->>'end', '') IS NULL THEN
      RAISE EXCEPTION 'invalid break';
    END IF;
    BEGIN
      break_start := (item->>'start')::time;
      break_end := (item->>'end')::time;
    EXCEPTION
      WHEN others THEN
        RAISE EXCEPTION 'invalid break';
    END;
    IF break_end <= break_start THEN
      RAISE EXCEPTION 'invalid break';
    END IF;
    IF NEW.start_time IS NOT NULL AND NEW.end_time IS NOT NULL
       AND (break_start < NEW.start_time OR break_end > NEW.end_time) THEN
      RAISE EXCEPTION 'invalid break';
    END IF;
  END LOOP;

  FOREACH slot IN ARRAY NEW.blocked
  LOOP
    IF slot IS NULL OR slot !~ '^([01][0-9]|2[0-3]):(00|30)$' OR slot = ANY (seen) THEN
      RAISE EXCEPTION 'invalid block';
    END IF;
    seen := seen || slot;
    slot_time := slot::time;
    IF NEW.start_time IS NOT NULL AND NEW.end_time IS NOT NULL
       AND (
         slot_time < NEW.start_time
         OR (slot_time + interval '30 minutes')::time <= slot_time
         OR (slot_time + interval '30 minutes')::time > NEW.end_time
       ) THEN
      RAISE EXCEPTION 'invalid block';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS weekly_hours_validate ON public.weekly_hours;
CREATE TRIGGER weekly_hours_validate
  BEFORE INSERT OR UPDATE ON public.weekly_hours
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_schedule_day();

DROP TRIGGER IF EXISTS week_overrides_validate ON public.week_overrides;
CREATE TRIGGER week_overrides_validate
  BEFORE INSERT OR UPDATE ON public.week_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_schedule_day();

DROP TRIGGER IF EXISTS date_exceptions_validate ON public.date_exceptions;
CREATE TRIGGER date_exceptions_validate
  BEFORE INSERT OR UPDATE ON public.date_exceptions
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_schedule_day();

CREATE OR REPLACE FUNCTION public.request_appointment(
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
  p_payment text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  day record;
  today_local date := (now() AT TIME ZONE 'Asia/Jerusalem')::date;
  open_until date;
  service_minutes integer;
  travel_minutes integer;
  start_at timestamptz;
  service_end timestamptz;
  day_start timestamptz;
  day_end timestamptz;
  service_span tstzrange;
  item jsonb;
  blocked_slot text;
  blocked_start timestamptz;
  new_id uuid;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = actor) THEN
    RAISE EXCEPTION 'profile missing';
  END IF;
  IF p_adults IS NULL OR p_children IS NULL OR p_beards IS NULL
     OR p_date IS NULL OR p_time IS NULL OR p_payment IS NULL
     OR p_adults < 0 OR p_children < 0 OR p_beards < 0
     OR p_adults > 20 OR p_children > 20
     OR p_adults + p_children < 2
     OR p_beards > p_adults
     OR EXTRACT(SECOND FROM p_time) <> 0
     OR EXTRACT(MINUTE FROM p_time)::integer NOT IN (0, 30)
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

  open_until := today_local + (6 - EXTRACT(DOW FROM today_local)::integer) + 7;
  IF p_date < today_local OR p_date > open_until THEN
    RAISE EXCEPTION 'outside the open booking week';
  END IF;

  PERFORM public.lock_service_date(p_date);

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

  service_minutes := public.visit_duration(p_adults, p_children, p_beards);
  SELECT settings.travel_minutes INTO travel_minutes
  FROM public.business_settings AS settings
  WHERE settings.id = true;
  IF travel_minutes IS NULL THEN
    RAISE EXCEPTION 'travel time is not configured';
  END IF;
  start_at := (p_date + p_time) AT TIME ZONE 'Asia/Jerusalem';
  service_end := start_at + make_interval(mins => service_minutes);
  day_start := (p_date + day.start_time) AT TIME ZONE 'Asia/Jerusalem';
  day_end := (p_date + day.end_time) AT TIME ZONE 'Asia/Jerusalem';
  service_span := tstzrange(start_at, service_end, '[)');

  IF start_at <= now() OR start_at < day_start OR start_at >= day_end THEN
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
    IF service_span && tstzrange(
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
    IF service_span && tstzrange(blocked_start, blocked_start + interval '30 minutes', '[)') THEN
      RAISE EXCEPTION 'blocked';
    END IF;
  END LOOP;

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
    payment
  ) VALUES (
    actor,
    p_adults,
    p_children,
    p_beards,
    p_date,
    p_time,
    service_minutes,
    travel_minutes,
    service_span,
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
    p_payment
  )
  RETURNING id INTO new_id;

  RETURN new_id;
EXCEPTION
  WHEN exclusion_violation THEN
    RAISE EXCEPTION 'time already taken';
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
STABLE
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
    AND orders.appointment_date BETWEEN p_from AND p_to;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_order(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  service_date date;
  found public.orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'invalid appointment';
  END IF;
  SELECT appointment_date INTO service_date FROM public.orders WHERE id = p_id;
  IF service_date IS NULL THEN
    RAISE EXCEPTION 'request is not pending';
  END IF;
  PERFORM public.lock_service_date(service_date);
  SELECT * INTO found FROM public.orders WHERE id = p_id FOR UPDATE;
  IF found.id IS NULL OR found.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'request is not pending';
  END IF;
  UPDATE public.orders
  SET status = 'approved'
  WHERE id = found.id
    AND status = 'pending';
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_order(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  service_date date;
  found public.orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'invalid appointment';
  END IF;
  SELECT appointment_date INTO service_date FROM public.orders WHERE id = p_id;
  IF service_date IS NULL THEN
    RAISE EXCEPTION 'request is not pending';
  END IF;
  PERFORM public.lock_service_date(service_date);
  SELECT * INTO found FROM public.orders WHERE id = p_id FOR UPDATE;
  IF found.id IS NULL OR found.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'request is not pending';
  END IF;
  UPDATE public.orders
  SET status = 'rejected',
      cancelled_by = NULL,
      cancelled_at = NULL
  WHERE id = found.id
    AND status = 'pending';
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_order(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  service_date date;
  found public.orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'invalid appointment';
  END IF;
  SELECT appointment_date INTO service_date
  FROM public.orders
  WHERE id = p_id
    AND customer_id = auth.uid();
  IF service_date IS NULL THEN
    RAISE EXCEPTION 'order not found';
  END IF;
  PERFORM public.lock_service_date(service_date);
  SELECT * INTO found FROM public.orders WHERE id = p_id FOR UPDATE;
  IF found.customer_id IS DISTINCT FROM auth.uid()
     OR found.status NOT IN ('pending', 'approved')
     OR lower(found.span) - now() <= interval '7 hours' THEN
    RAISE EXCEPTION 'customer cannot change this order';
  END IF;
  UPDATE public.orders
  SET status = 'cancelled',
      cancelled_by = 'customer',
      cancelled_at = now()
  WHERE id = found.id
    AND customer_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cancel_order(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  service_date date;
  found public.orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'invalid appointment';
  END IF;
  SELECT appointment_date INTO service_date FROM public.orders WHERE id = p_id;
  IF service_date IS NULL THEN
    RAISE EXCEPTION 'order not found';
  END IF;
  PERFORM public.lock_service_date(service_date);
  SELECT * INTO found FROM public.orders WHERE id = p_id FOR UPDATE;
  IF found.id IS NULL OR found.status NOT IN ('pending', 'approved') THEN
    RAISE EXCEPTION 'order cannot be cancelled';
  END IF;
  UPDATE public.orders
  SET status = 'cancelled',
      cancelled_by = 'admin',
      cancelled_at = now()
  WHERE id = found.id
    AND status IN ('pending', 'approved');
END;
$$;

CREATE OR REPLACE FUNCTION public.schedule_conflicts()
RETURNS TABLE (
  order_id uuid,
  appointment_date date,
  appointment_time time,
  reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  RETURN QUERY
  SELECT earlier.id, earlier.appointment_date, earlier.appointment_time,
         'current travel no longer fits before the next visit'::text
  FROM public.orders AS earlier
  JOIN public.orders AS later
    ON later.appointment_date = earlier.appointment_date
   AND later.status IN ('pending', 'approved')
   AND lower(later.span) > lower(earlier.span)
   AND lower(later.span) < lower(earlier.span) + make_interval(mins => earlier.service_minutes + (
     SELECT travel_minutes FROM public.business_settings WHERE id
   ))
  WHERE earlier.status IN ('pending', 'approved')
    AND NOT EXISTS (
      SELECT 1
      FROM public.orders AS between_visit
      WHERE between_visit.appointment_date = earlier.appointment_date
        AND between_visit.status IN ('pending', 'approved')
        AND lower(between_visit.span) > lower(earlier.span)
        AND lower(between_visit.span) < lower(later.span)
    );

  RETURN QUERY
  SELECT orders.id, orders.appointment_date, orders.appointment_time,
         'service ends after the current closing time'::text
  FROM public.orders AS orders
  JOIN LATERAL (
    SELECT status, end_time
    FROM (
      SELECT status, end_time, 1 AS rank
      FROM public.date_exceptions
      WHERE service_date = orders.appointment_date
      UNION ALL
      SELECT status, end_time, 2
      FROM public.week_overrides
      WHERE week_start = (orders.appointment_date - EXTRACT(DOW FROM orders.appointment_date)::integer)
        AND weekday = EXTRACT(DOW FROM orders.appointment_date)::integer
      UNION ALL
      SELECT status, end_time, 3
      FROM public.weekly_hours
      WHERE weekday = EXTRACT(DOW FROM orders.appointment_date)::integer
    ) AS choices
    ORDER BY rank
    LIMIT 1
  ) AS day ON true
  WHERE orders.status IN ('pending', 'approved')
    AND (
      day.status IS DISTINCT FROM 'hours'
      OR day.end_time IS NULL
      OR (orders.appointment_date + orders.appointment_time)
         + make_interval(mins => orders.service_minutes)
         > (orders.appointment_date + day.end_time)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.visit_duration(integer, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lock_schedule() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lock_service_date(date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lock_service_dates(date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.orders_prepare() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_day_gaps(date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_travel_gaps() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_schedule_day() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_appointment(integer, integer, integer, date, time, text, text, text, text, text, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_busy_spans(date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approve_order(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_order(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_order(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_cancel_order(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.schedule_conflicts() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.request_appointment(integer, integer, integer, date, time, text, text, text, text, text, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_busy_spans(date, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cancel_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_conflicts() TO authenticated;
