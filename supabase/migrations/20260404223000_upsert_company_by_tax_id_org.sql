-- =============================================================================
-- Tenant-scoped upsert for companies: conflict target (tax_id, org_id).
-- Replaces global upsert_company_by_tax_id (tax_id only).
-- =============================================================================

DROP FUNCTION IF EXISTS public.upsert_company_by_tax_id(
  text,
  text,
  public.company_category,
  text,
  text,
  text
);

CREATE OR REPLACE FUNCTION public.upsert_company_by_tax_id(
  p_org_id uuid,
  p_name text,
  p_tax_id text,
  p_category public.company_category,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_address text DEFAULT NULL
)
RETURNS public.companies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

COMMENT ON FUNCTION public.upsert_company_by_tax_id(
  uuid,
  text,
  text,
  public.company_category,
  text,
  text,
  text
) IS
  'Insert or update company by (tax_id, org_id) within a tenant; SECURITY DEFINER with membership check.';

GRANT EXECUTE ON FUNCTION public.upsert_company_by_tax_id(
  uuid,
  text,
  text,
  public.company_category,
  text,
  text,
  text
) TO authenticated;
