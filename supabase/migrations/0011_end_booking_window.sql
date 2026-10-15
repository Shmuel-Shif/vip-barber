-- Requires 0007 to already be applied. Run this by hand. Do not run it twice.
-- Leaving the people page or the date page backwards ends the open 10-minute window.
-- It does not start a new window. The next visit begins a fresh 10 minutes.
-- This does not change approve, reject, cancel, or delete.

CREATE OR REPLACE FUNCTION public.end_booking_window()
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
  DELETE FROM public.booking_windows WHERE booking_windows.customer_id = actor;
END;
$$;

REVOKE ALL ON FUNCTION public.end_booking_window() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.end_booking_window() TO authenticated;
