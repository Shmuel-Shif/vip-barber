-- Saved for a later manual run. This file has not been executed.
-- Run once, after 0013. Do not run 0010 again.
-- This file does not change tables or functions from 0001–0013.
-- claim_notification_outbox releases a sending row that is older than two minutes,
-- then claims up to 20 ready rows with FOR UPDATE SKIP LOCKED.
-- The caller check is inside the function. EXECUTE is granted only to service_role.

CREATE OR REPLACE FUNCTION public.claim_notification_outbox()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  released_count integer;
  claimed_rows jsonb;
BEGIN
  IF pg_catalog.coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role only';
  END IF;

  UPDATE public.notification_outbox
  SET status = CASE WHEN attempts >= 5 THEN 'abandoned' ELSE 'failed' END,
      claim_token = NULL,
      next_attempt_at = CASE
        WHEN attempts >= 5 THEN next_attempt_at
        ELSE pg_catalog.clock_timestamp()
      END,
      last_error = pg_catalog.left(
        pg_catalog.coalesce(last_error, 'sending timed out before completion'),
        300
      )
  WHERE status = 'sending'
    AND claimed_at IS NOT NULL
    AND claimed_at < pg_catalog.clock_timestamp() - interval '2 minutes';

  GET DIAGNOSTICS released_count = ROW_COUNT;

  WITH updated AS (
    UPDATE public.notification_outbox AS outbox
    SET status = 'sending',
        claim_token = pg_catalog.gen_random_uuid(),
        claimed_at = pg_catalog.clock_timestamp(),
        attempts = outbox.attempts + 1
    WHERE outbox.id IN (
      SELECT candidate.id
      FROM public.notification_outbox AS candidate
      WHERE candidate.status IN ('pending', 'failed')
        AND candidate.next_attempt_at <= pg_catalog.clock_timestamp()
        AND candidate.attempts < 5
      ORDER BY candidate.next_attempt_at, candidate.created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 20
    )
    RETURNING
      outbox.id,
      outbox.audience,
      outbox.recipient_id,
      outbox.title,
      outbox.body,
      outbox.link_path,
      outbox.attempts,
      outbox.claim_token,
      outbox.next_attempt_at,
      outbox.created_at
  )
  SELECT pg_catalog.coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', updated.id,
        'audience', updated.audience,
        'recipient_id', updated.recipient_id,
        'title', updated.title,
        'body', updated.body,
        'link_path', updated.link_path,
        'attempts', updated.attempts,
        'claim_token', updated.claim_token
      )
      ORDER BY updated.next_attempt_at, updated.created_at
    ),
    '[]'::jsonb
  )
  INTO claimed_rows
  FROM updated;

  RETURN pg_catalog.jsonb_build_object(
    'released', released_count,
    'claimed', claimed_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_notification_outbox() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_outbox() TO service_role;

GRANT SELECT, UPDATE ON public.notification_outbox TO service_role;
GRANT SELECT, DELETE ON public.push_subscriptions TO service_role;

CREATE POLICY notification_outbox_service_read ON public.notification_outbox
  FOR SELECT TO service_role
  USING (true);

CREATE POLICY notification_outbox_service_update ON public.notification_outbox
  FOR UPDATE TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY push_subscriptions_service_read ON public.push_subscriptions
  FOR SELECT TO service_role
  USING (true);

CREATE POLICY push_subscriptions_service_delete ON public.push_subscriptions
  FOR DELETE TO service_role
  USING (true);

DO $$
DECLARE
  claim_owner name;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner)
    INTO claim_owner
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'claim_notification_outbox'
    AND pg_catalog.pg_get_function_identity_arguments(p.oid) = '';

  IF claim_owner IS NULL THEN
    RAISE EXCEPTION 'push claim owner is missing';
  END IF;

  EXECUTE format(
    'CREATE POLICY notification_outbox_claim_read ON public.notification_outbox FOR SELECT TO %I USING (true)',
    claim_owner
  );
  EXECUTE format(
    'CREATE POLICY notification_outbox_claim_update ON public.notification_outbox FOR UPDATE TO %I USING (true) WITH CHECK (true)',
    claim_owner
  );
END $$;
