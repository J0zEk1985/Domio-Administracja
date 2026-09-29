-- Residential unit registry, CSV resident import, and login claim for DOMIO Home.
-- Technical rooms stay manual. Inspection records keep a nullable unit_id.

BEGIN;

-- ---------------------------------------------------------------------------
-- Registry
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.community_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  community_id uuid NOT NULL REFERENCES public.communities (id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.cleaning_locations (id) ON DELETE CASCADE,
  building_identifier text,
  unit_number text NOT NULL,
  normalized_unit_number text GENERATED ALWAYS AS (public.normalize_unit_number(unit_number)) STORED,
  kind text NOT NULL DEFAULT 'residential',
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_units_kind_check CHECK (kind IN ('residential', 'technical')),
  CONSTRAINT community_units_normalized_not_null CHECK (normalized_unit_number IS NOT NULL),
  CONSTRAINT community_units_location_normalized_uidx UNIQUE (location_id, normalized_unit_number)
);

CREATE INDEX IF NOT EXISTS idx_community_units_org_id
  ON public.community_units (org_id);

CREATE INDEX IF NOT EXISTS idx_community_units_community_id
  ON public.community_units (community_id);

COMMENT ON TABLE public.community_units IS
  'Units of a building (cleaning_locations). Residential rows may be created by CSV import. Technical rows are manual.';

