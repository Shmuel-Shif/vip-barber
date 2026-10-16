-- Draft only. Do not run until it is explicitly approved.
-- Requires 0002, 0003 and 0006. Does not update orders, so orders_prepare,
-- the order status rules and enqueue_order_notification never see these marks.
-- The admin marks a past approved visit as completed or no_show. Nothing is
-- marked automatically. Customer statistics count completed visits only.

CREATE TABLE IF NOT EXISTS public.visit_outcomes (
  order_id uuid PRIMARY KEY REFERENCES public.orders (id) ON DELETE CASCADE,
  outcome text NOT NULL CHECK (outcome IN ('completed', 'no_show')),
  marked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  marked_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL
);

ALTER TABLE public.visit_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visit_outcomes FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.visit_outcomes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.visit_outcomes TO authenticated;

DROP POLICY IF EXISTS visit_outcomes_read ON public.visit_outcomes;
CREATE POLICY visit_outcomes_read ON public.visit_outcomes
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = visit_outcomes.order_id
        AND orders.customer_id = auth.uid()
    )
  );

-- p_outcome NULL clears the mark.
CREATE OR REPLACE FUNCTION public.set_visit_outcome(p_id uuid, p_outcome text)
RETURNS text
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
  IF p_id IS NULL OR (p_outcome IS NOT NULL AND p_outcome NOT IN ('completed', 'no_show')) THEN
    RAISE EXCEPTION 'invalid outcome';
  END IF;

  SELECT * INTO found FROM public.orders WHERE orders.id = p_id;
  IF found.id IS NULL THEN
    RAISE EXCEPTION 'order not found';
  END IF;
  IF found.status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'visit not approved';
  END IF;
  IF lower(found.span) > now() THEN
    RAISE EXCEPTION 'visit not started';
  END IF;

  IF p_outcome IS NULL THEN
    DELETE FROM public.visit_outcomes WHERE order_id = found.id;
    RETURN NULL;
  END IF;

  INSERT INTO public.visit_outcomes (order_id, outcome, marked_by)
  VALUES (found.id, p_outcome, auth.uid())
  ON CONFLICT (order_id) DO UPDATE
    SET outcome = EXCLUDED.outcome,
        marked_at = clock_timestamp(),
        marked_by = EXCLUDED.marked_by;
  RETURN p_outcome;
END;
$$;

-- Runs with the caller's rights, so RLS limits it to the caller's own orders.
CREATE OR REPLACE FUNCTION public.my_visit_stats()
RETURNS TABLE (
  visits integer,
  mens_haircuts integer,
  kids_haircuts integer,
  beards integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    count(*)::integer,
    coalesce(sum(orders.adults), 0)::integer,
    coalesce(sum(orders.children), 0)::integer,
    coalesce(sum(orders.beards), 0)::integer
  FROM public.orders
  JOIN public.visit_outcomes ON visit_outcomes.order_id = orders.id
  WHERE orders.customer_id = auth.uid()
    AND orders.status = 'approved'
    AND visit_outcomes.outcome = 'completed';
$$;

REVOKE ALL ON FUNCTION public.set_visit_outcome(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.my_visit_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_visit_outcome(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_visit_stats() TO authenticated;

-- FORCE ROW LEVEL SECURITY also binds the owner of set_visit_outcome, so it gets
-- its own write policies, the same way 0013 handles the notification writer.
DO $$
DECLARE
  writer name;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner)
    INTO writer
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'set_visit_outcome'
    AND pg_catalog.pg_get_function_identity_arguments(p.oid) = 'p_id uuid, p_outcome text';

  IF writer IS NULL THEN
    RAISE EXCEPTION 'visit outcome writer is missing';
  END IF;

  EXECUTE format('DROP POLICY IF EXISTS visit_outcomes_writer_all ON public.visit_outcomes');
  EXECUTE format(
    'CREATE POLICY visit_outcomes_writer_all ON public.visit_outcomes FOR ALL TO %I USING (true) WITH CHECK (true)',
    writer
  );
END $$;
