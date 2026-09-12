-- Platform admin manages partner catalog and offers in /admin.
-- vendor_partners and partner_offers were org-member-only, so INSERT without
-- membership (and WITH CHECK on a missing org_id) failed RLS.

DROP POLICY IF EXISTS vendor_partners_platform_admin ON public.vendor_partners;
CREATE POLICY vendor_partners_platform_admin
  ON public.vendor_partners
  FOR ALL
  TO authenticated
  USING ((SELECT public.is_platform_admin()))
  WITH CHECK ((SELECT public.is_platform_admin()));

DROP POLICY IF EXISTS partner_offers_platform_admin ON public.partner_offers;
CREATE POLICY partner_offers_platform_admin
  ON public.partner_offers
  FOR ALL
  TO authenticated
  USING ((SELECT public.is_platform_admin()))
  WITH CHECK ((SELECT public.is_platform_admin()));

DROP POLICY IF EXISTS cleaning_locations_select_platform_admin ON public.cleaning_locations;
CREATE POLICY cleaning_locations_select_platform_admin
  ON public.cleaning_locations
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_platform_admin()));

DROP POLICY IF EXISTS organizations_select_platform_admin ON public.organizations;
CREATE POLICY organizations_select_platform_admin
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_platform_admin()));
