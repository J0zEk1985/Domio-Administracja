-- Default PUBLIC EXECUTE on SECURITY DEFINER helpers still leaked to anon.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.proname NOT LIKE 'st_%'
      AND p.proname NOT IN (
        'lookup_location_by_public_qr_token',
        'insert_public_qr_issue',
        'get_published_eboard_messages',
        'get_sop_cron_secret',
        'get_ckob_api_key'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC', r.proname, r.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon', r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated', r.proname, r.args);
  END LOOP;
END
$$;

REVOKE EXECUTE ON FUNCTION public.get_sop_cron_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_sop_cron_secret() TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_ckob_api_key(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_ckob_api_key(uuid) TO service_role;
