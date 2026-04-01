-- =============================================================================
-- Phase 1: Global company directory + subscriber-scoped contracts & policies
-- =============================================================================
-- Deploy: Supabase Dashboard → SQL Editor → Run
-- Depends: public.cleaning_locations, public.location_access
--
-- Breaking vs earlier draft: companies are global (no org_id); tax_id UNIQUE;
-- property_contract_type uses 'administration' (not 'admin'); RLS enabled.
-- If you already applied an older version of this migration, use a follow-up
-- ALTER migration instead of re-running this file.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Enums
-- -----------------------------------------------------------------------------
CREATE TYPE public.company_category AS ENUM (
  'contractor',
  'insurer',
  'utility',
  'other'
);

CREATE TYPE public.property_contract_type AS ENUM (
  'cleaning',
  'maintenance',
  'administration',
  'elevator',
  'other'
);

-- -----------------------------------------------------------------------------
-- 2. Tables — global companies (single row per NIP system-wide)
-- -----------------------------------------------------------------------------
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  tax_id text NOT NULL CHECK (length(trim(tax_id)) > 0),
  category public.company_category NOT NULL,
  email text,
  phone text,
  address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT companies_tax_id_unique UNIQUE (tax_id)
);

COMMENT ON TABLE public.companies IS
  'Global directory: one row per tax_id (NIP); shared across tenants; no org_id.';

COMMENT ON COLUMN public.companies.tax_id IS
  'Polish NIP or equivalent; globally unique.';

-- One contract row per building (location).
CREATE TABLE public.property_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.cleaning_locations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  type public.property_contract_type NOT NULL,
  contract_number text NOT NULL CHECK (length(trim(contract_number)) > 0),
  net_value numeric(12, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'PLN' CHECK (length(trim(currency)) > 0),
  start_date date NOT NULL,
  end_date date,
  notice_period_months integer CHECK (
    notice_period_months IS NULL
    OR notice_period_months >= 0
  ),
  document_url text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT property_contracts_one_per_location UNIQUE (location_id),
  CONSTRAINT property_contracts_end_after_start CHECK (
    end_date IS NULL
    OR end_date >= start_date
  )
);

CREATE INDEX idx_property_contracts_company_id ON public.property_contracts (company_id);

COMMENT ON TABLE public.property_contracts IS
  'At most one contract per location; company references global companies.';

COMMENT ON COLUMN public.property_contracts.document_url IS
  'Scanned contract / Storage URL; empty until uploaded.';

CREATE TABLE public.property_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.cleaning_locations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  policy_number text NOT NULL CHECK (length(trim(policy_number)) > 0),
  coverage_amount numeric(14, 2) NOT NULL,
  premium_amount numeric(12, 2) NOT NULL DEFAULT 0,
  start_date date NOT NULL,
  end_date date NOT NULL,
  document_url text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT property_policies_end_after_start CHECK (end_date >= start_date)
);

CREATE INDEX idx_property_policies_location_id ON public.property_policies (location_id);

CREATE INDEX idx_property_policies_company_id ON public.property_policies (company_id);

COMMENT ON COLUMN public.property_policies.document_url IS
  'Policy PDF / Storage URL; empty until uploaded.';

-- -----------------------------------------------------------------------------
-- 3. Auto-maintain updated_at
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_updated_at_companies
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_contracts
  BEFORE UPDATE ON public.property_contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_policies
  BEFORE UPDATE ON public.property_policies
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- -----------------------------------------------------------------------------
-- 4. UPSERT by NIP (for clients / n8n; runs with definer to apply ON CONFLICT)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_company_by_tax_id(
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
  INSERT INTO public.companies (name, tax_id, category, email, phone, address)
  VALUES (
    trim(p_name),
    trim(p_tax_id),
    p_category,
    p_email,
    p_phone,
    p_address
  )
  ON CONFLICT (tax_id) DO UPDATE SET
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

COMMENT ON FUNCTION public.upsert_company_by_tax_id IS
  'Insert or update global company by tax_id (NIP); intended for authenticated upsert flows and automation (e.g. n8n).';

-- -----------------------------------------------------------------------------
-- 5. Location access helper (contracts & policies RLS — location_access only)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_has_location_access_docs(p_location_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.location_access la
    WHERE la.location_id = p_location_id
      AND la.user_id = auth.uid()
      AND (la.expires_at IS NULL OR la.expires_at > now())
  );
$$;

COMMENT ON FUNCTION public.user_has_location_access_docs(uuid) IS
  'True if current user has a non-expired location_access row for the building.';

-- -----------------------------------------------------------------------------
-- 6. Row Level Security
-- -----------------------------------------------------------------------------
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_policies ENABLE ROW LEVEL SECURITY;

-- Global directory: all authenticated users can read; insert/update for upsert flows.
CREATE POLICY companies_select_authenticated
  ON public.companies
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY companies_insert_authenticated
  ON public.companies
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY companies_update_authenticated
  ON public.companies
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- No DELETE policy for authenticated — deletes reserved for service role / migrations.

CREATE POLICY property_contracts_all_location_access
  ON public.property_contracts
  FOR ALL
  TO authenticated
  USING (public.user_has_location_access_docs(location_id))
  WITH CHECK (public.user_has_location_access_docs(location_id));

CREATE POLICY property_policies_all_location_access
  ON public.property_policies
  FOR ALL
  TO authenticated
  USING (public.user_has_location_access_docs(location_id))
  WITH CHECK (public.user_has_location_access_docs(location_id));

-- -----------------------------------------------------------------------------
-- 7. Grants
-- -----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON public.companies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_contracts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_policies TO authenticated;

GRANT EXECUTE ON FUNCTION public.upsert_company_by_tax_id(
  text, text, public.company_category, text, text, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_location_access_docs(uuid) TO authenticated;

GRANT USAGE ON TYPE public.company_category TO authenticated;
GRANT USAGE ON TYPE public.property_contract_type TO authenticated;
