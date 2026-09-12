-- Contact email and phone on legal_entities are optional (GUS identity is enough).
-- If provided, they must still match existing format rules.

ALTER TABLE public.legal_entities
  ALTER COLUMN email DROP NOT NULL,
  ALTER COLUMN phone DROP NOT NULL;

ALTER TABLE public.legal_entities
  DROP CONSTRAINT IF EXISTS legal_entities_email_chk,
  DROP CONSTRAINT IF EXISTS legal_entities_phone_chk;

ALTER TABLE public.legal_entities
  ADD CONSTRAINT legal_entities_email_chk
    CHECK (
      email IS NULL
      OR btrim(email) = ''
      OR email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ),
  ADD CONSTRAINT legal_entities_phone_chk
    CHECK (
      phone IS NULL
      OR btrim(phone) = ''
      OR char_length(regexp_replace(phone, '[^0-9+]', '', 'g')) >= 9
    );

CREATE OR REPLACE FUNCTION public.create_legal_entity_from_gus(
  p_org_id uuid,
  p_kind public.legal_entity_kind,
  p_gus jsonb,
  p_email text,
  p_phone text,
  p_short_name text,
  p_is_cleaning boolean DEFAULT false,
  p_is_maintenance boolean DEFAULT false,
  p_is_admin boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_nip text;
  v_regon text;
  v_krs text;
  v_legal_name text;
  v_short text;
  v_city text;
  v_postal text;
  v_street text;
  v_building text;
  v_apt text;
  v_voiv text;
  v_county text;
  v_commune text;
  v_seat text;
  v_email text;
  v_phone text;
  v_row public.legal_entities%ROWTYPE;
  v_existing uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'LEGAL_ENTITY_AUTH_REQUIRED';
  END IF;
  IF p_org_id IS NULL OR NOT public.is_org_management(p_org_id) THEN
    RAISE EXCEPTION 'LEGAL_ENTITY_CREATE_FORBIDDEN';
  END IF;
  IF p_gus IS NULL OR jsonb_typeof(p_gus) <> 'object' THEN
    RAISE EXCEPTION 'LEGAL_ENTITY_GUS_PAYLOAD_REQUIRED';
  END IF;

  v_nip := regexp_replace(COALESCE(p_gus ->> 'nip', ''), '[^0-9]', '', 'g');
  v_regon := regexp_replace(COALESCE(p_gus ->> 'regon', ''), '[^0-9]', '', 'g');
  v_krs := NULLIF(regexp_replace(COALESCE(p_gus ->> 'krs', ''), '[^0-9]', '', 'g'), '');
  v_legal_name := NULLIF(btrim(COALESCE(p_gus ->> 'legalName', '')), '');
  v_short := NULLIF(btrim(COALESCE(p_short_name, '')), '');
  v_city := NULLIF(btrim(COALESCE(p_gus ->> 'city', '')), '');
  v_postal := public.normalize_pl_postal(p_gus ->> 'postalCode');
  v_street := NULLIF(btrim(COALESCE(p_gus ->> 'street', '')), '');
  v_building := NULLIF(btrim(COALESCE(p_gus ->> 'buildingNumber', '')), '');
  v_apt := NULLIF(btrim(COALESCE(p_gus ->> 'apartmentNumber', '')), '');
  v_voiv := COALESCE(NULLIF(btrim(COALESCE(p_gus ->> 'voivodeship', '')), ''), 'nieustalone');
  v_county := NULLIF(btrim(COALESCE(p_gus ->> 'county', '')), '');
  v_commune := NULLIF(btrim(COALESCE(p_gus ->> 'commune', '')), '');
  v_email := NULLIF(btrim(COALESCE(p_email, '')), '');
  v_phone := NULLIF(btrim(COALESCE(p_phone, '')), '');
  IF v_short IS NULL THEN v_short := left(COALESCE(v_legal_name, ''), 80); END IF;
  IF v_building IS NULL THEN v_building := 'b.n.'; END IF;
  v_seat := NULLIF(btrim(COALESCE(p_gus ->> 'seatFullAddress', '')), '');
  IF v_seat IS NULL THEN
    v_seat := concat_ws(', ',
      NULLIF(concat_ws(' ', v_street, v_building, v_apt), ''),
      NULLIF(concat_ws(' ', v_postal, v_city), ''));
  END IF;

  IF NOT public.nip_checksum_ok(v_nip)
     OR v_legal_name IS NULL OR v_city IS NULL OR v_postal IS NULL THEN
    RAISE EXCEPTION 'LEGAL_ENTITY_INCOMPLETE_DATA';
  END IF;

  IF v_email IS NOT NULL
     AND v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'LEGAL_ENTITY_INCOMPLETE_DATA';
  END IF;

  IF v_phone IS NOT NULL
     AND char_length(regexp_replace(v_phone, '[^0-9+]', '', 'g')) < 9 THEN
    RAISE EXCEPTION 'LEGAL_ENTITY_INCOMPLETE_DATA';
  END IF;

  SELECT id INTO v_existing FROM public.legal_entities WHERE nip_normalized = v_nip;
  IF v_existing IS NOT NULL THEN
    RETURN public.enroll_legal_entity_for_org(
      p_org_id, v_existing, p_is_cleaning, p_is_maintenance, p_is_admin
    ) || jsonb_build_object('status', 'exists_in_domio');
  END IF;

  INSERT INTO public.legal_entities (
    kind, status, nip, regon, krs, short_name, legal_name,
    voivodeship, county, commune, city, postal_code, street,
    building_number, apartment_number, seat_full_address, email, phone,
    gus_legal_form_code, gus_legal_form_name, gus_fetched_at, gus_payload,
    created_without_gus, created_by_org_id, updated_by
  ) VALUES (
    p_kind, 'active', v_nip, v_regon, v_krs, v_short, v_legal_name,
    v_voiv, v_county, v_commune, v_city, v_postal, v_street,
    v_building, v_apt, v_seat, v_email, v_phone,
    NULLIF(btrim(COALESCE(p_gus ->> 'legalFormCode', '')), ''),
    NULLIF(btrim(COALESCE(p_gus ->> 'legalFormName', '')), ''),
    now(), p_gus, false, p_org_id, auth.uid()
  ) RETURNING * INTO v_row;

  PERFORM public.enroll_legal_entity_for_org(p_org_id, v_row.id, p_is_cleaning, p_is_maintenance, p_is_admin);
  PERFORM public.sync_legal_entity_legacy_overlay(v_row, p_org_id);

  RETURN jsonb_build_object(
    'status', 'created',
    'alreadyEnrolledInThisOrg', true,
    'entity', public.legal_entity_public_json(v_row)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_legal_entity_unverified(
  p_org_id uuid,
  p_kind public.legal_entity_kind,
  p_nip text,
  p_short_name text,
  p_legal_name text,
  p_email text,
  p_phone text,
  p_city text,
  p_postal_code text,
  p_reason text,
  p_street text DEFAULT NULL,
  p_building_number text DEFAULT NULL,
  p_voivodeship text DEFAULT NULL,
  p_is_cleaning boolean DEFAULT false,
  p_is_maintenance boolean DEFAULT false,
  p_is_admin boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_nip text;
  v_short text;
  v_legal text;
  v_city text;
  v_postal text;
  v_street text;
  v_building text;
  v_voiv text;
  v_seat text;
  v_email text;
  v_phone text;
  v_existing uuid;
  v_row public.legal_entities%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'LEGAL_ENTITY_AUTH_REQUIRED';
  END IF;

  IF p_org_id IS NULL
     OR (
       NOT public.is_org_management(p_org_id)
       AND NOT public.is_platform_admin()
     )
  THEN
    RAISE EXCEPTION 'LEGAL_ENTITY_UNVERIFIED_FORBIDDEN';
  END IF;

  IF p_reason IS NULL OR p_reason NOT IN ('gus_unavailable', 'gus_not_configured') THEN
    RAISE EXCEPTION 'LEGAL_ENTITY_INVALID_VERIFICATION_REASON';
  END IF;

  v_nip := regexp_replace(COALESCE(p_nip, ''), '[^0-9]', '', 'g');
  v_short := NULLIF(btrim(COALESCE(p_short_name, '')), '');
  v_legal := NULLIF(btrim(COALESCE(p_legal_name, '')), '');
  v_city := NULLIF(btrim(COALESCE(p_city, '')), '');
  v_postal := public.normalize_pl_postal(p_postal_code);
  v_street := NULLIF(btrim(COALESCE(p_street, '')), '');
  v_building := NULLIF(btrim(COALESCE(p_building_number, '')), '');
  v_voiv := NULLIF(btrim(COALESCE(p_voivodeship, '')), '');
  v_email := NULLIF(btrim(COALESCE(p_email, '')), '');
  v_phone := NULLIF(btrim(COALESCE(p_phone, '')), '');

  IF v_short IS NULL THEN
    v_short := left(COALESCE(v_legal, ''), 80);
  END IF;
  IF v_legal IS NULL THEN
    v_legal := v_short;
  END IF;
  IF v_voiv IS NULL THEN
    v_voiv := 'nieustalone';
  END IF;
  IF v_building IS NULL THEN
    v_building := 'b.n.';
  END IF;

  v_seat := concat_ws(
    ', ',
    NULLIF(concat_ws(' ', v_street, v_building), ''),
    NULLIF(concat_ws(' ', v_postal, v_city), '')
  );

  IF NOT public.nip_checksum_ok(v_nip)
     OR v_short IS NULL
     OR v_legal IS NULL
     OR v_city IS NULL
     OR v_postal IS NULL
  THEN
    RAISE EXCEPTION 'LEGAL_ENTITY_INCOMPLETE_DATA';
  END IF;

  IF v_email IS NOT NULL
     AND v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'LEGAL_ENTITY_INCOMPLETE_DATA';
  END IF;

  IF v_phone IS NOT NULL
     AND char_length(regexp_replace(v_phone, '[^0-9+]', '', 'g')) < 9 THEN
    RAISE EXCEPTION 'LEGAL_ENTITY_INCOMPLETE_DATA';
  END IF;

  SELECT id INTO v_existing
  FROM public.legal_entities
  WHERE nip_normalized = v_nip;

  IF v_existing IS NOT NULL THEN
    RETURN public.enroll_legal_entity_for_org(
      p_org_id,
      v_existing,
      p_is_cleaning,
      p_is_maintenance,
      p_is_admin
    ) || jsonb_build_object('status', 'exists_in_domio');
  END IF;

  PERFORM public.legal_entity_mark_rpc_writer();

  INSERT INTO public.legal_entities (
    kind,
    status,
    nip,
    regon,
    krs,
    short_name,
    legal_name,
    voivodeship,
    county,
    commune,
    city,
    postal_code,
    street,
    building_number,
    apartment_number,
    seat_full_address,
    email,
    phone,
    created_without_gus,
    gus_fetched_at,
    verification_status,
    verification_reason,
    verification_requested_at,
    created_by_org_id,
    updated_by
  )
  VALUES (
    p_kind,
    'active',
    v_nip,
    NULL,
    NULL,
    v_short,
    v_legal,
    v_voiv,
    NULL,
    NULL,
    v_city,
    v_postal,
    v_street,
    v_building,
    NULL,
    v_seat,
    v_email,
    v_phone,
    false,
    NULL,
    'pending_manual',
    p_reason,
    now(),
    p_org_id,
    auth.uid()
  )
  RETURNING * INTO v_row;

  PERFORM public.enroll_legal_entity_for_org(
    p_org_id,
    v_row.id,
    p_is_cleaning,
    p_is_maintenance,
    p_is_admin
  );

  RETURN jsonb_build_object(
    'status', 'created_unverified',
    'alreadyEnrolledInThisOrg', true,
    'entity', public.legal_entity_public_json(v_row)
  );
END;
$$;
