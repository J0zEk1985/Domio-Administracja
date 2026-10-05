-- Administracja zapisuje umowy i polisy bez wiersza w location_access.
-- Dotychczasowa polityka ALL wymagała user_has_location_access_docs(location_id),
-- czyli przypisania użytkownika do budynku. Zespół org (owner/admin/manager/…)
-- nie ma takich wierszy, więc INSERT kończył się RLS 403.
-- Odczyt przez location_access oraz (dla umów) origin/share zostaje bez zmian.

DROP POLICY IF EXISTS property_contracts_write_admin_team ON public.property_contracts;
CREATE POLICY property_contracts_write_admin_team
  ON public.property_contracts
  FOR ALL
  TO authenticated
  USING (public.is_org_admin_team(org_id))
  WITH CHECK (
    public.is_org_admin_team(org_id)
    AND org_id = (SELECT cl.org_id FROM public.cleaning_locations cl WHERE cl.id = location_id)
  );

DROP POLICY IF EXISTS property_policies_write_admin_team ON public.property_policies;
CREATE POLICY property_policies_write_admin_team
  ON public.property_policies
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.cleaning_locations cl
      WHERE cl.id = location_id
        AND public.is_org_admin_team(cl.org_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.cleaning_locations cl
      WHERE cl.id = location_id
        AND public.is_org_admin_team(cl.org_id)
    )
  );
