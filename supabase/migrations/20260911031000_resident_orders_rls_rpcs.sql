-- Resident orders: RLS, storage object policies, and SECURITY DEFINER RPCs.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;
GRANT USAGE ON SCHEMA private TO postgres, service_role;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.has_active_location_access(target_location_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.location_access la
    WHERE la.location_id = target_location_id
      AND la.user_id = (SELECT auth.uid())
      AND (la.expires_at IS NULL OR la.expires_at > now())
  );
$$;

REVOKE ALL ON FUNCTION public.has_active_location_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_active_location_access(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_resident_orders(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_org_management(p_org_id) OR public.is_management_role(p_org_id);
$$;

CREATE OR REPLACE FUNCTION public.can_handover_resident_orders(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.can_manage_resident_orders(p_org_id)
    OR public.is_serwis_technician_role(p_org_id);
$$;

CREATE OR REPLACE FUNCTION public.resident_can_see_catalog_item(p_item_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.resident_order_catalog_items i
    JOIN public.cleaning_locations cl ON cl.community_id = i.community_id
    JOIN public.location_access la ON la.location_id = cl.id
    WHERE i.id = p_item_id
      AND i.is_active = true
      AND la.user_id = (SELECT auth.uid())
      AND (la.expires_at IS NULL OR la.expires_at > now())
      AND (
        NOT EXISTS (
          SELECT 1
          FROM public.resident_order_catalog_item_locations loc
          WHERE loc.item_id = i.id
        )
        OR EXISTS (
          SELECT 1
          FROM public.resident_order_catalog_item_locations loc
          WHERE loc.item_id = i.id
            AND loc.location_id = la.location_id
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_resident_orders(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_handover_resident_orders(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resident_can_see_catalog_item(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_resident_orders(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_handover_resident_orders(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resident_can_see_catalog_item(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.resident_order_default_subject()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'Zamówienie: {{item.name}} — {{building.address}}, lokal {{unit.number}}'::text;
$$;

CREATE OR REPLACE FUNCTION private.resident_order_default_body()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT $t$Dzień dobry,

Prosimy o realizację zamówienia złożonego przez mieszkańca.

Administracja
{{org.name}}
NIP: {{org.nip}}
Adres: {{org.address}}
E-mail: {{org.support_email}}

Wspólnota
{{community.name}}
{{community.legal_name}}
NIP: {{community.nip}}
E-mail zarządu: {{community.board_email}}

Budynek i lokal
{{building.name}}
{{building.address}}
Lokal: {{unit.number}}

Zamawiający
{{resident.full_name}}
E-mail: {{resident.email}}
Telefon: {{resident.phone}}

Kontakt dla realizacji (opcjonalny)
{{order.contact_name}}
{{order.contact_phone}}
{{order.contact_email}}

Pozycja
{{item.name}}
{{item.description}}
Ilość: {{order.quantity}}
Cena: {{item.price_label}}

Uwagi
{{order.notes}}

Numer zamówienia: {{order.id}}
Data: {{order.created_at}}$t$;
$$;

CREATE OR REPLACE FUNCTION private.resident_order_require_actor()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Brak sesji.';
  END IF;
  RETURN v_actor;
END;
$$;

CREATE OR REPLACE FUNCTION private.resident_order_require_community_management(p_community_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
BEGIN
  PERFORM private.resident_order_require_actor();

  SELECT c.org_id INTO v_org
  FROM public.communities c
  WHERE c.id = p_community_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono wspólnoty.';
  END IF;

  IF NOT public.can_manage_resident_orders(v_org) THEN
    RAISE EXCEPTION 'Brak uprawnień do zarządzania zamówieniami tej wspólnoty.';
  END IF;

  RETURN v_org;
END;
$$;

CREATE OR REPLACE FUNCTION private.resident_order_price_label(p_amount numeric, p_kind text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_amount IS NULL THEN ''
    WHEN p_kind = 'approximate' THEN 'ok. ' || trim(to_char(p_amount, 'FM999999990.00')) || ' zł'
    ELSE trim(to_char(p_amount, 'FM999999990.00')) || ' zł'
  END;
$$;

CREATE OR REPLACE FUNCTION private.resident_order_append_event(
  p_order_id uuid,
  p_actor_id uuid,
  p_event_type text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.resident_order_events (order_id, actor_id, event_type, payload)
  VALUES (p_order_id, p_actor_id, p_event_type, COALESCE(p_payload, '{}'::jsonb));
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS resident_order_catalog_items_select ON public.resident_order_catalog_items;
CREATE POLICY resident_order_catalog_items_select
  ON public.resident_order_catalog_items
  FOR SELECT
  TO authenticated
  USING (
    public.can_manage_resident_orders(org_id)
    OR (
      is_active = true
      AND public.resident_can_see_catalog_item(id)
    )
  );

DROP POLICY IF EXISTS resident_order_catalog_items_write ON public.resident_order_catalog_items;
CREATE POLICY resident_order_catalog_items_insert
  ON public.resident_order_catalog_items
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_resident_orders(org_id));

CREATE POLICY resident_order_catalog_items_update
  ON public.resident_order_catalog_items
  FOR UPDATE
  TO authenticated
  USING (public.can_manage_resident_orders(org_id))
  WITH CHECK (public.can_manage_resident_orders(org_id));

CREATE POLICY resident_order_catalog_items_delete
  ON public.resident_order_catalog_items
  FOR DELETE
  TO authenticated
  USING (public.can_manage_resident_orders(org_id));

DROP POLICY IF EXISTS resident_order_catalog_item_locations_select ON public.resident_order_catalog_item_locations;
CREATE POLICY resident_order_catalog_item_locations_select
  ON public.resident_order_catalog_item_locations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.resident_order_catalog_items i
      WHERE i.id = item_id
        AND (
          public.can_manage_resident_orders(i.org_id)
          OR public.resident_can_see_catalog_item(i.id)
        )
    )
  );

CREATE POLICY resident_order_catalog_item_locations_insert
  ON public.resident_order_catalog_item_locations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.resident_order_catalog_items i
      WHERE i.id = item_id
        AND public.can_manage_resident_orders(i.org_id)
    )
  );

CREATE POLICY resident_order_catalog_item_locations_delete
  ON public.resident_order_catalog_item_locations
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.resident_order_catalog_items i
      WHERE i.id = item_id
        AND public.can_manage_resident_orders(i.org_id)
    )
  );

DROP POLICY IF EXISTS resident_order_settings_select ON public.resident_order_settings;
CREATE POLICY resident_order_settings_select
  ON public.resident_order_settings
  FOR SELECT
  TO authenticated
  USING (public.can_manage_resident_orders(org_id));

CREATE POLICY resident_order_settings_insert
  ON public.resident_order_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_resident_orders(org_id));

CREATE POLICY resident_order_settings_update
  ON public.resident_order_settings
  FOR UPDATE
  TO authenticated
  USING (public.can_manage_resident_orders(org_id))
  WITH CHECK (public.can_manage_resident_orders(org_id));

DROP POLICY IF EXISTS resident_orders_select ON public.resident_orders;
CREATE POLICY resident_orders_select
  ON public.resident_orders
  FOR SELECT
  TO authenticated
  USING (
    resident_user_id = (SELECT auth.uid())
    OR public.can_manage_resident_orders(org_id)
    OR (
      public.can_handover_resident_orders(org_id)
      AND status IN ('stock_delivery', 'delivered')
    )
  );

DROP POLICY IF EXISTS resident_order_events_select ON public.resident_order_events;
CREATE POLICY resident_order_events_select
  ON public.resident_order_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.resident_orders o
      WHERE o.id = order_id
        AND (
          o.resident_user_id = (SELECT auth.uid())
          OR public.can_manage_resident_orders(o.org_id)
          OR (
            public.can_handover_resident_orders(o.org_id)
            AND o.status IN ('stock_delivery', 'delivered')
          )
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Storage: path {orgId}/{orderId}/...
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_access_resident_order_photo(p_name text, p_write boolean)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
  v_order uuid;
  v_status text;
BEGIN
  BEGIN
    v_org := NULLIF(split_part(p_name, '/', 1), '')::uuid;
    v_order := NULLIF(split_part(p_name, '/', 2), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;

  IF v_org IS NULL OR v_order IS NULL THEN
    RETURN false;
  END IF;

  SELECT o.status INTO v_status
  FROM public.resident_orders o
  WHERE o.id = v_order
    AND o.org_id = v_org;

  IF v_status IS NULL THEN
    RETURN false;
  END IF;

  IF p_write THEN
    RETURN
      public.can_handover_resident_orders(v_org)
      AND v_status = 'stock_delivery';
  END IF;

  RETURN
    public.can_manage_resident_orders(v_org)
    OR public.can_handover_resident_orders(v_org)
    OR EXISTS (
      SELECT 1
      FROM public.resident_orders o
      WHERE o.id = v_order
        AND o.resident_user_id = (SELECT auth.uid())
    );
END;
$$;

REVOKE ALL ON FUNCTION public.can_access_resident_order_photo(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_resident_order_photo(text, boolean) TO authenticated;

DROP POLICY IF EXISTS resident_order_photos_select ON storage.objects;
CREATE POLICY resident_order_photos_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'resident-order-photos'
    AND (SELECT public.can_access_resident_order_photo(name, false))
  );

DROP POLICY IF EXISTS resident_order_photos_insert ON storage.objects;
CREATE POLICY resident_order_photos_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'resident-order-photos'
    AND (SELECT public.can_access_resident_order_photo(name, true))
  );

DROP POLICY IF EXISTS resident_order_photos_update ON storage.objects;
CREATE POLICY resident_order_photos_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'resident-order-photos'
    AND (SELECT public.can_access_resident_order_photo(name, true))
  )
  WITH CHECK (
    bucket_id = 'resident-order-photos'
    AND (SELECT public.can_access_resident_order_photo(name, true))
  );

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_resident_order_settings(p_community_id uuid)
RETURNS public.resident_order_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
  v_row public.resident_order_settings;
BEGIN
  v_org := private.resident_order_require_community_management(p_community_id);

  INSERT INTO public.resident_order_settings (
    community_id,
    org_id,
    email_subject_template,
    email_body_template,
    updated_by
  )
  VALUES (
    p_community_id,
    v_org,
    private.resident_order_default_subject(),
    private.resident_order_default_body(),
    (SELECT auth.uid())
  )
  ON CONFLICT (community_id) DO NOTHING;

  SELECT * INTO v_row
  FROM public.resident_order_settings
  WHERE community_id = p_community_id;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_resident_order_settings(
  p_community_id uuid,
  p_default_company_id uuid,
  p_email_subject_template text,
  p_email_body_template text
)
RETURNS public.resident_order_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
  v_row public.resident_order_settings;
BEGIN
  v_org := private.resident_order_require_community_management(p_community_id);

  IF p_default_company_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.companies c WHERE c.id = p_default_company_id
  ) THEN
    RAISE EXCEPTION 'Nie znaleziono firmy.';
  END IF;

  INSERT INTO public.resident_order_settings (
    community_id,
    org_id,
    default_company_id,
    email_subject_template,
    email_body_template,
    updated_by
  )
  VALUES (
    p_community_id,
    v_org,
    p_default_company_id,
    btrim(p_email_subject_template),
    btrim(p_email_body_template),
    (SELECT auth.uid())
  )
  ON CONFLICT (community_id) DO UPDATE
  SET
    default_company_id = EXCLUDED.default_company_id,
    email_subject_template = EXCLUDED.email_subject_template,
    email_body_template = EXCLUDED.email_body_template,
    updated_by = EXCLUDED.updated_by;

  SELECT * INTO v_row
  FROM public.resident_order_settings
  WHERE community_id = p_community_id;

  RETURN v_row;
END;
$$;

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
    status
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
    'pending'
  )
  RETURNING id INTO v_id;

  PERFORM private.resident_order_append_event(v_id, v_actor, 'created', '{}'::jsonb);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_resident_order_stock_delivery(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid;
  v_order public.resident_orders%ROWTYPE;
BEGIN
  v_actor := private.resident_order_require_actor();

  SELECT * INTO v_order FROM public.resident_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono zamówienia.';
  END IF;

  PERFORM private.resident_order_require_community_management(v_order.community_id);

  IF v_order.status NOT IN ('pending', 'dispatch_failed') THEN
    RAISE EXCEPTION 'Tego zamówienia nie można przekazać ze stanu.';
  END IF;

  UPDATE public.resident_orders
  SET status = 'stock_delivery'
  WHERE id = p_order_id;

  PERFORM private.resident_order_append_event(p_order_id, v_actor, 'stock_assigned', '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_resident_order_offline(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid;
  v_order public.resident_orders%ROWTYPE;
BEGIN
  v_actor := private.resident_order_require_actor();

  SELECT * INTO v_order FROM public.resident_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono zamówienia.';
  END IF;

  PERFORM private.resident_order_require_community_management(v_order.community_id);

  IF v_order.status NOT IN ('pending', 'dispatch_failed') THEN
    RAISE EXCEPTION 'Tego zamówienia nie można oznaczyć jako zamówione poza systemem.';
  END IF;

  UPDATE public.resident_orders
  SET status = 'ordered_offline'
  WHERE id = p_order_id;

  PERFORM private.resident_order_append_event(p_order_id, v_actor, 'ordered_offline', '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_resident_order_company(p_order_id uuid, p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid;
  v_order public.resident_orders%ROWTYPE;
BEGIN
  v_actor := private.resident_order_require_actor();

  SELECT * INTO v_order FROM public.resident_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono zamówienia.';
  END IF;

  PERFORM private.resident_order_require_community_management(v_order.community_id);

  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'Wybierz firmę.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = p_company_id) THEN
    RAISE EXCEPTION 'Nie znaleziono firmy.';
  END IF;

  UPDATE public.resident_orders
  SET fulfillment_company_id = p_company_id
  WHERE id = p_order_id;

  PERFORM private.resident_order_append_event(
    p_order_id,
    v_actor,
    'company_changed',
    jsonb_build_object(
      'from_company_id', v_order.fulfillment_company_id,
      'to_company_id', p_company_id
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_resident_order_handover(
  p_order_id uuid,
  p_photo_urls text[] DEFAULT '{}'::text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid;
  v_order public.resident_orders%ROWTYPE;
BEGIN
  v_actor := private.resident_order_require_actor();

  SELECT * INTO v_order FROM public.resident_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono zamówienia.';
  END IF;

  IF NOT public.can_handover_resident_orders(v_order.org_id) THEN
    RAISE EXCEPTION 'Brak uprawnień do potwierdzenia przekazania.';
  END IF;

  IF v_order.status IS DISTINCT FROM 'stock_delivery' THEN
    RAISE EXCEPTION 'To zamówienie nie czeka na przekazanie.';
  END IF;

  UPDATE public.resident_orders
  SET
    status = 'delivered',
    handed_over_at = now(),
    handed_over_by = v_actor,
    handover_photo_urls = COALESCE(p_photo_urls, '{}'::text[])
  WHERE id = p_order_id;

  PERFORM private.resident_order_append_event(
    p_order_id,
    v_actor,
    'handover_completed',
    jsonb_build_object('photo_urls', to_jsonb(COALESCE(p_photo_urls, '{}'::text[])))
  );
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
  v_settings public.resident_order_settings%ROWTYPE;
  v_org public.organizations%ROWTYPE;
  v_community public.communities%ROWTYPE;
  v_loc public.cleaning_locations%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_company public.companies%ROWTYPE;
  v_item public.resident_order_catalog_items%ROWTYPE;
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
  SELECT * INTO v_settings FROM public.resident_order_settings WHERE community_id = v_order.community_id;
  SELECT * INTO v_company FROM public.companies WHERE id = v_order.fulfillment_company_id;
  SELECT * INTO v_item FROM public.resident_order_catalog_items WHERE id = v_order.catalog_item_id;

  RETURN jsonb_build_object(
    'orderId', v_order.id,
    'toEmail', COALESCE(v_company.email, ''),
    'toName', COALESCE(v_company.name, ''),
    'subjectTemplate', COALESCE(v_settings.email_subject_template, private.resident_order_default_subject()),
    'bodyTemplate', COALESCE(v_settings.email_body_template, private.resident_order_default_body()),
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
      SELECT s.default_company_id
      FROM public.resident_order_settings s
      WHERE s.community_id = v_order.community_id
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

CREATE OR REPLACE FUNCTION public.mark_resident_order_dispatched(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order public.resident_orders%ROWTYPE;
  v_actor uuid := (SELECT auth.uid());
BEGIN
  SELECT * INTO v_order FROM public.resident_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono zamówienia.';
  END IF;

  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role'
     AND NOT public.can_manage_resident_orders(v_order.org_id) THEN
    RAISE EXCEPTION 'Brak uprawnień.';
  END IF;

  UPDATE public.resident_orders
  SET
    status = 'dispatch_sent',
    dispatched_at = now(),
    dispatch_error = NULL
  WHERE id = p_order_id;

  PERFORM private.resident_order_append_event(p_order_id, v_actor, 'dispatch_sent', '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_resident_order_dispatch_failed(p_order_id uuid, p_error text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order public.resident_orders%ROWTYPE;
  v_actor uuid := (SELECT auth.uid());
BEGIN
  SELECT * INTO v_order FROM public.resident_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono zamówienia.';
  END IF;

  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role'
     AND NOT public.can_manage_resident_orders(v_order.org_id) THEN
    RAISE EXCEPTION 'Brak uprawnień.';
  END IF;

  UPDATE public.resident_orders
  SET
    status = 'dispatch_failed',
    dispatch_error = NULLIF(btrim(COALESCE(p_error, '')), '')
  WHERE id = p_order_id;

  PERFORM private.resident_order_append_event(
    p_order_id,
    v_actor,
    'dispatch_failed',
    jsonb_build_object('error', COALESCE(p_error, ''))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_resident_order_settings(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_resident_order_settings(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.place_resident_order(uuid, uuid, integer, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_resident_order_stock_delivery(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_resident_order_offline(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_resident_order_company(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_resident_order_handover(uuid, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_resident_order_email_payload(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.queue_resident_order_dispatch(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_resident_order_dispatched(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_resident_order_dispatch_failed(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.ensure_resident_order_settings(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_resident_order_settings(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.place_resident_order(uuid, uuid, integer, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_resident_order_stock_delivery(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_resident_order_offline(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_resident_order_company(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_resident_order_handover(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_resident_order_email_payload(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.queue_resident_order_dispatch(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_resident_order_dispatched(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_resident_order_dispatch_failed(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_resident_order_email_payload(uuid) TO service_role;
