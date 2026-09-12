-- Billing org identity (legal_entities) + opt-in provider directory for Administracja.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS legal_entity_id uuid REFERENCES public.legal_entities (id) ON DELETE SET NULL;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS listed_in_provider_directory boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.legal_entity_id IS
  'Self legal-party identity of the billing tenant. Not a contractor overlay in companies.';

COMMENT ON COLUMN public.organizations.listed_in_provider_directory IS
  'Opt-in: org may appear in the Administracja provider catalog. Changeable at any time. Default false.';

CREATE INDEX IF NOT EXISTS organizations_provider_directory_idx
  ON public.organizations (id)
  WHERE listed_in_provider_directory = true
    AND legal_entity_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.org_has_current_module_subscription(p_org_id uuid, p_module text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.org_subscriptions s
    INNER JOIN public.applications a ON a.id = s.app_id
    WHERE s.org_id = p_org_id
      AND lower(COALESCE(s.status, '')) = 'active'
      AND (s.expires_at IS NULL OR s.expires_at > now())
      AND (
        (
          p_module = 'maintenance'
          AND (
            a.domain_url ILIKE '%serwis.domio.com.pl%'
            OR lower(a.name) LIKE '%serwis%'
          )
        )
        OR (
          p_module = 'cleaning'
          AND (
            a.domain_url ILIKE '%cleaning.domio.com.pl%'
            OR lower(a.name) LIKE '%cleaning%'
          )
        )
        OR (
          p_module = 'admin'
          AND (
            a.domain_url ILIKE '%admin.domio.com.pl%'
            OR a.domain_url ILIKE '%adm.domio.com.pl%'
            OR lower(a.name) LIKE '%administr%'
          )
        )
      )
  );
$$;

COMMENT ON FUNCTION public.org_has_current_module_subscription(uuid, text) IS
  'True when the org has an unexpired active subscription for maintenance/cleaning/admin.';

