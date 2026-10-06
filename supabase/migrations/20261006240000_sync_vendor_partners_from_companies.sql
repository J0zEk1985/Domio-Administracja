-- Link operational companies to vendor_partners so routing and 24h pickers
-- see the same contractors as Umowy i Firmy.
-- Insurers stay in the company catalog only.

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;
GRANT USAGE ON SCHEMA private TO postgres, service_role;

ALTER TABLE public.vendor_partners
  ADD COLUMN IF NOT EXISTS company_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'vendor_partners_company_id_fkey'
      AND conrelid = 'public.vendor_partners'::regclass
  ) THEN
    ALTER TABLE public.vendor_partners
      ADD CONSTRAINT vendor_partners_company_id_fkey
      FOREIGN KEY (company_id)
      REFERENCES public.companies (id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS vendor_partners_org_company_uidx
  ON public.vendor_partners (org_id, company_id)
  WHERE company_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS vendor_partners_company_id_uidx
  ON public.vendor_partners (company_id)
  WHERE company_id IS NOT NULL;

COMMENT ON COLUMN public.vendor_partners.company_id IS
  'Source company row. Set for contractors and utilities synced from companies. Insurers are not linked.';

CREATE OR REPLACE FUNCTION private.sync_vendor_partner_from_company(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company public.companies%ROWTYPE;
  v_service text;
  v_existing_id uuid;
BEGIN
  SELECT * INTO v_company
  FROM public.companies
  WHERE id = p_company_id;

  IF NOT FOUND OR v_company.org_id IS NULL THEN
    RETURN;
  END IF;

  IF v_company.category IN ('contractor'::public.company_category, 'utility'::public.company_category) THEN
    v_service := CASE v_company.category
      WHEN 'utility'::public.company_category THEN 'Usługa komunalna'
      ELSE 'Wykonawca'
    END;

    SELECT vp.id INTO v_existing_id
    FROM public.vendor_partners vp
    WHERE vp.company_id = v_company.id
    LIMIT 1;

    IF v_existing_id IS NULL THEN
      INSERT INTO public.vendor_partners (
        org_id,
        company_id,
        name,
        service_type,
        contact_email,
        contact_phone,
        status
      )
      VALUES (
        v_company.org_id,
        v_company.id,
        v_company.name,
        v_service,
        v_company.email,
        v_company.phone,
        'active'
      );
    ELSE
      UPDATE public.vendor_partners
      SET
        org_id = v_company.org_id,
        name = v_company.name,
        service_type = v_service,
        contact_email = v_company.email,
        contact_phone = v_company.phone,
        status = 'active'
      WHERE id = v_existing_id
        AND org_id IS NOT DISTINCT FROM v_company.org_id;
    END IF;

    RETURN;
  END IF;

  UPDATE public.vendor_partners
  SET status = 'inactive'
  WHERE company_id = v_company.id
    AND org_id = v_company.org_id
    AND status IS DISTINCT FROM 'inactive';
END;
$$;

REVOKE ALL ON FUNCTION private.sync_vendor_partner_from_company(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.sync_vendor_partner_from_company(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.sync_vendor_partner_from_company(uuid) TO postgres, service_role;

CREATE OR REPLACE FUNCTION private.trg_sync_vendor_partner_from_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM private.sync_vendor_partner_from_company(NEW.id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.trg_sync_vendor_partner_from_company() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.trg_sync_vendor_partner_from_company() FROM anon;
GRANT EXECUTE ON FUNCTION private.trg_sync_vendor_partner_from_company() TO postgres, service_role, authenticated;

DROP TRIGGER IF EXISTS companies_sync_vendor_partner ON public.companies;

CREATE TRIGGER companies_sync_vendor_partner
  AFTER INSERT OR UPDATE OF name, email, phone, category, org_id
  ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION private.trg_sync_vendor_partner_from_company();

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.id
    FROM public.companies c
    WHERE c.org_id IS NOT NULL
      AND c.category IN ('contractor'::public.company_category, 'utility'::public.company_category)
  LOOP
    PERFORM private.sync_vendor_partner_from_company(r.id);
  END LOOP;
END $$;

COMMIT;
