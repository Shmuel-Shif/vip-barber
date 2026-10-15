-- Draft only. Do not run until it is explicitly approved.
-- Requires 0002 and 0003. If 0010 was applied, this replaces admin_delete_order.
-- Do not run 0010 after this file. That file would restore permanent deletion.
-- Hiding does not update orders, so status, span, and the customer row stay unchanged.
-- Busy time still comes from pending and approved orders. This file does not
-- change list_busy_spans, assert_slot_clear, or orders_no_overlap.

CREATE TABLE public.admin_hidden_orders (
  order_id uuid PRIMARY KEY REFERENCES public.orders (id) ON DELETE CASCADE,
  hidden_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  hidden_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL
);

ALTER TABLE public.admin_hidden_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_hidden_orders FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.admin_hidden_orders FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_hide_order(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  service_date date;
  found_id uuid;
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

  INSERT INTO public.admin_hidden_orders (order_id, hidden_by)
  VALUES (found_id, auth.uid())
  ON CONFLICT (order_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_unhide_order(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  service_date date;
  found_id uuid;
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

  DELETE FROM public.admin_hidden_orders
  WHERE order_id = found_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_hidden_order_ids()
RETURNS SETOF uuid
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
  SELECT admin_hidden_orders.order_id
  FROM public.admin_hidden_orders
  ORDER BY admin_hidden_orders.hidden_at DESC, admin_hidden_orders.order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_order(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'invalid appointment';
  END IF;
  RAISE EXCEPTION 'order delete disabled';
END;
$$;

REVOKE ALL ON FUNCTION public.admin_hide_order(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_unhide_order(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_hidden_order_ids() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_delete_order(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_hide_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unhide_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_hidden_order_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_order(uuid) TO authenticated;
