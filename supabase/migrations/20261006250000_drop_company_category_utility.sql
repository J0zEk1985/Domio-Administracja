-- Remove company_category value `utility` ("Usługa komunalna").
-- Existing rows become contractors so vendor_partners / 24h / email routing stay intact.
-- Insurers remain excluded from vendor_partners.

BEGIN;

UPDATE public.companies
SET category = 'contractor'::public.company_category
WHERE category = 'utility'::public.company_category;

UPDATE public.vendor_partners
SET service_type = 'Wykonawca'
WHERE service_type = 'Usługa komunalna';

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

  IF v_company.category = 'contractor'::public.company_category THEN
    v_service := 'Wykonawca';

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

COMMENT ON COLUMN public.vendor_partners.company_id IS
  'Source company row. Set for contractors synced from companies. Insurers are not linked.';

ALTER TYPE public.company_category RENAME TO company_category_old;

CREATE TYPE public.company_category AS ENUM (
  'contractor',
  'insurer',
  'other'
);

ALTER TYPE public.company_category OWNER TO postgres;
GRANT ALL ON TYPE public.company_category TO authenticated;
GRANT USAGE ON TYPE public.company_category TO anon, service_role;

DROP TRIGGER IF EXISTS companies_sync_vendor_partner ON public.companies;

ALTER TABLE public.companies
  ALTER COLUMN category TYPE public.company_category
  USING category::text::public.company_category;

DROP FUNCTION IF EXISTS public.upsert_company_by_tax_id(uuid, text, text, public.company_category_old, text, text, text);

CREATE FUNCTION public.upsert_company_by_tax_id(
  p_org_id uuid,
  p_name text,
  p_tax_id text,
  p_category public.company_category,
  p_email text DEFAULT NULL::text,
  p_phone text DEFAULT NULL::text,
  p_address text DEFAULT NULL::text
)
RETURNS public.companies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.companies;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id is required';
  END IF;

  -- Authenticated users: must be active member of the target org (n8n / service role without uid skips).
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.memberships m
      WHERE m.org_id = p_org_id
        AND m.user_id = auth.uid()
        AND coalesce(m.is_active, true) = true
    ) THEN
      RAISE EXCEPTION 'forbidden: not a member of this organization'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.companies (name, tax_id, category, email, phone, address, org_id)
  VALUES (
    trim(p_name),
    trim(p_tax_id),
    p_category,
    p_email,
    p_phone,
    p_address,
    p_org_id
  )
  ON CONFLICT ON CONSTRAINT companies_tax_id_org_id_key DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    email = COALESCE(EXCLUDED.email, companies.email),
    phone = COALESCE(EXCLUDED.phone, companies.phone),
    address = COALESCE(EXCLUDED.address, companies.address),
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

ALTER FUNCTION public.upsert_company_by_tax_id(uuid, text, text, public.company_category, text, text, text) OWNER TO postgres;

COMMENT ON FUNCTION public.upsert_company_by_tax_id(uuid, text, text, public.company_category, text, text, text) IS
  'Insert or update company by (tax_id, org_id) within a tenant; SECURITY DEFINER with membership check.';

GRANT EXECUTE ON FUNCTION public.upsert_company_by_tax_id(uuid, text, text, public.company_category, text, text, text)
  TO anon, authenticated, service_role;

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

  IF v_company.category = 'contractor'::public.company_category THEN
    v_service := 'Wykonawca';

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

DROP TRIGGER IF EXISTS companies_sync_vendor_partner ON public.companies;

CREATE TRIGGER companies_sync_vendor_partner
  AFTER INSERT OR UPDATE OF name, email, phone, category, org_id
  ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION private.trg_sync_vendor_partner_from_company();

DROP TYPE public.company_category_old;

COMMIT;
