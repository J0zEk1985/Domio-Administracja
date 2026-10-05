BEGIN;

-- Per catalog item: fulfillment company and e-mail template.
-- Kept off resident_order_catalog_items so residents who can read the catalog
-- cannot select the contractor or the message body.

CREATE TABLE public.resident_order_catalog_item_fulfillment (
  item_id uuid PRIMARY KEY REFERENCES public.resident_order_catalog_items (id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies (id) ON DELETE SET NULL,
  email_subject_template text NOT NULL,
  email_body_template text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resident_order_item_fulfillment_subject_not_blank CHECK (length(btrim(email_subject_template)) > 0),
  CONSTRAINT resident_order_item_fulfillment_body_not_blank CHECK (length(btrim(email_body_template)) > 0)
);

COMMENT ON TABLE public.resident_order_catalog_item_fulfillment IS
  'Contractor and e-mail template for one catalog item. Readable only by order managers.';

CREATE INDEX resident_order_item_fulfillment_org_idx
  ON public.resident_order_catalog_item_fulfillment (org_id);

CREATE INDEX resident_order_item_fulfillment_company_idx
  ON public.resident_order_catalog_item_fulfillment (company_id)
  WHERE company_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tg_resident_order_fulfillment_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT i.org_id INTO v_org
  FROM public.resident_order_catalog_items i
  WHERE i.id = NEW.item_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono pozycji katalogu.';
  END IF;

  NEW.org_id := v_org;

  IF NEW.company_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = NEW.company_id
      AND c.org_id = NEW.org_id
  ) THEN
    RAISE EXCEPTION 'Firma nie należy do tej organizacji.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER resident_order_item_fulfillment_guard
  BEFORE INSERT OR UPDATE OF item_id, company_id, org_id
  ON public.resident_order_catalog_item_fulfillment
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_resident_order_fulfillment_guard();

CREATE TRIGGER resident_order_item_fulfillment_set_updated_at
  BEFORE UPDATE ON public.resident_order_catalog_item_fulfillment
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.resident_order_catalog_item_fulfillment ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.resident_order_catalog_item_fulfillment FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.resident_order_catalog_item_fulfillment TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.resident_order_catalog_item_fulfillment TO service_role;

DROP POLICY IF EXISTS resident_order_item_fulfillment_select ON public.resident_order_catalog_item_fulfillment;
CREATE POLICY resident_order_item_fulfillment_select
  ON public.resident_order_catalog_item_fulfillment
  FOR SELECT
  TO authenticated
  USING (public.can_manage_resident_orders(org_id));

DROP POLICY IF EXISTS resident_order_item_fulfillment_insert ON public.resident_order_catalog_item_fulfillment;
CREATE POLICY resident_order_item_fulfillment_insert
  ON public.resident_order_catalog_item_fulfillment
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_resident_orders(org_id));

DROP POLICY IF EXISTS resident_order_item_fulfillment_update ON public.resident_order_catalog_item_fulfillment;
CREATE POLICY resident_order_item_fulfillment_update
  ON public.resident_order_catalog_item_fulfillment
  FOR UPDATE
  TO authenticated
  USING (public.can_manage_resident_orders(org_id))
  WITH CHECK (public.can_manage_resident_orders(org_id));

DROP POLICY IF EXISTS resident_order_item_fulfillment_delete ON public.resident_order_catalog_item_fulfillment;
CREATE POLICY resident_order_item_fulfillment_delete
  ON public.resident_order_catalog_item_fulfillment
  FOR DELETE
  TO authenticated
  USING (public.can_manage_resident_orders(org_id));

INSERT INTO public.resident_order_catalog_item_fulfillment (
  item_id,
  org_id,
  company_id,
  email_subject_template,
  email_body_template
)
SELECT
  i.id,
  i.org_id,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.companies c
      WHERE c.id = s.default_company_id
        AND c.org_id = i.org_id
    ) THEN s.default_company_id
    ELSE NULL
  END,
  COALESCE(NULLIF(btrim(s.email_subject_template), ''), private.resident_order_default_subject()),
  COALESCE(NULLIF(btrim(s.email_body_template), ''), private.resident_order_default_body())
