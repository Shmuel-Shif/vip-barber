-- Review only. Do not run until the SQL is approved.
-- service_minutes = adult minutes × adults + child minutes × children + beard minutes × beards.
-- travel_minutes is read once from business_settings and stored on the order.
-- It is used only as the single gap before the next visit, never between people in the same order.
-- span = [start, start + service_minutes). This is the haircut only.
-- Travel is one gap before the next visit. It is not added after the last visit.
-- The service itself must end by the day's close.
-- Later, the site calls signInAnonymously() before request_appointment.
-- That creates auth.uid(). The function still has no customer id argument.
-- There is no customer_id argument. The row is tied to auth.uid().
-- The hours check and the insert run in one transaction, locked per date.

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
  IF NEW.adults + NEW.children < 2 OR NEW.beards > NEW.adults THEN
    RAISE EXCEPTION 'invalid party';
  END IF;
  IF TG_OP = 'INSERT' THEN
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
    NEW.cancelled_by := NULL;
    NEW.cancelled_at := NULL;
    NEW.local_order_key := NULL;
  ELSIF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    IF OLD.customer_id IS DISTINCT FROM auth.uid()
      OR OLD.status NOT IN ('pending', 'approved')
      OR NEW.status IS DISTINCT FROM 'cancelled'
      OR lower(OLD.span) - now() <= interval '7 hours' THEN
      RAISE EXCEPTION 'customer cannot change this order';
    END IF;
    NEW.customer_id := OLD.customer_id;
    NEW.adults := OLD.adults;
    NEW.children := OLD.children;
    NEW.beards := OLD.beards;
    NEW.appointment_date := OLD.appointment_date;
    NEW.appointment_time := OLD.appointment_time;
    NEW.service_minutes := OLD.service_minutes;
    NEW.travel_minutes := OLD.travel_minutes;
    NEW.span := OLD.span;
    NEW.full_name := OLD.full_name;
    NEW.phone := OLD.phone;
    NEW.city := OLD.city;
    NEW.street := OLD.street;
    NEW.house_number := OLD.house_number;
    NEW.entrance := OLD.entrance;
    NEW.floor := OLD.floor;
    NEW.apartment := OLD.apartment;
    NEW.entry_code := OLD.entry_code;
    NEW.notes := OLD.notes;
    NEW.payment := OLD.payment;
    NEW.photo_path := OLD.photo_path;
    NEW.local_order_key := OLD.local_order_key;
    NEW.created_at := OLD.created_at;
    NEW.cancelled_by := 'customer';
    NEW.cancelled_at := now();
  ELSIF public.is_admin() THEN
    NEW.customer_id := OLD.customer_id;
    NEW.adults := OLD.adults;
    NEW.children := OLD.children;
    NEW.beards := OLD.beards;
    NEW.appointment_date := OLD.appointment_date;
    NEW.appointment_time := OLD.appointment_time;
    NEW.service_minutes := OLD.service_minutes;
    NEW.travel_minutes := OLD.travel_minutes;
    NEW.span := OLD.span;
    NEW.local_order_key := OLD.local_order_key;
    NEW.created_at := OLD.created_at;
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
  PERFORM pg_advisory_xact_lock(hashtext(p_date::text));
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
  IF p_adults < 0 OR p_children < 0 OR p_beards < 0
    OR p_adults + p_children < 2
    OR p_beards > p_adults
    OR char_length(btrim(coalesce(p_full_name, ''))) = 0
    OR char_length(btrim(coalesce(p_phone, ''))) = 0
    OR p_payment NOT IN ('paybox', 'cash', 'transfer') THEN
    RAISE EXCEPTION 'invalid appointment';
  END IF;

  open_until := CASE
    WHEN EXTRACT(DOW FROM today_local)::integer = 6 THEN today_local + 7
    ELSE today_local + (6 - EXTRACT(DOW FROM today_local)::integer)
  END;
  IF p_date < today_local OR p_date > open_until THEN
    RAISE EXCEPTION 'outside the open booking week';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_date::text));

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
    SELECT status, start_time, end_time, breaks, '{}'::text[], 3
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

  IF start_at <= now() OR start_at < day_start OR service_end > day_end THEN
    RAISE EXCEPTION 'outside open hours';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(day.breaks, '[]'::jsonb))
  LOOP
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
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH active AS (
    SELECT
      orders.appointment_date,
      lower(orders.span) AS starts_at,
      lower(orders.span) + make_interval(mins => orders.service_minutes) AS service_ends_at,
      orders.travel_minutes,
      lead(lower(orders.span)) OVER (
        PARTITION BY orders.appointment_date
        ORDER BY lower(orders.span)
      ) AS next_start
    FROM public.orders
    WHERE orders.status IN ('pending', 'approved')
      AND p_to >= p_from
      AND p_to <= p_from + 14
      AND orders.appointment_date BETWEEN p_from AND p_to
  )
  SELECT
    appointment_date,
    starts_at,
    service_ends_at,
    CASE
      WHEN next_start IS NULL THEN service_ends_at
      ELSE service_ends_at + make_interval(mins => travel_minutes)
    END
  FROM active;
$$;

CREATE OR REPLACE FUNCTION public.approve_order(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  found public.orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  SELECT * INTO found FROM public.orders WHERE id = p_id FOR UPDATE;
  IF found.id IS NULL OR found.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'request is not pending';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(found.appointment_date::text));
  UPDATE public.orders
  SET status = 'approved'
  WHERE id = found.id
    AND status = 'pending';
EXCEPTION
  WHEN exclusion_violation THEN
    RAISE EXCEPTION 'time already taken';
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

REVOKE ALL ON FUNCTION public.visit_duration(integer, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.orders_prepare() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_day_gaps(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_travel_gaps() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_appointment(integer, integer, integer, date, time, text, text, text, text, text, text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_busy_spans(date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_order(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.schedule_conflicts() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.request_appointment(integer, integer, integer, date, time, text, text, text, text, text, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_busy_spans(date, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_conflicts() TO authenticated;
