-- Policy scope (UI / domain) for insurance policies; sum insured stays on coverage_amount with default.
ALTER TABLE public.property_policies
  ADD COLUMN IF NOT EXISTS policy_scope text NOT NULL DEFAULT 'majatkowe';

ALTER TABLE public.property_policies
  DROP CONSTRAINT IF EXISTS property_policies_policy_scope_check;

ALTER TABLE public.property_policies
  ADD CONSTRAINT property_policies_policy_scope_check
  CHECK (policy_scope IN ('majatkowe', 'oc_ogolne', 'oc_zarzadu'));

ALTER TABLE public.property_policies
  ALTER COLUMN coverage_amount SET DEFAULT 0;

COMMENT ON COLUMN public.property_policies.policy_scope IS
  'Insurance scope: majatkowe (property), oc_ogolne (general liability), oc_zarzadu (D&O).';
