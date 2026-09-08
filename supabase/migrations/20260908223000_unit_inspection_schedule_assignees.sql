-- Unit inspections: discrete visit days, campaign-level technicians,
-- building-aware unique units, resident "I'm home" (informational, never blocking).

-- ---------------------------------------------------------------------------
-- Enum + tables
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'inspection_visit_kind'
  ) THEN
    CREATE TYPE public.inspection_visit_kind AS ENUM ('primary', 'supplementary');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.inspection_campaign_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.inspection_campaigns(id) ON DELETE CASCADE,
  visit_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  kind public.inspection_visit_kind NOT NULL DEFAULT 'primary',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inspection_campaign_days_time_order CHECK (end_time > start_time),
  CONSTRAINT inspection_campaign_days_unique_day UNIQUE (campaign_id, visit_date)
);

CREATE INDEX IF NOT EXISTS idx_inspection_campaign_days_campaign
  ON public.inspection_campaign_days (campaign_id);

CREATE INDEX IF NOT EXISTS idx_inspection_campaign_days_date
  ON public.inspection_campaign_days (visit_date);

CREATE TABLE IF NOT EXISTS public.inspection_campaign_assignees (
  campaign_id uuid NOT NULL REFERENCES public.inspection_campaigns(id) ON DELETE CASCADE,
  technician_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (campaign_id, technician_id)
);

CREATE INDEX IF NOT EXISTS idx_inspection_campaign_assignees_tech
  ON public.inspection_campaign_assignees (technician_id);

ALTER TABLE public.unit_inspection_records
  ADD COLUMN IF NOT EXISTS building_identifier text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS resident_is_home boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS resident_home_at timestamptz,
  ADD COLUMN IF NOT EXISTS resident_home_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.unit_inspection_records.resident_is_home IS
  'Resident signal that they are home. Informational only — never blocks other units or technician work.';

ALTER TABLE public.unit_inspection_records
  DROP CONSTRAINT IF EXISTS unique_unit_per_campaign;

DROP INDEX IF EXISTS public.unique_unit_per_campaign_building;

