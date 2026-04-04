-- =============================================================================
-- Tenant isolation: companies scoped by org_id (no global NIP uniqueness).
-- After deploy: run `supabase gen types typescript` and commit updated types.
--
-- BACKFILL: `org_id` stays NULL until legacy rows are assigned manually.
--          Until then, RLS hides those rows from authenticated clients.
--          Plan a separate SQL backfill UPDATE ... FROM memberships/locations
--          when ready; do not block deployment on backfill.
-- =============================================================================

-- 1) Remove global uniqueness on tax_id (NIP per tenant, not globally).
ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_tax_id_unique;

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS tax_id_key;

-- 2) Org scope (nullable only until manual backfill completes).
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations (id) ON DELETE CASCADE;

COMMENT ON COLUMN public.companies.org_id IS
  'Tenant scope. NULL allowed temporarily; backfill org_id manually, then optionally SET NOT NULL.';

-- 3) Uniqueness of NIP within one organization.
ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_tax_id_org_id_key;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_tax_id_org_id_key UNIQUE (tax_id, org_id);

-- 4) Replace previous companies RLS with a single membership-based policy.
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS companies_select_authenticated ON public.companies;
DROP POLICY IF EXISTS companies_insert_authenticated ON public.companies;
DROP POLICY IF EXISTS companies_update_authenticated ON public.companies;
DROP POLICY IF EXISTS companies_select_member_org_scope ON public.companies;
DROP POLICY IF EXISTS companies_insert_active_member ON public.companies;
DROP POLICY IF EXISTS companies_update_member_org_scope ON public.companies;
DROP POLICY IF EXISTS companies_org_membership_all ON public.companies;

CREATE POLICY companies_org_membership_all
  ON public.companies
  FOR ALL
  TO authenticated
  USING (
    org_id IS NOT NULL
    AND org_id IN (
      SELECT m.org_id
      FROM public.memberships m
      WHERE m.user_id = auth.uid()
        AND coalesce(m.is_active, true) = true
    )
  )
  WITH CHECK (
    org_id IS NOT NULL
    AND org_id IN (
      SELECT m.org_id
      FROM public.memberships m
      WHERE m.user_id = auth.uid()
        AND coalesce(m.is_active, true) = true
    )
  );

COMMENT ON POLICY companies_org_membership_all ON public.companies IS
  'Authenticated users may read/write companies only for orgs they belong to (active membership).';

-- Optional: remove helper from earlier experiments if present
DROP FUNCTION IF EXISTS public.user_can_see_company_via_membership(uuid);

-- 5) Allow DELETE for authenticated when policy passes (e.g. admin tooling).
GRANT DELETE ON public.companies TO authenticated;
