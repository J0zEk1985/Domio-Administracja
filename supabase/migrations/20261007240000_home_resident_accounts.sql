-- Home resident accounts: password timestamp, activation completion, and
-- a block on residents changing their own account type.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS home_password_set_at timestamptz;

COMMENT ON COLUMN public.profiles.home_password_set_at IS
  'When a home resident finished setting their own password. Null until the activation link is completed.';

COMMENT ON COLUMN public.profiles.account_type IS
  'hub/standard = full account, simplified = service or cleaning worker, home = DOMIO Home resident.';

CREATE OR REPLACE FUNCTION public.auth_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT u.id
  FROM auth.users u
  WHERE lower(btrim(u.email)) = lower(btrim(COALESCE(p_email, '')))
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.auth_user_id_by_email(text) IS
  'Service-only lookup of auth.users.id by e-mail. Used when activating a Home resident.';

REVOKE ALL ON FUNCTION public.auth_user_id_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_user_id_by_email(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_id_by_email(text) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_home_password()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_type text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT lower(btrim(COALESCE(p.account_type, '')))
    INTO v_type
  FROM public.profiles p
  WHERE p.id = v_uid;

  IF v_type IS DISTINCT FROM 'home' THEN
    RETURN;
  END IF;

  PERFORM set_config('app.home_password_set', 'on', true);

  UPDATE public.profiles
  SET home_password_set_at = COALESCE(home_password_set_at, now()),
      updated_at = now()
  WHERE id = v_uid;
END;
$$;

COMMENT ON FUNCTION public.complete_home_password() IS
  'Marks a home resident password as chosen by the signed-in user. No-op for other account types.';

REVOKE ALL ON FUNCTION public.complete_home_password() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_home_password() FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_home_password() TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_profiles_guard_role_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.platform_role IS DISTINCT FROM OLD.platform_role THEN
    IF NOT public.is_platform_admin() THEN
      RAISE EXCEPTION 'Brak uprawnień do zmiany roli platformy'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.account_type IS DISTINCT FROM OLD.account_type THEN
    IF v_actor = OLD.id AND NOT public.is_platform_admin() THEN
      RAISE EXCEPTION 'Brak uprawnień do zmiany typu konta'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.home_password_set_at IS DISTINCT FROM OLD.home_password_set_at THEN
    IF current_setting('app.home_password_set', true) IS DISTINCT FROM 'on'
       AND NOT public.is_platform_admin() THEN
      RAISE EXCEPTION 'Brak uprawnień do zmiany statusu hasła'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.fleet_role IS DISTINCT FROM OLD.fleet_role THEN
    IF current_setting('app.granting_fleet_admin', true) = 'on'
       AND NEW.fleet_role IS NOT DISTINCT FROM 'admin'::public.fleet_role THEN
      RETURN NEW;
    END IF;

    IF NOT (
      public.is_platform_admin()
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = v_actor AND p.fleet_role = 'admin'
      )
    ) THEN
      RAISE EXCEPTION 'Brak uprawnień do zmiany roli we flocie'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

NOTIFY pgrst, 'reload schema';

COMMIT;
