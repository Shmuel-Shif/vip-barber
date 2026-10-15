-- Requires 0001 through 0006 to already be applied. This file does not rewrite existing orders.
-- If this file was already applied, do not run it again. Run 0008 instead.
--
-- Service length is one shared value, business_settings.service_minutes.
-- It is not multiplied by adults, children, or beards. Travel stays one gap after the visit.
-- Prices stay on public.services and are not changed here.
--
-- begin_booking_window returns an open window unchanged.
-- If the window is missing or already expired, it starts a new 10 minutes and drops that customer's holds.
-- Refreshing or choosing a time must not call it again. The client reads current_booking_window instead.
-- hold_slot stores that same expires_at on the slot hold. The client does not send an expiry.
-- server_now is returned from the same statement so the countdown does not follow the device clock.
-- restart_booking_window stays for an already-applied database, but the client no longer calls it.

ALTER TABLE public.business_settings
  ADD COLUMN service_minutes integer;

UPDATE public.business_settings
SET service_minutes = LEAST(180, GREATEST(10, COALESCE(
  (SELECT services.minutes FROM public.services WHERE services.id = 'mens-haircut'),
  30
)))
WHERE service_minutes IS NULL;

ALTER TABLE public.business_settings
  ALTER COLUMN service_minutes SET NOT NULL;

ALTER TABLE public.business_settings
  ADD CONSTRAINT business_settings_service_minutes_check
  CHECK (service_minutes >= 10 AND service_minutes <= 180);

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
  total integer;
BEGIN
  IF p_adults IS NULL OR p_children IS NULL OR p_beards IS NULL
     OR p_adults < 0 OR p_children < 0 OR p_beards < 0
     OR p_adults > 20 OR p_children > 20
     OR p_beards > p_adults
     OR p_adults + p_children < 2 THEN
    RAISE EXCEPTION 'invalid party';
  END IF;
  SELECT settings.service_minutes INTO total
  FROM public.business_settings AS settings
  WHERE settings.id = true;
  IF total IS NULL OR total < 10 OR total > 180 THEN
    RAISE EXCEPTION 'service durations are not configured';
  END IF;
  RETURN total;
END;
$$;

