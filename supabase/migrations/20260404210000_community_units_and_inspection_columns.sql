-- Lokale wspólnoty (Administracja) + rozszerzenie rekordów przeglądu o budynek i link do lokalu.

CREATE TABLE IF NOT EXISTS public.community_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  community_id uuid NOT NULL REFERENCES public.communities (id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.cleaning_locations (id) ON DELETE SET NULL,
  building_identifier text,
  unit_number text NOT NULL,
  resident_profile_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS community_units_dedupe_idx
  ON public.community_units (
    community_id,
    coalesce(building_identifier, ''),
    unit_number
  );

CREATE INDEX IF NOT EXISTS community_units_org_community_idx
  ON public.community_units (org_id, community_id);

COMMENT ON TABLE public.community_units IS
  'Rejestr lokali wspólnoty (Administracja); źródło importu do przeglądów lokalnych.';
COMMENT ON COLUMN public.community_units.building_identifier IS
  'Etykieta budynku/klatki w ramach wspólnoty.';
COMMENT ON COLUMN public.community_units.resident_profile_id IS
  'Opcjonalny lokator powiązany z kontem (profiles).';

ALTER TABLE public.unit_inspection_records
  ADD COLUMN IF NOT EXISTS building_identifier text,
  ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES public.community_units (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS unit_inspection_records_unit_id_idx
  ON public.unit_inspection_records (unit_id)
  WHERE unit_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS unit_inspection_records_campaign_building_unit_key
  ON public.unit_inspection_records (
    campaign_id,
    coalesce(building_identifier, ''),
    unit_number
  );

COMMENT ON COLUMN public.unit_inspection_records.building_identifier IS
  'Budynek/Klatka — rozróżnienie lokali o tym samym numerze w jednej kampanii.';
COMMENT ON COLUMN public.unit_inspection_records.unit_id IS
  'Opcjonalny link do community_units (import z Administracji).';

ALTER TABLE public.community_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS community_units_select_member ON public.community_units;
CREATE POLICY community_units_select_member ON public.community_units
  FOR SELECT
  USING (
    org_id IN (
      SELECT m.org_id
      FROM public.memberships m
      WHERE m.user_id = auth.uid()
        AND coalesce(m.is_active, true) = true
    )
  );

DROP POLICY IF EXISTS community_units_insert_member ON public.community_units;
CREATE POLICY community_units_insert_member ON public.community_units
  FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT m.org_id
      FROM public.memberships m
      WHERE m.user_id = auth.uid()
        AND coalesce(m.is_active, true) = true
    )
  );

DROP POLICY IF EXISTS community_units_update_member ON public.community_units;
CREATE POLICY community_units_update_member ON public.community_units
  FOR UPDATE
  USING (
    org_id IN (
      SELECT m.org_id
      FROM public.memberships m
      WHERE m.user_id = auth.uid()
        AND coalesce(m.is_active, true) = true
    )
  );

DROP POLICY IF EXISTS community_units_delete_member ON public.community_units;
CREATE POLICY community_units_delete_member ON public.community_units
  FOR DELETE
  USING (
    org_id IN (
      SELECT m.org_id
      FROM public.memberships m
      WHERE m.user_id = auth.uid()
        AND coalesce(m.is_active, true) = true
    )
  );
