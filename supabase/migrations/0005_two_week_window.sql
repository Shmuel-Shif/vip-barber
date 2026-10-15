-- Run this if 0003 is already applied. It does not change grants or orders.
-- The open window is the rest of this week plus the next week.
-- A start must be inside open hours and earlier than closing. The haircut may end later.
-- Travel is not part of that check. Overlap and the travel gap stay as they are.

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
