-- Saved for a later manual run. This file has not been executed.
-- Run once, after 0012. Do not run 0010 again. That file would restore permanent deletion.
-- Requires profiles and is_admin() from 0002, and the orders columns from 0001.
-- Status and cancelled_by match orders_prepare in 0006. The same branches exist in 0003.
-- This file does not replace those functions and does not send a phone notification.
-- 0001–0012 never grant BYPASSRLS and never set a function owner.
-- The insert policies below are created for the owner of this trigger function,
-- so FORCE ROW LEVEL SECURITY does not depend on an assumed owner privilege.
-- A failed notification insert must not undo the order change. The failure is
-- recorded when that second insert succeeds. If both inserts fail, only a
-- database warning remains. There is no DELETE trigger: 0012 disables permanent delete.

CREATE TABLE public.notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  audience text NOT NULL CHECK (audience IN ('admin', 'customer')),
  recipient_id uuid REFERENCES public.profiles (id) ON DELETE CASCADE,
  order_id uuid,
  appointment_date date,
  appointment_time time,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 180),
  link_path text NOT NULL CHECK (char_length(link_path) BETWEEN 1 AND 160),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'abandoned')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 5),
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  claim_token uuid,
  claimed_at timestamptz,
  last_error text CHECK (last_error IS NULL OR char_length(last_error) <= 300),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  sent_at timestamptz,
  CHECK (
    (audience = 'admin' AND recipient_id IS NULL)
    OR (audience = 'customer' AND recipient_id IS NOT NULL)
  )
);

CREATE INDEX notification_outbox_ready_idx
  ON public.notification_outbox (next_attempt_at)
  WHERE status IN ('pending', 'failed');

CREATE TABLE public.notification_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  order_id uuid,
  audience text CHECK (audience IS NULL OR audience IN ('admin', 'customer')),
  recipient_id uuid,
  title text,
  body text,
  link_path text,
  sqlstate text NOT NULL CHECK (char_length(sqlstate) BETWEEN 1 AND 5),
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 300),
  seen boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX notification_failures_unseen_idx
  ON public.notification_failures (created_at)
  WHERE seen = false;

CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  audience text NOT NULL CHECK (audience IN ('admin', 'customer')),
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL CHECK (char_length(p256dh) BETWEEN 1 AND 300),
  auth_secret text NOT NULL CHECK (char_length(auth_secret) BETWEEN 1 AND 300),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX push_subscriptions_user_idx
  ON public.push_subscriptions (user_id, audience);

ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_outbox FORCE ROW LEVEL SECURITY;
ALTER TABLE public.notification_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_failures FORCE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.notification_outbox FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.notification_failures FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.push_subscriptions FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.notification_outbox TO authenticated;
GRANT SELECT, UPDATE (seen) ON public.notification_failures TO authenticated;
GRANT SELECT, DELETE ON public.push_subscriptions TO authenticated;
GRANT INSERT (user_id, audience, endpoint, p256dh, auth_secret) ON public.push_subscriptions TO authenticated;
GRANT UPDATE (endpoint, p256dh, auth_secret) ON public.push_subscriptions TO authenticated;

CREATE POLICY notification_outbox_customer_read ON public.notification_outbox
  FOR SELECT TO authenticated
  USING (audience = 'customer' AND recipient_id = auth.uid());

CREATE POLICY notification_outbox_admin_read ON public.notification_outbox
  FOR SELECT TO authenticated
  USING (audience = 'admin' AND public.is_admin());

CREATE POLICY notification_failures_admin_read ON public.notification_failures
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY notification_failures_admin_seen ON public.notification_failures
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY push_subscriptions_own_read ON public.push_subscriptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY push_subscriptions_own_insert ON public.push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      audience = 'customer'
      OR (audience = 'admin' AND public.is_admin())
    )
  );

CREATE POLICY push_subscriptions_own_update ON public.push_subscriptions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY push_subscriptions_own_delete ON public.push_subscriptions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.protect_push_subscription_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.audience IS DISTINCT FROM OLD.audience
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'subscription identity cannot change';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_push_subscription_identity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS push_subscriptions_protect_identity ON public.push_subscriptions;
CREATE TRIGGER push_subscriptions_protect_identity
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_push_subscription_identity();