CREATE UNIQUE INDEX unique_unit_per_campaign_building
  ON public.unit_inspection_records (
    campaign_id,
    COALESCE(building_identifier, ''),
    unit_number
  );

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.normalize_unit_number(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO 'public'
AS $$
  SELECT NULLIF(
    regexp_replace(
      regexp_replace(
        lower(trim(coalesce(p_value, ''))),
        '^(m|lok|lokal|mieszkanie)[.\s]*',
        '',
        'i'
      ),
      '\s+',
      '',
      'g'
    ),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.is_inspection_campaign_assignee(p_campaign_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.inspection_campaign_assignees a
    WHERE a.campaign_id = p_campaign_id
      AND a.technician_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.resident_matches_unit_inspection_record(p_record_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.unit_inspection_records r
    JOIN public.inspection_campaigns c ON c.id = r.campaign_id
    JOIN public.location_access la
      ON la.location_id = c.location_id
     AND la.user_id = auth.uid()
    WHERE r.id = p_record_id
      AND (la.expires_at IS NULL OR la.expires_at > now())
      AND public.normalize_unit_number(la.unit_number)
          IS NOT DISTINCT FROM public.normalize_unit_number(r.unit_number)
      AND public.normalize_unit_number(r.unit_number) IS NOT NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.resident_matches_inspection_campaign(p_campaign_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.unit_inspection_records r
    JOIN public.inspection_campaigns c ON c.id = r.campaign_id
    JOIN public.location_access la
      ON la.location_id = c.location_id
     AND la.user_id = auth.uid()
    WHERE r.campaign_id = p_campaign_id
      AND (la.expires_at IS NULL OR la.expires_at > now())
      AND public.normalize_unit_number(la.unit_number)
          IS NOT DISTINCT FROM public.normalize_unit_number(r.unit_number)
      AND public.normalize_unit_number(r.unit_number) IS NOT NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_inspection_org(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_serwis_dispatcher_or_owner(p_org_id);
$$;

CREATE OR REPLACE FUNCTION public.can_staff_access_inspection_campaign(p_campaign_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.inspection_campaigns c
    WHERE c.id = p_campaign_id
      AND (
        public.is_serwis_dispatcher_or_owner(c.org_id)
        OR public.is_inspection_campaign_assignee(c.id)
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Sync campaign date window from discrete days
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_inspection_campaign_schedule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_campaign_id uuid;
  v_min date;
  v_max date;
  v_start time;
  v_end time;
BEGIN
  v_campaign_id := COALESCE(NEW.campaign_id, OLD.campaign_id);
  IF v_campaign_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT MIN(d.visit_date), MAX(d.visit_date)
    INTO v_min, v_max
  FROM public.inspection_campaign_days d
  WHERE d.campaign_id = v_campaign_id;

  IF v_min IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT d.start_time, d.end_time
    INTO v_start, v_end
  FROM public.inspection_campaign_days d
  WHERE d.campaign_id = v_campaign_id
    AND d.kind = 'primary'
  ORDER BY d.visit_date
  LIMIT 1;

  IF v_start IS NULL THEN
    SELECT d.start_time, d.end_time
      INTO v_start, v_end
    FROM public.inspection_campaign_days d
    WHERE d.campaign_id = v_campaign_id
    ORDER BY d.visit_date
    LIMIT 1;
  END IF;

  UPDATE public.inspection_campaigns
  SET start_date = v_min,
      end_date = v_max,
      start_time = v_start,
      end_time = v_end
  WHERE id = v_campaign_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_inspection_campaign_schedule ON public.inspection_campaign_days;
CREATE TRIGGER trg_sync_inspection_campaign_schedule
  AFTER INSERT OR UPDATE OR DELETE ON public.inspection_campaign_days
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_inspection_campaign_schedule();

-- Freeze identity columns for non-managers; resident may only flip "I'm home".
CREATE OR REPLACE FUNCTION public.guard_unit_inspection_record_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT c.org_id INTO v_org
  FROM public.inspection_campaigns c
  WHERE c.id = OLD.campaign_id;

  IF v_org IS NOT NULL AND public.is_serwis_dispatcher_or_owner(v_org) THEN
    RETURN NEW;
  END IF;

  IF public.resident_matches_unit_inspection_record(OLD.id)
     AND NEW.campaign_id IS NOT DISTINCT FROM OLD.campaign_id
     AND NEW.unit_number IS NOT DISTINCT FROM OLD.unit_number
     AND NEW.building_identifier IS NOT DISTINCT FROM OLD.building_identifier
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.notes IS NOT DISTINCT FROM OLD.notes
     AND NEW.inspection_date IS NOT DISTINCT FROM OLD.inspection_date
     AND NEW.photo_url IS NOT DISTINCT FROM OLD.photo_url
     AND NEW.signature_url IS NOT DISTINCT FROM OLD.signature_url
  THEN
    NEW.resident_home_by := auth.uid();
    NEW.resident_home_at := CASE
      WHEN NEW.resident_is_home THEN now()
      ELSE NULL
    END;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF public.is_inspection_campaign_assignee(OLD.campaign_id) THEN
    NEW.campaign_id := OLD.campaign_id;
    NEW.unit_number := OLD.unit_number;
    NEW.building_identifier := OLD.building_identifier;
    NEW.resident_is_home := OLD.resident_is_home;
    NEW.resident_home_at := OLD.resident_home_at;
    NEW.resident_home_by := OLD.resident_home_by;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Brak uprawnień do aktualizacji rekordu przeglądu.'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_unit_inspection_record_update ON public.unit_inspection_records;
CREATE TRIGGER trg_guard_unit_inspection_record_update
  BEFORE UPDATE ON public.unit_inspection_records
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_unit_inspection_record_update();

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_unit_inspection_home(
  p_record_id uuid,
  p_is_home boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Wymagane logowanie.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.resident_matches_unit_inspection_record(p_record_id) THEN
    RAISE EXCEPTION 'Brak dostępu do tego lokalu.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.unit_inspection_records
  SET resident_is_home = p_is_home,
      resident_home_at = CASE WHEN p_is_home THEN now() ELSE NULL END,
      resident_home_by = auth.uid(),
      updated_at = now()
  WHERE id = p_record_id;
END;
$$;

COMMENT ON FUNCTION public.mark_unit_inspection_home(uuid, boolean) IS
  'Resident toggle: I am home. Does not change status and does not lock other units.';

CREATE OR REPLACE FUNCTION public.list_my_unit_inspections()
RETURNS TABLE (
  campaign_id uuid,
  record_id uuid,
  title text,
  location_id uuid,
  unit_number text,
  status public.unit_inspection_status,
  resident_is_home boolean,
  start_date date,
  end_date date,
  days jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    c.id,
    r.id,
    c.title,
    c.location_id,
    r.unit_number,
    r.status,
    r.resident_is_home,
    c.start_date,
    c.end_date,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'visit_date', d.visit_date,
            'start_time', d.start_time,
            'end_time', d.end_time,
            'kind', d.kind
          )
          ORDER BY d.visit_date
        )
        FROM public.inspection_campaign_days d
        WHERE d.campaign_id = c.id
      ),
      '[]'::jsonb
    )
  FROM public.unit_inspection_records r
  JOIN public.inspection_campaigns c ON c.id = r.campaign_id
  WHERE public.resident_matches_unit_inspection_record(r.id)
    AND CURRENT_DATE BETWEEN c.start_date AND c.end_date;
$$;

CREATE OR REPLACE FUNCTION public.replace_inspection_campaign_days(
  p_campaign_id uuid,
  p_days jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
  v_row jsonb;
  v_kind text;
BEGIN
  SELECT org_id INTO v_org
  FROM public.inspection_campaigns
  WHERE id = p_campaign_id;

  IF v_org IS NULL OR NOT public.is_serwis_dispatcher_or_owner(v_org) THEN
    RAISE EXCEPTION 'Brak uprawnień do edycji harmonogramu.' USING ERRCODE = '42501';
  END IF;

  IF p_days IS NULL OR jsonb_typeof(p_days) <> 'array' OR jsonb_array_length(p_days) < 1 THEN
    RAISE EXCEPTION 'Podaj co najmniej jeden dzień przeglądu.';
  END IF;

  DELETE FROM public.inspection_campaign_days
  WHERE campaign_id = p_campaign_id;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_days)
  LOOP
    v_kind := COALESCE(v_row ->> 'kind', 'primary');
    IF v_kind NOT IN ('primary', 'supplementary') THEN
      v_kind := 'primary';
    END IF;

    INSERT INTO public.inspection_campaign_days (
      campaign_id, visit_date, start_time, end_time, kind, notes
    ) VALUES (
      p_campaign_id,
      (v_row ->> 'visit_date')::date,
      (v_row ->> 'start_time')::time,
      (v_row ->> 'end_time')::time,
      v_kind::public.inspection_visit_kind,
      NULLIF(v_row ->> 'notes', '')
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_inspection_campaign_assignees(
  p_campaign_id uuid,
  p_technician_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
  v_id uuid;
BEGIN
  SELECT org_id INTO v_org
  FROM public.inspection_campaigns
  WHERE id = p_campaign_id;

  IF v_org IS NULL OR NOT public.is_serwis_dispatcher_or_owner(v_org) THEN
    RAISE EXCEPTION 'Brak uprawnień do przydziału techników.' USING ERRCODE = '42501';
  END IF;

  IF p_technician_ids IS NOT NULL THEN
    FOREACH v_id IN ARRAY p_technician_ids
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM public.memberships m
        WHERE m.org_id = v_org
          AND m.user_id = v_id
          AND COALESCE(m.is_active, true) = true
          AND m.role IN (
            'technik', 'technician',
            'coordinator', 'koordynator',
            'owner', 'wlasciciel',
            'admin', 'administrator', 'manager'
          )
      ) THEN
        RAISE EXCEPTION 'Technik nie należy do zespołu tej organizacji.';
      END IF;
    END LOOP;
  END IF;

  DELETE FROM public.inspection_campaign_assignees
  WHERE campaign_id = p_campaign_id;

  IF p_technician_ids IS NOT NULL THEN
    INSERT INTO public.inspection_campaign_assignees (campaign_id, technician_id, assigned_by)
    SELECT DISTINCT p_campaign_id, t_id, auth.uid()
    FROM unnest(p_technician_ids) AS t_id
    WHERE t_id IS NOT NULL;
  END IF;
END;
$$;

-- Backfill discrete days from legacy campaign window
INSERT INTO public.inspection_campaign_days (campaign_id, visit_date, start_time, end_time, kind)
SELECT
  c.id,
  c.start_date,
  COALESCE(c.start_time, TIME '08:00'),
  CASE
    WHEN c.end_time IS NOT NULL AND c.end_time > COALESCE(c.start_time, TIME '08:00')
      THEN c.end_time
    WHEN COALESCE(c.start_time, TIME '08:00') < TIME '16:00'
      THEN TIME '16:00'
    ELSE (COALESCE(c.start_time, TIME '08:00') + INTERVAL '1 hour')::time
  END,
  'primary'::public.inspection_visit_kind
FROM public.inspection_campaigns c
WHERE NOT EXISTS (
  SELECT 1 FROM public.inspection_campaign_days d WHERE d.campaign_id = c.id
)
ON CONFLICT (campaign_id, visit_date) DO NOTHING;

INSERT INTO public.inspection_campaign_days (campaign_id, visit_date, start_time, end_time, kind)
SELECT
  c.id,
  c.end_date,
  COALESCE(c.start_time, TIME '08:00'),
  CASE
    WHEN c.end_time IS NOT NULL AND c.end_time > COALESCE(c.start_time, TIME '08:00')
      THEN c.end_time
    WHEN COALESCE(c.start_time, TIME '08:00') < TIME '16:00'
      THEN TIME '16:00'
    ELSE (COALESCE(c.start_time, TIME '08:00') + INTERVAL '1 hour')::time
  END,
  'supplementary'::public.inspection_visit_kind
FROM public.inspection_campaigns c
WHERE c.end_date > c.start_date
  AND NOT EXISTS (
    SELECT 1
    FROM public.inspection_campaign_days d
    WHERE d.campaign_id = c.id
      AND d.visit_date = c.end_date
  )
ON CONFLICT (campaign_id, visit_date) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

ALTER TABLE public.inspection_campaign_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_campaign_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_inspection_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_campaigns ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspection_campaign_days TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspection_campaign_assignees TO authenticated;

REVOKE ALL ON FUNCTION public.normalize_unit_number(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_unit_number(text) TO authenticated;

REVOKE ALL ON FUNCTION public.is_inspection_campaign_assignee(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_inspection_campaign_assignee(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.resident_matches_unit_inspection_record(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resident_matches_unit_inspection_record(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.resident_matches_inspection_campaign(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resident_matches_inspection_campaign(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.can_manage_inspection_org(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_inspection_org(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.can_staff_access_inspection_campaign(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_staff_access_inspection_campaign(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.mark_unit_inspection_home(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_unit_inspection_home(uuid, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.list_my_unit_inspections() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_unit_inspections() TO authenticated;

REVOKE ALL ON FUNCTION public.replace_inspection_campaign_days(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_inspection_campaign_days(uuid, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.set_inspection_campaign_assignees(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_inspection_campaign_assignees(uuid, uuid[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Admins can manage campaigns" ON public.inspection_campaigns;
DROP POLICY IF EXISTS inspection_campaigns_select ON public.inspection_campaigns;
DROP POLICY IF EXISTS inspection_campaigns_insert ON public.inspection_campaigns;
DROP POLICY IF EXISTS inspection_campaigns_update ON public.inspection_campaigns;
DROP POLICY IF EXISTS inspection_campaigns_delete ON public.inspection_campaigns;

CREATE POLICY inspection_campaigns_select
  ON public.inspection_campaigns
  FOR SELECT
  TO authenticated
  USING (
    public.is_serwis_dispatcher_or_owner(org_id)
    OR public.is_inspection_campaign_assignee(id)
    OR public.resident_matches_inspection_campaign(id)
  );

CREATE POLICY inspection_campaigns_insert
  ON public.inspection_campaigns
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_serwis_dispatcher_or_owner(org_id));

CREATE POLICY inspection_campaigns_update
  ON public.inspection_campaigns
  FOR UPDATE
  TO authenticated
  USING (public.is_serwis_dispatcher_or_owner(org_id))
  WITH CHECK (public.is_serwis_dispatcher_or_owner(org_id));

CREATE POLICY inspection_campaigns_delete
  ON public.inspection_campaigns
  FOR DELETE
  TO authenticated
  USING (public.is_serwis_dispatcher_or_owner(org_id));

DROP POLICY IF EXISTS "Admins can manage unit records" ON public.unit_inspection_records;
DROP POLICY IF EXISTS unit_inspection_records_select ON public.unit_inspection_records;
DROP POLICY IF EXISTS unit_inspection_records_insert ON public.unit_inspection_records;
DROP POLICY IF EXISTS unit_inspection_records_update ON public.unit_inspection_records;
DROP POLICY IF EXISTS unit_inspection_records_delete ON public.unit_inspection_records;

CREATE POLICY unit_inspection_records_select
  ON public.unit_inspection_records
  FOR SELECT
  TO authenticated
  USING (
    public.can_staff_access_inspection_campaign(campaign_id)
    OR public.resident_matches_unit_inspection_record(id)
  );

CREATE POLICY unit_inspection_records_insert
  ON public.unit_inspection_records
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_staff_access_inspection_campaign(campaign_id)
    AND public.can_manage_inspection_org(
      (SELECT c.org_id FROM public.inspection_campaigns c WHERE c.id = campaign_id)
    ));

CREATE POLICY unit_inspection_records_update
  ON public.unit_inspection_records
  FOR UPDATE
  TO authenticated
  USING (
    public.can_staff_access_inspection_campaign(campaign_id)
    OR public.resident_matches_unit_inspection_record(id)
  )
  WITH CHECK (
    public.can_staff_access_inspection_campaign(campaign_id)
    OR public.resident_matches_unit_inspection_record(id)
  );

CREATE POLICY unit_inspection_records_delete
  ON public.unit_inspection_records
  FOR DELETE
  TO authenticated
  USING (
    public.can_manage_inspection_org(
      (SELECT c.org_id FROM public.inspection_campaigns c WHERE c.id = campaign_id)
    )
  );

DROP POLICY IF EXISTS inspection_campaign_days_select ON public.inspection_campaign_days;
DROP POLICY IF EXISTS inspection_campaign_days_write ON public.inspection_campaign_days;

CREATE POLICY inspection_campaign_days_select
  ON public.inspection_campaign_days
  FOR SELECT
  TO authenticated
  USING (
    public.can_staff_access_inspection_campaign(campaign_id)
    OR public.resident_matches_inspection_campaign(campaign_id)
  );

CREATE POLICY inspection_campaign_days_write
  ON public.inspection_campaign_days
  FOR ALL
  TO authenticated
  USING (
    public.can_manage_inspection_org(
      (SELECT c.org_id FROM public.inspection_campaigns c WHERE c.id = campaign_id)
    )
  )
  WITH CHECK (
    public.can_manage_inspection_org(
      (SELECT c.org_id FROM public.inspection_campaigns c WHERE c.id = campaign_id)
    )
  );

DROP POLICY IF EXISTS inspection_campaign_assignees_select ON public.inspection_campaign_assignees;
DROP POLICY IF EXISTS inspection_campaign_assignees_write ON public.inspection_campaign_assignees;

CREATE POLICY inspection_campaign_assignees_select
  ON public.inspection_campaign_assignees
  FOR SELECT
  TO authenticated
  USING (public.can_staff_access_inspection_campaign(campaign_id));

CREATE POLICY inspection_campaign_assignees_write
  ON public.inspection_campaign_assignees
  FOR ALL
  TO authenticated
  USING (
    public.can_manage_inspection_org(
      (SELECT c.org_id FROM public.inspection_campaigns c WHERE c.id = campaign_id)
    )
  )
  WITH CHECK (
    public.can_manage_inspection_org(
      (SELECT c.org_id FROM public.inspection_campaigns c WHERE c.id = campaign_id)
    )
  );
