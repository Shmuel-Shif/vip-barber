-- Run this only if 0007 was already applied. Do not run it on a database that has not applied 0007.
-- If 0007 has not been applied, run the updated 0007 instead, and do not run this file.
-- This replaces the booking-window functions. It does not change service length, travel, prices, orders, or privileges.
--
-- The live error "argument of AND must be type boolean, not type timestamp with time zone"
-- comes from DECLARE found timestamptz. That name hides the boolean FOUND, so
-- IF FOUND AND found > now_at compares a timestamp with AND.
-- The same shadowing breaks IF NOT FOUND in begin_booking_window and current_booking_window.

CREATE OR REPLACE FUNCTION public.begin_booking_window()
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

CREATE OR REPLACE FUNCTION public.current_booking_window()
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

CREATE OR REPLACE FUNCTION public.restart_booking_window()
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
