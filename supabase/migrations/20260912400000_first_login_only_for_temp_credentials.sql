-- First-login password/PIN change is only for temporary credentials
-- (simplified workers, fleet drivers created by admin). Hub/standard
-- owners already choose a password at signup, but profiles.is_first_login
-- defaulted to true, so self-registered owners were trapped on /change-password.

ALTER TABLE public.profiles
  ALTER COLUMN is_first_login SET DEFAULT false;

UPDATE public.profiles
SET is_first_login = false
WHERE is_first_login IS TRUE
  AND lower(COALESCE(account_type, '')) <> 'simplified'
  AND COALESCE(fleet_role::text, '') <> 'driver';

-- Owner JWT metadata must not keep a leftover worker role from older
-- create-worker / link flows (user-editable raw_user_meta_data).
UPDATE auth.users u
SET raw_user_meta_data = COALESCE(u.raw_user_meta_data, '{}'::jsonb)
  - 'role' - 'org_id' - 'tenant_id'
FROM public.profiles p
WHERE p.id = u.id
  AND lower(COALESCE(p.account_type, '')) IN ('hub', 'standard')
  AND u.raw_user_meta_data ? 'role'
  AND lower(COALESCE(u.raw_user_meta_data->>'role', '')) IN ('cleaner', 'technik', 'staff');

CREATE OR REPLACE FUNCTION public.link_user_to_org(
  target_user_id uuid,
  target_org_id uuid,
  target_role text,
  target_full_name text,
  target_email text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF target_role IS NULL OR btrim(target_role) = '' THEN
    RAISE EXCEPTION 'invalid_role' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND m.org_id = target_org_id
      AND COALESCE(m.is_active, true) = true
      AND lower(COALESCE(m.role, '')) IN ('owner', 'admin', 'coordinator', 'manager')
  ) THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  IF lower(btrim(target_role)) IN ('owner', 'admin', 'administrator', 'wlasciciel') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id = auth.uid()
        AND m.org_id = target_org_id
        AND COALESCE(m.is_active, true) = true
        AND lower(COALESCE(m.role, '')) IN ('owner', 'admin')
    ) THEN
      RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = target_user_id) THEN
    RAISE EXCEPTION 'unknown_user' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.profiles (
    id, full_name, email, updated_at, accepted_terms_at, account_type, is_first_login
  )
  VALUES (
    target_user_id, target_full_name, target_email, now(), now(), 'hub', false
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = COALESCE(NULLIF(public.profiles.full_name, ''), EXCLUDED.full_name),
      account_type = 'hub';

  IF NOT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE user_id = target_user_id AND org_id = target_org_id
  ) THEN
    INSERT INTO public.memberships (user_id, org_id, role)
    VALUES (target_user_id, target_org_id, target_role);
  END IF;

  INSERT INTO public.cleaning_staff (id, org_id, full_name, contact_email, status, employment_type)
  VALUES (target_user_id, target_org_id, target_full_name, target_email, 'active', 'b2b')
  ON CONFLICT (id) DO UPDATE
  SET org_id = EXCLUDED.org_id,
      contact_email = EXCLUDED.contact_email,
      full_name = COALESCE(NULLIF(public.cleaning_staff.full_name, ''), EXCLUDED.full_name);
END;
$fn$;
