-- Review only. Do not run until the SQL is approved.
-- Paste this whole file once in the Supabase SQL editor after 0017.
-- Entrance photos for new orders. Old orders keep photo_path NULL.
--
-- Flow: the customer uploads the photo into the private bucket entrance-photos at
-- <customer id>/<hold id>/entrance-<32 hex>.jpg, then calls stage_order_photo for
-- the hold. When request_appointment inserts the order from that hold, the trigger
-- orders_take_photo_row copies the staged path into orders.photo_path.
-- orders_prepare still refuses any later change to photo_path, so a stored path
-- cannot be rewritten. request_appointment, holds, prices and notifications are
-- not changed.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('entrance-photos', 'entrance-photos', false, 2097152, ARRAY['image/jpeg'])
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS public.order_photo_stage (
  hold_id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  path text NOT NULL CHECK (char_length(path) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.order_photo_stage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_photo_stage FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_photo_stage FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.stage_order_photo(p_hold uuid, p_path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF p_hold IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.slot_holds
    WHERE slot_holds.id = p_hold
      AND slot_holds.customer_id = actor
      AND slot_holds.expires_at > clock_timestamp()
  ) THEN
    RAISE EXCEPTION 'hold expired';
  END IF;

  DELETE FROM public.order_photo_stage
  WHERE order_photo_stage.customer_id = actor
    AND order_photo_stage.created_at < now() - interval '1 day';

  IF p_path IS NULL THEN
    DELETE FROM public.order_photo_stage WHERE order_photo_stage.hold_id = p_hold;
    RETURN;
  END IF;
  IF p_path !~ ('^' || actor::text || '/' || p_hold::text || '/entrance-[0-9a-f]{32}\.jpg$') THEN
    RAISE EXCEPTION 'invalid photo';
  END IF;

  INSERT INTO public.order_photo_stage (hold_id, customer_id, path)
  VALUES (p_hold, actor, p_path)
  ON CONFLICT (hold_id) DO UPDATE
  SET path = EXCLUDED.path,
      created_at = now()
  WHERE order_photo_stage.customer_id = actor;
END;
$$;

-- Runs after orders_prepare_row (alphabetical order), so customer_id is already
-- auth.uid() and source_hold_id is the hold the order was made from.
CREATE OR REPLACE FUNCTION public.orders_take_photo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  staged text;
BEGIN
  NEW.photo_path := NULL;
  IF NEW.source_hold_id IS NULL THEN
    RETURN NEW;
  END IF;
  DELETE FROM public.order_photo_stage
  WHERE order_photo_stage.hold_id = NEW.source_hold_id
    AND order_photo_stage.customer_id = NEW.customer_id
  RETURNING order_photo_stage.path INTO staged;
  IF staged ~ ('^' || NEW.customer_id::text || '/' || NEW.source_hold_id::text || '/entrance-[0-9a-f]{32}\.jpg$') THEN
    NEW.photo_path := staged;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_take_photo_row ON public.orders;
CREATE TRIGGER orders_take_photo_row
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.orders_take_photo();

REVOKE ALL ON FUNCTION public.orders_take_photo() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stage_order_photo(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage_order_photo(uuid, text) TO authenticated;

-- FORCE ROW LEVEL SECURITY also binds the owners of the two functions above.
DO $$
DECLARE
  writer name;
BEGIN
  FOR writer IN
    SELECT DISTINCT pg_catalog.pg_get_userbyid(p.proowner)
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('stage_order_photo', 'orders_take_photo')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS order_photo_stage_writer_all ON public.order_photo_stage');
    EXECUTE format(
      'CREATE POLICY order_photo_stage_writer_all ON public.order_photo_stage FOR ALL TO %I USING (true) WITH CHECK (true)',
      writer
    );
  END LOOP;
END $$;

-- Customers may only add files to their own folder. Nobody but the admin can read
-- them; there is no update or delete for customers, so a staged file cannot be
-- swapped after the order is made.
DROP POLICY IF EXISTS entrance_photos_insert_own ON storage.objects;
CREATE POLICY entrance_photos_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'entrance-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND name ~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}/entrance-[0-9a-f]{32}\.jpg$')
  );

DROP POLICY IF EXISTS entrance_photos_admin_read ON storage.objects;
CREATE POLICY entrance_photos_admin_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'entrance-photos' AND public.is_admin());