REVOKE ALL ON FUNCTION public.org_has_current_module_subscription(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_has_current_module_subscription(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.link_billing_org_legal_entity_enrollment(
  p_org_id uuid,
  p_legal_entity_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.org_legal_entity_enrollments (
    org_id,
    legal_entity_id,
    is_cleaning,
    is_maintenance,
    is_admin,
    status
  )
  VALUES (
    p_org_id,
    p_legal_entity_id,
    false,
    false,
    false,
    'active'
  )
  ON CONFLICT (org_id, legal_entity_id) DO UPDATE
    SET status = 'active';
END;
$$;

COMMENT ON FUNCTION public.link_billing_org_legal_entity_enrollment(uuid, uuid) IS
  'Self-enrollment without companies/communities overlay sync.';

REVOKE ALL ON FUNCTION public.link_billing_org_legal_entity_enrollment(uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.upsert_billing_org_legal_entity(
  p_org_id uuid,
  p_nip text,
  p_legal_name text,
  p_city text,
  p_postal_code text,
  p_address text,
  p_phone text,
  p_gus jsonb,
  p_kind public.legal_entity_kind DEFAULT 'company',
  p_listed_in_provider_directory boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_nip text;
  v_name text;
  v_city text;
  v_postal text;
  v_phone text;
  v_email text;
  v_kind public.legal_entity_kind;
  v_existing uuid;
  v_row public.legal_entities%ROWTYPE;
  v_regon text;
  v_krs text;
  v_street text;
  v_building text;
  v_apt text;
  v_voiv text;
  v_county text;
  v_commune text;
  v_seat text;
  v_short text;
  v_created boolean := false;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'LEGAL_ENTITY_AUTH_REQUIRED';
  END IF;

  IF p_org_id IS NULL OR NOT public.is_org_management(p_org_id) THEN
    RAISE EXCEPTION 'LEGAL_ENTITY_ENROLL_FORBIDDEN';
  END IF;

  v_nip := regexp_replace(COALESCE(p_nip, ''), '[^0-9]', '', 'g');
  v_name := NULLIF(btrim(COALESCE(p_legal_name, '')), '');
  v_city := NULLIF(btrim(COALESCE(p_city, '')), '');
  v_postal := public.normalize_pl_postal(p_postal_code);
  v_phone := regexp_replace(COALESCE(p_phone, ''), '[^0-9+]', '', 'g');
  v_kind := COALESCE(p_kind, 'company'::public.legal_entity_kind);

  SELECT email INTO v_email
  FROM auth.users
  WHERE id = (SELECT auth.uid());
  v_email := NULLIF(btrim(COALESCE(v_email, '')), '');

  IF v_nip = '' THEN
    UPDATE public.organizations
    SET
      legal_entity_id = NULL,
      listed_in_provider_directory = false
    WHERE id = p_org_id;

    RETURN jsonb_build_object(
      'ok', true,
      'status', 'cleared',
      'legalEntityId', NULL,
      'listed', false
    );
  END IF;

  IF NOT public.nip_checksum_ok(v_nip) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_nip');
  END IF;

  SELECT id INTO v_existing
  FROM public.legal_entities
  WHERE nip_normalized = v_nip;

  IF v_existing IS NULL AND (p_gus IS NULL OR jsonb_typeof(p_gus) <> 'object') THEN
    IF p_listed_in_provider_directory THEN
      RETURN jsonb_build_object('ok', false, 'error', 'PROVIDER_DIRECTORY_GUS_REQUIRED');
    END IF;
    UPDATE public.organizations
    SET listed_in_provider_directory = false
    WHERE id = p_org_id
      AND legal_entity_id IS NULL;
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'skipped',
      'legalEntityId', NULL,
      'listed', false
    );
  END IF;

  IF v_existing IS NULL THEN
    IF v_email IS NULL
       OR char_length(v_phone) < 9
       OR v_name IS NULL
       OR v_city IS NULL
       OR v_postal IS NULL
    THEN
      IF p_listed_in_provider_directory THEN
        RETURN jsonb_build_object('ok', false, 'error', 'PROVIDER_DIRECTORY_CONTACT_REQUIRED');
      END IF;
      RETURN jsonb_build_object(
        'ok', true,
        'status', 'skipped',
        'legalEntityId', NULL,
        'listed', false
      );
    END IF;

    v_regon := regexp_replace(COALESCE(p_gus ->> 'regon', ''), '[^0-9]', '', 'g');
    v_krs := NULLIF(regexp_replace(COALESCE(p_gus ->> 'krs', ''), '[^0-9]', '', 'g'), '');
    v_street := NULLIF(btrim(COALESCE(p_gus ->> 'street', '')), '');
    v_building := NULLIF(btrim(COALESCE(p_gus ->> 'buildingNumber', p_gus ->> 'building_number', '')), '');
    v_apt := NULLIF(btrim(COALESCE(p_gus ->> 'apartmentNumber', p_gus ->> 'apartment_number', '')), '');
    v_voiv := NULLIF(btrim(COALESCE(p_gus ->> 'voivodeship', '')), '');
    v_county := NULLIF(btrim(COALESCE(p_gus ->> 'county', '')), '');
    v_commune := NULLIF(btrim(COALESCE(p_gus ->> 'commune', '')), '');
    v_seat := NULLIF(btrim(COALESCE(p_gus ->> 'seatFullAddress', p_gus ->> 'seat_full_address', p_address, '')), '');
    v_short := left(v_name, 80);

    IF v_voiv IS NULL THEN
      v_voiv := 'nieustalone';
    END IF;
    IF v_building IS NULL THEN
      v_building := 'b.n.';
    END IF;
    IF v_seat IS NULL THEN
      v_seat := concat_ws(
        ', ',
        NULLIF(btrim(COALESCE(p_address, '')), ''),
        NULLIF(concat_ws(' ', v_postal, v_city), '')
      );
    END IF;
    IF v_kind = 'housing_cooperative'::public.legal_entity_kind
       AND COALESCE(v_krs, '') !~ '^[0-9]{10}$' THEN
      v_kind := 'company'::public.legal_entity_kind;
    END IF;
    IF NOT public.regon_checksum_ok(v_regon) THEN
      IF p_listed_in_provider_directory THEN
        RETURN jsonb_build_object('ok', false, 'error', 'PROVIDER_DIRECTORY_GUS_REQUIRED');
      END IF;
      RETURN jsonb_build_object(
        'ok', true,
        'status', 'skipped',
        'legalEntityId', NULL,
        'listed', false
      );
    END IF;

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
      gus_legal_form_code,
      gus_legal_form_name,
      gus_fetched_at,
      gus_payload,
      created_without_gus,
      created_by_org_id,
      updated_by
    )
    VALUES (
      v_kind,
      'active',
      v_nip,
      v_regon,
      v_krs,
      v_short,
      v_name,
      v_voiv,
      v_county,
      v_commune,
      v_city,
      v_postal,
      v_street,
      v_building,
      v_apt,
      v_seat,
      v_email,
      v_phone,
      NULLIF(btrim(COALESCE(p_gus ->> 'legalFormCode', p_gus ->> 'legal_form_code', '')), ''),
      NULLIF(btrim(COALESCE(p_gus ->> 'legalFormName', p_gus ->> 'legal_form_name', '')), ''),
      now(),
      p_gus,
      false,
      p_org_id,
      auth.uid()
    )
    RETURNING * INTO v_row;

    v_existing := v_row.id;
    v_created := true;
  END IF;

  PERFORM public.link_billing_org_legal_entity_enrollment(p_org_id, v_existing);

  UPDATE public.organizations
  SET
    legal_entity_id = v_existing,
    listed_in_provider_directory = COALESCE(p_listed_in_provider_directory, false)
  WHERE id = p_org_id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', CASE WHEN v_created THEN 'created' ELSE 'linked' END,
    'legalEntityId', v_existing,
    'listed', COALESCE(p_listed_in_provider_directory, false)
  );
END;
$$;

COMMENT ON FUNCTION public.upsert_billing_org_legal_entity(
  uuid, text, text, text, text, text, text, jsonb, public.legal_entity_kind, boolean
) IS
  'Link or create legal_entities for a billing org without companies overlay. Opt-in directory flag included.';

REVOKE ALL ON FUNCTION public.upsert_billing_org_legal_entity(
  uuid, text, text, text, text, text, text, jsonb, public.legal_entity_kind, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_billing_org_legal_entity(
  uuid, text, text, text, text, text, text, jsonb, public.legal_entity_kind, boolean
) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_org_listed_in_provider_directory(
  p_org_id uuid,
  p_listed boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_le uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'LEGAL_ENTITY_AUTH_REQUIRED';
  END IF;

  IF p_org_id IS NULL OR NOT public.is_org_management(p_org_id) THEN
    RAISE EXCEPTION 'LEGAL_ENTITY_ENROLL_FORBIDDEN';
  END IF;

  SELECT legal_entity_id INTO v_le
  FROM public.organizations
  WHERE id = p_org_id;

  IF COALESCE(p_listed, false) AND v_le IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PROVIDER_DIRECTORY_NIP_REQUIRED');
  END IF;

  UPDATE public.organizations
  SET listed_in_provider_directory = COALESCE(p_listed, false)
  WHERE id = p_org_id;

  RETURN jsonb_build_object(
    'ok', true,
    'listed', COALESCE(p_listed, false),
    'legalEntityId', v_le
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_org_listed_in_provider_directory(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_org_listed_in_provider_directory(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_provider_directory(
  p_acting_org_id uuid,
  p_module text
)
RETURNS TABLE (
  org_id uuid,
  org_name text,
  city text,
  nip text,
  legal_entity_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'LEGAL_ENTITY_AUTH_REQUIRED';
  END IF;

  IF p_acting_org_id IS NULL OR NOT public.is_org_management(p_acting_org_id) THEN
    RAISE EXCEPTION 'PROVIDER_DIRECTORY_FORBIDDEN';
  END IF;

  IF p_module IS NULL OR p_module NOT IN ('maintenance', 'cleaning') THEN
    RAISE EXCEPTION 'PROVIDER_DIRECTORY_MODULE_INVALID';
  END IF;

  IF NOT public.is_platform_admin()
     AND NOT public.org_has_current_module_subscription(p_acting_org_id, 'admin') THEN
    RAISE EXCEPTION 'PROVIDER_DIRECTORY_ADMIN_REQUIRED';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.city,
    le.nip_normalized,
    o.legal_entity_id
  FROM public.organizations o
  INNER JOIN public.legal_entities le ON le.id = o.legal_entity_id
  WHERE o.listed_in_provider_directory = true
    AND o.legal_entity_id IS NOT NULL
    AND o.id <> p_acting_org_id
    AND public.org_has_current_module_subscription(o.id, p_module)
  ORDER BY o.name;
END;
$$;

COMMENT ON FUNCTION public.list_provider_directory(uuid, text) IS
  'Opt-in Serwis/Cleaning providers visible to Administracja tenants. Not the full subscriber list.';

REVOKE ALL ON FUNCTION public.list_provider_directory(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_provider_directory(uuid, text) TO authenticated;