CREATE TABLE IF NOT EXISTS public.community_unit_occupants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.community_units (id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL,
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_unit_occupants_email_uidx UNIQUE (unit_id, email),
  CONSTRAINT community_unit_occupants_full_name_not_blank CHECK (length(btrim(full_name)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_community_unit_occupants_email
  ON public.community_unit_occupants (email);

CREATE INDEX IF NOT EXISTS idx_community_unit_occupants_user_id
  ON public.community_unit_occupants (user_id)
  WHERE user_id IS NOT NULL;

COMMENT ON TABLE public.community_unit_occupants IS
  'Resident assigned to a unit. user_id is null until the person logs into DOMIO Home with the same email.';

CREATE OR REPLACE FUNCTION public.tg_community_unit_occupant_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.email := lower(btrim(NEW.email));
  NEW.full_name := btrim(NEW.full_name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_unit_occupant_normalize ON public.community_unit_occupants;
CREATE TRIGGER trg_community_unit_occupant_normalize
  BEFORE INSERT OR UPDATE OF email, full_name
  ON public.community_unit_occupants
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_community_unit_occupant_normalize();

ALTER TABLE public.unit_inspection_records
  ADD COLUMN IF NOT EXISTS unit_id uuid,
  ADD COLUMN IF NOT EXISTS unit_kind text NOT NULL DEFAULT 'residential';

ALTER TABLE public.unit_inspection_records
  DROP CONSTRAINT IF EXISTS unit_inspection_records_unit_id_fkey;

ALTER TABLE public.unit_inspection_records
  ADD CONSTRAINT unit_inspection_records_unit_id_fkey
  FOREIGN KEY (unit_id) REFERENCES public.community_units (id) ON DELETE SET NULL;

ALTER TABLE public.unit_inspection_records
  DROP CONSTRAINT IF EXISTS unit_inspection_records_unit_kind_check;

ALTER TABLE public.unit_inspection_records
  ADD CONSTRAINT unit_inspection_records_unit_kind_check
  CHECK (unit_kind IN ('residential', 'technical'));

CREATE INDEX IF NOT EXISTS idx_unit_inspection_records_unit_id
  ON public.unit_inspection_records (unit_id)
  WHERE unit_id IS NOT NULL;

COMMENT ON COLUMN public.unit_inspection_records.unit_id IS
  'Optional link to community_units. Null on legacy and manual inspection rows.';

COMMENT ON COLUMN public.unit_inspection_records.unit_kind IS
  'residential = apartment; technical = room such as a heat node, with no resident presence.';

-- Idempotent resident assignment. Skipped when existing rows already collide.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM (
      SELECT
        location_id,
        user_id,
        public.normalize_unit_number(unit_number) AS normalized
      FROM public.location_access
      WHERE unit_number IS NOT NULL
      GROUP BY 1, 2, 3
      HAVING count(*) > 1
    ) d
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS location_access_resident_unit_uidx
      ON public.location_access (
        location_id,
        user_id,
        (public.normalize_unit_number(unit_number))
      )
      WHERE unit_number IS NOT NULL
        AND public.normalize_unit_number(unit_number) IS NOT NULL;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.community_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_unit_occupants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS community_units_select ON public.community_units;
CREATE POLICY community_units_select
  ON public.community_units
  FOR SELECT
  TO authenticated
  USING (
    public.is_org_member(org_id)
    OR public.can_manage_location(location_id)
  );

DROP POLICY IF EXISTS community_units_write ON public.community_units;
CREATE POLICY community_units_write
  ON public.community_units
  FOR ALL
  TO authenticated
  USING (public.can_manage_location(location_id))
  WITH CHECK (public.can_manage_location(location_id));

DROP POLICY IF EXISTS community_unit_occupants_select ON public.community_unit_occupants;
CREATE POLICY community_unit_occupants_select
  ON public.community_unit_occupants
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.community_units u
      WHERE u.id = community_unit_occupants.unit_id
        AND (
          public.is_org_member(u.org_id)
          OR public.can_manage_location(u.location_id)
        )
    )
  );

DROP POLICY IF EXISTS community_unit_occupants_write ON public.community_unit_occupants;
CREATE POLICY community_unit_occupants_write
  ON public.community_unit_occupants
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.community_units u
      WHERE u.id = community_unit_occupants.unit_id
        AND public.can_manage_location(u.location_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.community_units u
      WHERE u.id = unit_id
        AND public.can_manage_location(u.location_id)
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_units TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_unit_occupants TO authenticated;
REVOKE ALL ON public.community_units FROM anon;
REVOKE ALL ON public.community_unit_occupants FROM anon;

-- ---------------------------------------------------------------------------
-- Import
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.import_location_residents(
  p_location_id uuid,
  p_rows jsonb
)
RETURNS TABLE (row_index integer, status text, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
  v_community uuid;
  v_master uuid;
  v_elem jsonb;
  v_idx integer;
  v_email text;
  v_full_name text;
  v_unit_raw text;
  v_normalized text;
  v_unit_id uuid;
  v_kind text;
  v_created boolean;
  v_user_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_location(p_location_id) THEN
    RAISE EXCEPTION 'Brak uprawnień do tego budynku.' USING ERRCODE = '42501';
  END IF;

  SELECT cl.org_id, cl.community_id, cl.location_master_id
    INTO v_org, v_community, v_master
  FROM public.cleaning_locations cl
  WHERE cl.id = p_location_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono budynku.' USING ERRCODE = 'P0002';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Nieprawidłowa lista wierszy.';
  END IF;

  IF jsonb_array_length(p_rows) > 500 THEN
    RAISE EXCEPTION 'Maksymalnie 500 wierszy w jednym imporcie.';
  END IF;

  FOR v_elem, v_idx IN
    SELECT value, ordinality::integer
    FROM jsonb_array_elements(p_rows) WITH ORDINALITY
  LOOP
    row_index := COALESCE(NULLIF(v_elem ->> 'row_index', '')::integer, v_idx);
    BEGIN
      v_email := lower(btrim(COALESCE(v_elem ->> 'email', '')));
      v_full_name := btrim(COALESCE(v_elem ->> 'full_name', ''));
      v_unit_raw := btrim(COALESCE(v_elem ->> 'unit_number', ''));
      v_normalized := public.normalize_unit_number(v_unit_raw);
      v_unit_id := NULL;
      v_kind := NULL;
      v_created := false;
      v_user_id := NULL;

      IF v_email = '' OR v_email !~ '^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$' THEN
        status := 'error';
        message := 'Podaj poprawny adres e-mail.';
        RETURN NEXT;
        CONTINUE;
      END IF;

      IF v_full_name = '' OR length(v_full_name) > 200 THEN
        status := 'error';
        message := 'Podaj imię i nazwisko (do 200 znaków).';
        RETURN NEXT;
        CONTINUE;
      END IF;

      IF v_normalized IS NULL THEN
        status := 'error';
        message := 'Podaj numer lokalu.';
        RETURN NEXT;
        CONTINUE;
      END IF;

      SELECT u.id, u.kind
        INTO v_unit_id, v_kind
      FROM public.community_units u
      WHERE u.location_id = p_location_id
        AND u.normalized_unit_number = v_normalized;

      IF v_unit_id IS NOT NULL AND v_kind = 'technical' THEN
        status := 'error';
        message := 'Ten numer jest pomieszczeniem technicznym.';
        RETURN NEXT;
        CONTINUE;
      END IF;

      IF v_unit_id IS NULL THEN
        IF v_community IS NULL THEN
          status := 'error';
          message := 'Budynek nie jest powiązany ze wspólnotą — ustaw wspólnotę przed importem.';
          RETURN NEXT;
          CONTINUE;
        END IF;

        INSERT INTO public.community_units (
          org_id,
          community_id,
          location_id,
          unit_number,
          kind
        )
        VALUES (
          v_org,
          v_community,
          p_location_id,
          v_unit_raw,
          'residential'
        )
        ON CONFLICT (location_id, normalized_unit_number) DO NOTHING
        RETURNING id INTO v_unit_id;

        IF v_unit_id IS NULL THEN
          SELECT u.id, u.kind
            INTO v_unit_id, v_kind
          FROM public.community_units u
          WHERE u.location_id = p_location_id
            AND u.normalized_unit_number = v_normalized;
        ELSE
          v_created := true;
          v_kind := 'residential';
        END IF;
      END IF;

      IF v_unit_id IS NULL OR v_kind = 'technical' THEN
        status := 'error';
        message := 'Nie udało się utworzyć lokalu mieszkalnego.';
        RETURN NEXT;
        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.community_unit_occupants o
        WHERE o.unit_id = v_unit_id
          AND o.email = v_email
      ) THEN
        status := 'error';
        message := 'Ten e-mail jest już przypisany do tego lokalu.';
        RETURN NEXT;
        CONTINUE;
      END IF;

      SELECT p.id
        INTO v_user_id
      FROM public.profiles p
      WHERE lower(btrim(COALESCE(p.email, ''))) = v_email
      ORDER BY p.created_at NULLS LAST
      LIMIT 1;

      INSERT INTO public.community_unit_occupants (unit_id, email, full_name, user_id)
      VALUES (v_unit_id, v_email, v_full_name, v_user_id);

      IF v_user_id IS NOT NULL THEN
        INSERT INTO public.location_access (
          location_id,
          user_id,
          access_type,
          unit_number,
          location_master_id
        )
        SELECT
          p_location_id,
          v_user_id,
          'permanent',
          v_unit_raw,
          v_master
        WHERE NOT EXISTS (
          SELECT 1
          FROM public.location_access la
          WHERE la.location_id = p_location_id
            AND la.user_id = v_user_id
            AND public.normalize_unit_number(la.unit_number) IS NOT DISTINCT FROM v_normalized
        );
      END IF;

      status := 'imported';
      IF v_created AND v_user_id IS NOT NULL THEN
        message := 'Utworzono lokal i przypisano konto.';
      ELSIF v_created THEN
        message := 'Utworzono lokal. Mieszkaniec oczekuje na logowanie.';
      ELSIF v_user_id IS NOT NULL THEN
        message := 'Przypisano konto do lokalu.';
      ELSE
        message := 'Zapisano mieszkańca. Oczekuje na logowanie.';
      END IF;
      RETURN NEXT;
    EXCEPTION
      WHEN OTHERS THEN
        status := 'error';
        message := 'Nie udało się zapisać wiersza.';
        RETURN NEXT;
    END;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.import_location_residents(uuid, jsonb) IS
  'Batch resident import. Creates a missing residential unit. Does not create auth users.';

REVOKE ALL ON FUNCTION public.import_location_residents(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_location_residents(uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- Claim on Home login
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_my_resident_units()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text := lower(btrim(COALESCE(auth.jwt() ->> 'email', '')));
  v_linked integer := 0;
BEGIN
  IF v_uid IS NULL OR v_email = '' THEN
    RETURN 0;
  END IF;

  UPDATE public.community_unit_occupants o
  SET user_id = v_uid
  WHERE (o.user_id IS NULL OR o.user_id = v_uid)
    AND lower(btrim(o.email)) = v_email
    AND o.user_id IS DISTINCT FROM v_uid;

  INSERT INTO public.location_access (
    location_id,
    user_id,
    access_type,
    unit_number,
    location_master_id
  )
  SELECT
    u.location_id,
    v_uid,
    'permanent',
    u.unit_number,
    cl.location_master_id
  FROM public.community_unit_occupants o
  JOIN public.community_units u ON u.id = o.unit_id
  JOIN public.cleaning_locations cl ON cl.id = u.location_id
  WHERE o.user_id = v_uid
    AND lower(btrim(o.email)) = v_email
    AND u.kind = 'residential'
    AND NOT EXISTS (
      SELECT 1
      FROM public.location_access la
      WHERE la.location_id = u.location_id
        AND la.user_id = v_uid
        AND public.normalize_unit_number(la.unit_number)
            IS NOT DISTINCT FROM u.normalized_unit_number
    );

  GET DIAGNOSTICS v_linked = ROW_COUNT;
  RETURN v_linked;
END;
$$;

COMMENT ON FUNCTION public.claim_my_resident_units() IS
  'Links pending occupants to the signed-in user by JWT email and inserts missing location_access rows.';

REVOKE ALL ON FUNCTION public.claim_my_resident_units() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_my_resident_units() TO authenticated;

-- ---------------------------------------------------------------------------
-- Remove one occupant and the matching resident access row
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.remove_unit_occupant(p_occupant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_location_id uuid;
  v_normalized text;
  v_user_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Wymagane logowanie.' USING ERRCODE = '42501';
  END IF;

  SELECT u.location_id, u.normalized_unit_number, o.user_id
    INTO v_location_id, v_normalized, v_user_id
  FROM public.community_unit_occupants o
  JOIN public.community_units u ON u.id = o.unit_id
  WHERE o.id = p_occupant_id;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono mieszkańca.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.can_manage_location(v_location_id) THEN
    RAISE EXCEPTION 'Brak uprawnień do tego budynku.' USING ERRCODE = '42501';
  END IF;

  IF v_user_id IS NOT NULL THEN
    DELETE FROM public.location_access la
    WHERE la.location_id = v_location_id
      AND la.user_id = v_user_id
      AND la.unit_number IS NOT NULL
      AND public.normalize_unit_number(la.unit_number) IS NOT DISTINCT FROM v_normalized;
  END IF;

  DELETE FROM public.community_unit_occupants
  WHERE id = p_occupant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_unit_occupant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_unit_occupant(uuid) TO authenticated;

COMMIT;