CREATE TABLE public.booking_windows (
  customer_id uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.booking_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_windows FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_windows FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.begin_booking_window()
RETURNS TABLE (
  expires_at timestamptz,
  server_now timestamptz,
  is_expired boolean
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  window_expires timestamptz;
  now_at timestamptz;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = actor) THEN
    RAISE EXCEPTION 'profile missing';
  END IF;
  PERFORM public.lock_schedule();
  now_at := clock_timestamp();
  SELECT booking_windows.expires_at INTO window_expires
  FROM public.booking_windows
  WHERE booking_windows.customer_id = actor
  FOR UPDATE;
  IF FOUND AND window_expires > now_at THEN
    expires_at := window_expires;
    server_now := now_at;
    is_expired := false;
    RETURN NEXT;
    RETURN;
  END IF;
  DELETE FROM public.slot_holds WHERE slot_holds.customer_id = actor;
  DELETE FROM public.booking_windows WHERE booking_windows.customer_id = actor;
  window_expires := now_at + interval '10 minutes';
  INSERT INTO public.booking_windows (customer_id, expires_at, created_at)
  VALUES (actor, window_expires, now_at);
  expires_at := window_expires;
  server_now := now_at;
  is_expired := false;
  RETURN NEXT;
END;
$$;

CREATE FUNCTION public.current_booking_window()
RETURNS TABLE (
  expires_at timestamptz,
  server_now timestamptz,
  is_expired boolean
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  window_expires timestamptz;
  now_at timestamptz;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  now_at := clock_timestamp();
  SELECT booking_windows.expires_at INTO window_expires
  FROM public.booking_windows
  WHERE booking_windows.customer_id = actor;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  expires_at := window_expires;
  server_now := now_at;
  is_expired := NOT (window_expires > now_at);
  RETURN NEXT;
END;
$$;

CREATE FUNCTION public.restart_booking_window()
RETURNS TABLE (
  expires_at timestamptz,
  server_now timestamptz,
  is_expired boolean
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  window_expires timestamptz;
  now_at timestamptz;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = actor) THEN
    RAISE EXCEPTION 'profile missing';
  END IF;
  PERFORM public.lock_schedule();
  now_at := clock_timestamp();
  SELECT booking_windows.expires_at INTO window_expires
  FROM public.booking_windows
  WHERE booking_windows.customer_id = actor
  FOR UPDATE;
  IF FOUND AND window_expires > now_at THEN
    RAISE EXCEPTION 'booking window is still open';
  END IF;
  DELETE FROM public.slot_holds WHERE slot_holds.customer_id = actor;
  DELETE FROM public.booking_windows WHERE booking_windows.customer_id = actor;
  window_expires := now_at + interval '10 minutes';
  INSERT INTO public.booking_windows (customer_id, expires_at, created_at)
  VALUES (actor, window_expires, now_at);
  expires_at := window_expires;
  server_now := now_at;
  is_expired := false;
  RETURN NEXT;
END;
$$;

CREATE FUNCTION public.clear_booking_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.booking_windows WHERE customer_id = NEW.customer_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_clear_booking_window
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_booking_window();

DROP FUNCTION IF EXISTS public.hold_slot(integer, integer, integer, date, time);

CREATE FUNCTION public.hold_slot(
  p_adults integer,
  p_children integer,
  p_beards integer,
  p_date date,
  p_time time
)
RETURNS TABLE (
  hold_id uuid,
  expires_at timestamptz,
  server_now timestamptz
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
  window_expires timestamptz;
  now_at timestamptz;
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
  now_at := clock_timestamp();
  SELECT booking_windows.expires_at INTO window_expires
  FROM public.booking_windows
  WHERE booking_windows.customer_id = actor
  FOR UPDATE;
  IF window_expires IS NULL OR NOT (window_expires > now_at) THEN
    RAISE EXCEPTION 'hold expired';
  END IF;

  DELETE FROM public.slot_holds WHERE slot_holds.expires_at <= now_at;
  DELETE FROM public.slot_holds WHERE slot_holds.customer_id = actor;

  SELECT prepared.service_minutes, prepared.travel_minutes, prepared.start_at, prepared.service_span
  INTO visit
  FROM public.prepare_visit(p_adults, p_children, p_beards, p_date, p_time) AS prepared;

  IF visit.service_span IS NULL THEN
    RAISE EXCEPTION 'invalid appointment';
  END IF;
  PERFORM public.assert_slot_clear(p_date, visit.start_at, visit.service_minutes, visit.travel_minutes, visit.service_span);
  IF NOT (window_expires > clock_timestamp()) THEN
    RAISE EXCEPTION 'hold expired';
  END IF;

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
    window_expires
  )
  RETURNING id INTO new_id;

  hold_id := new_id;
  expires_at := window_expires;
  server_now := clock_timestamp();
  RETURN NEXT;
END;
$$;

DROP FUNCTION IF EXISTS public.current_hold();

CREATE FUNCTION public.current_hold()
RETURNS TABLE (
  hold_id uuid,
  appointment_date date,
  appointment_time time,
  adults integer,
  children integer,
  beards integer,
  expires_at timestamptz,
  server_now timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  now_at timestamptz;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  now_at := clock_timestamp();
  RETURN QUERY
  SELECT
    slot_holds.id,
    slot_holds.appointment_date,
    slot_holds.appointment_time,
    slot_holds.adults,
    slot_holds.children,
    slot_holds.beards,
    slot_holds.expires_at,
    now_at
  FROM public.slot_holds
  WHERE slot_holds.customer_id = actor
    AND slot_holds.expires_at > now_at;
END;
$$;

REVOKE ALL ON FUNCTION public.visit_duration(integer, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.begin_booking_window() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.current_booking_window() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restart_booking_window() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.clear_booking_window() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hold_slot(integer, integer, integer, date, time) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.current_hold() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.begin_booking_window() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_booking_window() TO authenticated;
GRANT EXECUTE ON FUNCTION public.restart_booking_window() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hold_slot(integer, integer, integer, date, time) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_hold() TO authenticated;