CREATE OR REPLACE FUNCTION public.enqueue_order_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_key text;
  notice_audience text;
  notice_recipient uuid;
  notice_title text;
  notice_body text;
  notice_link text;
  when_text text;
  source_id uuid;
  source_customer uuid;
  source_date date;
  source_time time;
  failure_state text;
  failure_message text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN NULL;
  END IF;

  source_id := NEW.id;
  source_customer := NEW.customer_id;
  source_date := NEW.appointment_date;
  source_time := NEW.appointment_time;

  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NULL;
  END IF;

  when_text := to_char(source_date, 'DD.MM.YYYY') || ' ' || to_char(source_time, 'HH24:MI');

  IF TG_OP = 'INSERT' AND NEW.status = 'pending' AND NEW.cancelled_by IS NULL THEN
    event_key := 'created:' || source_id::text;
    notice_audience := 'admin';
    notice_recipient := NULL;
    notice_title := 'בקשת תור חדשה';
    notice_body := 'בקשת תור חדשה. ' || when_text;
    notice_link := 'admin.html?order=' || source_id::text || '#pending';
  ELSIF TG_OP = 'UPDATE'
    AND OLD.status = 'pending'
    AND NEW.status = 'approved'
    AND NEW.cancelled_by IS NULL THEN
    event_key := 'approved:' || source_id::text;
    notice_audience := 'customer';
    notice_recipient := source_customer;
    notice_title := 'התור אושר';
    notice_body := 'התור אושר. ' || when_text;
    notice_link := 'orders.html?order=' || source_id::text;
  ELSIF TG_OP = 'UPDATE'
    AND OLD.status = 'pending'
    AND NEW.status = 'rejected'
    AND NEW.cancelled_by IS NULL THEN
    event_key := 'rejected:' || source_id::text;
    notice_audience := 'customer';
    notice_recipient := source_customer;
    notice_title := 'הבקשה לא אושרה';
    notice_body := 'הבקשה לא אושרה. ' || when_text;
    notice_link := 'orders.html?order=' || source_id::text;
  ELSIF TG_OP = 'UPDATE'
    AND OLD.status IN ('pending', 'approved')
    AND NEW.status = 'cancelled'
    AND NEW.cancelled_by = 'customer' THEN
    event_key := 'cancel-customer:' || source_id::text;
    notice_audience := 'admin';
    notice_recipient := NULL;
    notice_title := 'תור בוטל';
    notice_body := 'תור בוטל. ' || when_text;
    notice_link := 'admin.html?order=' || source_id::text || '#pending';
  ELSIF TG_OP = 'UPDATE'
    AND OLD.status IN ('pending', 'approved')
    AND NEW.status = 'cancelled'
    AND NEW.cancelled_by = 'admin' THEN
    event_key := 'cancel-admin:' || source_id::text;
    notice_audience := 'customer';
    notice_recipient := source_customer;
    notice_title := 'התור בוטל';
    notice_body := 'התור בוטל. ' || when_text;
    notice_link := 'orders.html?order=' || source_id::text;
  ELSE
    RETURN NULL;
  END IF;

  BEGIN
    INSERT INTO public.notification_outbox (
      event_key,
      audience,
      recipient_id,
      order_id,
      appointment_date,
      appointment_time,
      title,
      body,
      link_path
    )
    VALUES (
      event_key,
      notice_audience,
      notice_recipient,
      source_id,
      source_date,
      source_time,
      notice_title,
      notice_body,
      notice_link
    )
    ON CONFLICT (event_key) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    failure_state := SQLSTATE;
    failure_message := left(SQLERRM, 300);
    BEGIN
      INSERT INTO public.notification_failures (
        event_key,
        order_id,
        audience,
        recipient_id,
        title,
        body,
        link_path,
        sqlstate,
        message
      )
      VALUES (
        event_key,
        source_id,
        notice_audience,
        notice_recipient,
        notice_title,
        notice_body,
        notice_link,
        failure_state,
        failure_message
      )
      ON CONFLICT (event_key) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'notification outbox skipped (%). failure log skipped (% %)',
        failure_state, SQLSTATE, SQLERRM;
    END;
  END;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_order_notification() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS orders_enqueue_notification ON public.orders;
CREATE TRIGGER orders_enqueue_notification
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_order_notification();

DO $$
DECLARE
  writer name;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner)
    INTO writer
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'enqueue_order_notification'
    AND pg_catalog.pg_get_function_identity_arguments(p.oid) = '';

  IF writer IS NULL THEN
    RAISE EXCEPTION 'notification writer is missing';
  END IF;

  EXECUTE format(
    'CREATE POLICY notification_outbox_writer_insert ON public.notification_outbox FOR INSERT TO %I WITH CHECK (true)',
    writer
  );
  EXECUTE format(
    'CREATE POLICY notification_failures_writer_insert ON public.notification_failures FOR INSERT TO %I WITH CHECK (true)',
    writer
  );
END $$;