FROM public.resident_order_catalog_items i
LEFT JOIN public.resident_order_settings s ON s.community_id = i.community_id;

UPDATE public.resident_orders o
SET fulfillment_company_id = f.company_id
FROM public.resident_order_catalog_item_fulfillment f
WHERE o.catalog_item_id = f.item_id
  AND o.fulfillment_company_id IS NULL
  AND f.company_id IS NOT NULL
  AND o.status IN ('pending', 'dispatch_failed');

CREATE OR REPLACE FUNCTION public.upsert_resident_order_catalog_item(
  p_community_id uuid,
  p_item_id uuid,
  p_name text,
  p_description text,
  p_price_amount numeric,
  p_price_kind text,
  p_is_active boolean,
  p_location_ids uuid[],
  p_company_id uuid,
  p_email_subject_template text,
  p_email_body_template text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
  v_id uuid;
  v_name text := btrim(COALESCE(p_name, ''));
  v_description text := NULLIF(btrim(COALESCE(p_description, '')), '');
  v_subject text := btrim(COALESCE(p_email_subject_template, ''));
  v_body text := btrim(COALESCE(p_email_body_template, ''));
BEGIN
  v_org := private.resident_order_require_community_management(p_community_id);

  IF length(v_name) < 2 THEN
    RAISE EXCEPTION 'Nazwa jest za krótka.';
  END IF;

  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'Wybierz firmę realizującą zamówienie.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = p_company_id
      AND c.org_id = v_org
  ) THEN
    RAISE EXCEPTION 'Firma nie należy do tej organizacji.';
  END IF;

  IF length(v_subject) = 0 OR length(v_body) = 0 THEN
    RAISE EXCEPTION 'Uzupełnij temat i treść wiadomości.';
  END IF;

  IF (p_price_amount IS NULL) <> (p_price_kind IS NULL)
     OR (
       p_price_amount IS NOT NULL
       AND (
         p_price_amount < 0
         OR p_price_kind NOT IN ('exact', 'approximate')
       )
     ) THEN
    RAISE EXCEPTION 'Nieprawidłowa cena.';
  END IF;

  IF p_item_id IS NULL THEN
    INSERT INTO public.resident_order_catalog_items (
      org_id,
      community_id,
      name,
      description,
      price_amount,
      price_kind,
      is_active
    )
    VALUES (
      v_org,
      p_community_id,
      v_name,
      v_description,
      p_price_amount,
      p_price_kind,
      COALESCE(p_is_active, true)
    )
    RETURNING id INTO v_id;
  ELSE
    SELECT i.id INTO v_id
    FROM public.resident_order_catalog_items i
    WHERE i.id = p_item_id
      AND i.community_id = p_community_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Nie znaleziono pozycji katalogu.';
    END IF;

    UPDATE public.resident_order_catalog_items
    SET
      name = v_name,
      description = v_description,
      price_amount = p_price_amount,
      price_kind = p_price_kind,
      is_active = COALESCE(p_is_active, true)
    WHERE id = v_id;
  END IF;

  INSERT INTO public.resident_order_catalog_item_fulfillment (
    item_id,
    org_id,
    company_id,
    email_subject_template,
    email_body_template
  )
  VALUES (
    v_id,
    v_org,
    p_company_id,
    v_subject,
    v_body
  )
  ON CONFLICT (item_id) DO UPDATE
  SET
    company_id = EXCLUDED.company_id,
    email_subject_template = EXCLUDED.email_subject_template,
    email_body_template = EXCLUDED.email_body_template;

  DELETE FROM public.resident_order_catalog_item_locations
  WHERE item_id = v_id;

  INSERT INTO public.resident_order_catalog_item_locations (item_id, location_id)
  SELECT v_id, loc_id
  FROM unnest(COALESCE(p_location_ids, '{}'::uuid[])) AS loc_id
  WHERE loc_id IS NOT NULL
  GROUP BY loc_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_resident_order_catalog_item(uuid, uuid, text, text, numeric, text, boolean, uuid[], uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_resident_order_catalog_item(uuid, uuid, text, text, numeric, text, boolean, uuid[], uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.place_resident_order(
  p_catalog_item_id uuid,
  p_location_id uuid,
  p_quantity integer DEFAULT 1,
  p_contact_name text DEFAULT NULL,
  p_contact_phone text DEFAULT NULL,
  p_contact_email text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid;
  v_item public.resident_order_catalog_items%ROWTYPE;
  v_loc public.cleaning_locations%ROWTYPE;
  v_id uuid;
  v_qty integer := COALESCE(p_quantity, 1);
  v_company_id uuid;
BEGIN
  v_actor := private.resident_order_require_actor();

  IF v_qty < 1 OR v_qty > 99 THEN
    RAISE EXCEPTION 'Nieprawidłowa ilość.';
  END IF;

  IF NOT public.has_active_location_access(p_location_id) THEN
    RAISE EXCEPTION 'Brak dostępu do tego budynku.';
  END IF;

  SELECT * INTO v_loc
  FROM public.cleaning_locations
  WHERE id = p_location_id;

  IF v_loc.id IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono budynku.';
  END IF;

  IF v_loc.community_id IS NULL THEN
    RAISE EXCEPTION 'Budynek nie jest przypisany do wspólnoty.';
  END IF;

  SELECT * INTO v_item
  FROM public.resident_order_catalog_items
  WHERE id = p_catalog_item_id
    AND is_active = true;

  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'Pozycja nie jest dostępna do zamówienia.';
  END IF;

  IF v_item.community_id IS DISTINCT FROM v_loc.community_id THEN
    RAISE EXCEPTION 'Pozycja nie należy do tej wspólnoty.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.resident_order_catalog_item_locations loc WHERE loc.item_id = v_item.id
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.resident_order_catalog_item_locations loc
    WHERE loc.item_id = v_item.id
      AND loc.location_id = p_location_id
  ) THEN
    RAISE EXCEPTION 'Ta pozycja nie jest dostępna w tym budynku.';
  END IF;

  SELECT f.company_id INTO v_company_id
  FROM public.resident_order_catalog_item_fulfillment f
  WHERE f.item_id = v_item.id;

  INSERT INTO public.resident_orders (
    org_id,
    community_id,
    location_id,
    unit_number,
    resident_user_id,
    catalog_item_id,
    item_name,
    item_price_amount,
    item_price_kind,
    quantity,
    contact_name,
    contact_phone,
    contact_email,
    notes,
    status,
    fulfillment_company_id
  )
  VALUES (
    v_loc.org_id,
    v_loc.community_id,
    p_location_id,
    (
      SELECT la.unit_number
      FROM public.location_access la
      WHERE la.location_id = p_location_id
        AND la.user_id = v_actor
        AND (la.expires_at IS NULL OR la.expires_at > now())
      ORDER BY la.created_at DESC NULLS LAST
      LIMIT 1
    ),
    v_actor,
    v_item.id,
    v_item.name,
    v_item.price_amount,
    v_item.price_kind,
    v_qty,
    NULLIF(btrim(p_contact_name), ''),
    NULLIF(btrim(p_contact_phone), ''),
    NULLIF(btrim(p_contact_email), ''),
    NULLIF(btrim(p_notes), ''),
    'pending',
    v_company_id
  )
  RETURNING id INTO v_id;

  PERFORM private.resident_order_append_event(v_id, v_actor, 'created', '{}'::jsonb);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_resident_order_email_payload(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order public.resident_orders%ROWTYPE;
  v_org public.organizations%ROWTYPE;
  v_community public.communities%ROWTYPE;
  v_loc public.cleaning_locations%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_company public.companies%ROWTYPE;
  v_item public.resident_order_catalog_items%ROWTYPE;
  v_subject text;
  v_body text;
BEGIN
  SELECT * INTO v_order FROM public.resident_orders WHERE id = p_order_id;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono zamówienia.';
  END IF;

  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role'
     AND NOT public.can_manage_resident_orders(v_order.org_id) THEN
    RAISE EXCEPTION 'Brak uprawnień do podglądu szablonu zamówienia.';
  END IF;

  SELECT * INTO v_org FROM public.organizations WHERE id = v_order.org_id;
  SELECT * INTO v_community FROM public.communities WHERE id = v_order.community_id;
  SELECT * INTO v_loc FROM public.cleaning_locations WHERE id = v_order.location_id;
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_order.resident_user_id;
  SELECT * INTO v_company FROM public.companies WHERE id = v_order.fulfillment_company_id;
  SELECT * INTO v_item FROM public.resident_order_catalog_items WHERE id = v_order.catalog_item_id;
  SELECT f.email_subject_template, f.email_body_template
  INTO v_subject, v_body
  FROM public.resident_order_catalog_item_fulfillment f
  WHERE f.item_id = v_order.catalog_item_id;

  RETURN jsonb_build_object(
    'orderId', v_order.id,
    'toEmail', COALESCE(v_company.email, ''),
    'toName', COALESCE(v_company.name, ''),
    'subjectTemplate', COALESCE(NULLIF(btrim(v_subject), ''), private.resident_order_default_subject()),
    'bodyTemplate', COALESCE(NULLIF(btrim(v_body), ''), private.resident_order_default_body()),
    'variables', jsonb_build_object(
      'org.name', COALESCE(v_org.name, ''),
      'org.nip', COALESCE(v_org.nip, ''),
      'org.address', concat_ws(', ', NULLIF(v_org.address, ''), NULLIF(v_org.postal_code, ''), NULLIF(v_org.city, '')),
      'org.support_email', COALESCE(v_org.support_email, ''),
      'community.name', COALESCE(v_community.name, ''),
      'community.legal_name', COALESCE(v_community.legal_name, ''),
      'community.nip', COALESCE(v_community.nip, ''),
      'community.board_email', COALESCE(v_community.board_email, ''),
      'building.name', COALESCE(v_loc.name, ''),
      'building.address', COALESCE(v_loc.address, ''),
      'unit.number', COALESCE(v_order.unit_number, ''),
      'resident.full_name', COALESCE(v_profile.full_name, ''),
      'resident.email', COALESCE(v_profile.email, v_profile.contact_email, ''),
      'resident.phone', COALESCE(v_profile.phone, ''),
      'order.id', v_order.id::text,
      'order.notes', COALESCE(v_order.notes, ''),
      'order.quantity', v_order.quantity::text,
      'order.created_at', to_char(v_order.created_at AT TIME ZONE 'Europe/Warsaw', 'YYYY-MM-DD HH24:MI'),
      'order.contact_name', COALESCE(v_order.contact_name, ''),
      'order.contact_phone', COALESCE(v_order.contact_phone, ''),
      'order.contact_email', COALESCE(v_order.contact_email, ''),
      'item.name', COALESCE(v_order.item_name, ''),
      'item.description', COALESCE(v_item.description, ''),
      'item.price_label', private.resident_order_price_label(v_order.item_price_amount, v_order.item_price_kind)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_resident_order_dispatch(
  p_order_id uuid,
  p_company_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid;
  v_order public.resident_orders%ROWTYPE;
  v_company_id uuid;
  v_email text;
BEGIN
  v_actor := private.resident_order_require_actor();

  SELECT * INTO v_order FROM public.resident_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono zamówienia.';
  END IF;

  PERFORM private.resident_order_require_community_management(v_order.community_id);

  IF v_order.status NOT IN ('pending', 'dispatch_failed') THEN
    RAISE EXCEPTION 'Tego zamówienia nie można wysłać do kontrahenta.';
  END IF;

  v_company_id := COALESCE(
    p_company_id,
    v_order.fulfillment_company_id,
    (
      SELECT f.company_id
      FROM public.resident_order_catalog_item_fulfillment f
      WHERE f.item_id = v_order.catalog_item_id
    )
  );

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Przypisz podmiot realizacji zamówień.';
  END IF;

  SELECT c.email INTO v_email FROM public.companies c WHERE c.id = v_company_id;
  IF v_email IS NULL OR btrim(v_email) = '' THEN
    RAISE EXCEPTION 'Wybrana firma nie ma adresu e-mail.';
  END IF;

  UPDATE public.resident_orders
  SET
    status = 'dispatch_queued',
    fulfillment_company_id = v_company_id,
    dispatch_error = NULL
  WHERE id = p_order_id;

  PERFORM private.resident_order_append_event(
    p_order_id,
    v_actor,
    'dispatch_queued',
    jsonb_build_object('company_id', v_company_id)
  );

  RETURN public.get_resident_order_email_payload(p_order_id);
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
