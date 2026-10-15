-- Requires 0002 and 0003 to already be applied. Run this by hand. Do not run it twice.
-- This does not change earlier migrations, RLS policies, or approve, reject, and cancel.
-- There is no DELETE policy. Only an admin can execute this function.
-- Deleting an order is permanent. Linked admin_notices rows are removed by the existing
-- ON DELETE CASCADE on admin_notices.order_id. No other table is changed here.

CREATE OR REPLACE FUNCTION public.admin_delete_order(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  service_date date;
  found_id uuid;
  removed integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'invalid appointment';
  END IF;
  
  SELECT orders.appointment_date INTO service_date
  FROM public.orders
  WHERE orders.id = p_id;
  IF service_date IS NULL THEN
    RAISE EXCEPTION 'order not found';
  END IF;
  PERFORM public.lock_service_date(service_date);
  SELECT orders.id INTO found_id
  FROM public.orders
  WHERE orders.id = p_id
  FOR UPDATE;
  IF found_id IS NULL THEN
    RAISE EXCEPTION 'order not found';
  END IF;
  DELETE FROM public.orders
  WHERE orders.id = found_id;
  GET DIAGNOSTICS removed = ROW_COUNT;
  IF removed <> 1 THEN
    RAISE EXCEPTION 'order not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_order(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_order(uuid) TO authenticated;
