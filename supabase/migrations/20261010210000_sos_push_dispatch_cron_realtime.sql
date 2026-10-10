-- SOS follow-up: deliver the outbox through the existing push microservice,
-- expire stale alerts, and publish the live tables to Realtime.
-- No service-role key is stored in the database.

BEGIN;

CREATE OR REPLACE FUNCTION private.dispatch_sos_push_job(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_job public.sos_push_jobs%ROWTYPE;
  v_alert public.sos_alerts%ROWTYPE;
  v_users uuid[];
  v_title text;
  v_body text;
  v_category text;
  v_result jsonb;
BEGIN
  SELECT *
  INTO v_job
  FROM public.sos_push_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND OR v_job.status = 'sent' OR v_job.attempts >= 5 THEN
    RETURN;
  END IF;

  SELECT *
  INTO v_alert
  FROM public.sos_alerts
  WHERE id = v_job.alert_id;

  IF NOT FOUND THEN
    UPDATE public.sos_push_jobs
    SET
      status = 'failed',
      attempts = attempts + 1,
      last_error = 'missing alert'
    WHERE id = p_job_id;
    RETURN;
  END IF;

  SELECT array_agg(p.user_id)
  INTO v_users
  FROM public.sos_alert_participants p
  WHERE p.alert_id = v_alert.id
    AND p.role = 'neighbor';

  v_category := CASE v_alert.category
    WHEN 'burglary' THEN 'Włamanie'
    WHEN 'medical' THEN 'Pomoc medyczna'
    WHEN 'fire' THEN 'Pożar'
    ELSE 'Inne'
  END;

  IF v_job.kind = 'cancelled' THEN
    v_title := 'Alarm SOS odwołany';
    v_body := 'Fałszywy alarm — ' || v_alert.building_address;
  ELSIF v_job.kind = 'resolved' AND v_alert.close_reason = 'expired' THEN
    v_title := 'Alarm SOS zakończony';
    v_body := 'Alarm wygasł — ' || v_alert.building_address;
  ELSIF v_job.kind = 'resolved' THEN
    v_title := 'Alarm SOS zakończony';
    v_body := 'Alarm zakończony — ' || v_alert.building_address;
  ELSE
    v_title := 'SOS na osiedlu';
    v_body := v_category || ': ' || v_alert.caller_display_name || ', ' || v_alert.building_address;
    IF v_alert.note IS NOT NULL THEN
      v_body := v_body || ' — ' || left(v_alert.note, 80);
    END IF;
  END IF;

  IF COALESCE(array_length(v_users, 1), 0) = 0 THEN
    UPDATE public.sos_push_jobs
    SET
      status = 'sent',
      attempts = attempts + 1,
      last_error = NULL
    WHERE id = p_job_id;
    RETURN;
  END IF;

  BEGIN
    v_result := public.send_push_via_microservice(
      v_users,
      v_title,
      left(v_body, 180),
      'sos_' || v_job.kind,
      '/dashboard?sos=' || v_alert.id::text
    );
  EXCEPTION
    WHEN OTHERS THEN
      UPDATE public.sos_push_jobs
      SET
        status = 'failed',
        attempts = attempts + 1,
        last_error = left(SQLERRM, 500)
      WHERE id = p_job_id;
      RETURN;
  END;

  IF COALESCE(v_result->>'success', 'false') = 'true' THEN
    UPDATE public.sos_push_jobs
    SET
      status = 'sent',
      attempts = attempts + 1,
      last_error = NULL
    WHERE id = p_job_id;
  ELSE
    UPDATE public.sos_push_jobs
    SET
      status = 'failed',
      attempts = attempts + 1,
      last_error = left(COALESCE(v_result->>'error', v_result::text), 500)
    WHERE id = p_job_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION private.dispatch_sos_push_job(uuid) IS
  'Sends one SOS outbox row through send_push_via_microservice. Neighbors only, never the caller.';

CREATE OR REPLACE FUNCTION private.tg_sos_dispatch_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM private.dispatch_sos_push_job(NEW.id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sos_dispatch_push ON public.sos_push_jobs;
CREATE CONSTRAINT TRIGGER trg_sos_dispatch_push
  AFTER INSERT ON public.sos_push_jobs
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION private.tg_sos_dispatch_push();

CREATE OR REPLACE FUNCTION public.dispatch_pending_sos_push()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_count integer := 0;
BEGIN
  FOR v_id IN
    SELECT j.id
    FROM public.sos_push_jobs j
    WHERE j.status IN ('pending', 'failed')
      AND j.attempts < 5
    ORDER BY j.created_at
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM private.dispatch_sos_push_job(v_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.dispatch_pending_sos_push() IS
  'Retries SOS push jobs that are still pending or failed. Safe to run from pg_cron.';

REVOKE ALL ON FUNCTION public.dispatch_pending_sos_push() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_pending_sos_push() TO service_role;

REVOKE ALL ON FUNCTION private.dispatch_sos_push_job(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.tg_sos_dispatch_push() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'sos_alerts',
    'sos_alert_participants',
    'sos_rooms',
    'sos_messages',
    'sos_memberships'
  ]
  LOOP
    BEGIN
      EXECUTE format(
        'ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',
        v_table
      );
    EXCEPTION
      WHEN duplicate_object THEN
        NULL;
    END;
  END LOOP;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('sos-expire-and-push');
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.schedule(
    'sos-expire-and-push',
    '* * * * *',
    'SELECT public.expire_sos_alerts(); SELECT public.dispatch_pending_sos_push();'
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron schedule skipped: %', SQLERRM;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
