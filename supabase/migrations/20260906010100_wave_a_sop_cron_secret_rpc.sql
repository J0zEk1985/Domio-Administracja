-- Wave A: service_role-only reader for the SOP cron shared secret stored in Vault.
-- The secret value itself is created operationally (vault.create_secret) and is not in git.

CREATE OR REPLACE FUNCTION public.get_sop_cron_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'vault', 'public'
AS $function$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'sop_cron_secret'
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.get_sop_cron_secret() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_sop_cron_secret() FROM anon;
REVOKE ALL ON FUNCTION public.get_sop_cron_secret() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_sop_cron_secret() TO service_role;
