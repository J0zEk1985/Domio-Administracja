-- Contractor status mail for Home catalog orders.
-- A reply counts only when it contains the public order number (ZAM-XXXXXXXX).

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;
GRANT USAGE ON SCHEMA private TO postgres, service_role;

-- ---------------------------------------------------------------------------
-- Public order number
-- ---------------------------------------------------------------------------

ALTER TABLE public.resident_orders
  ADD COLUMN IF NOT EXISTS public_number text;

COMMENT ON COLUMN public.resident_orders.public_number IS
  'Short number printed in the contractor e-mail. Inbound status mail must contain it.';

CREATE OR REPLACE FUNCTION private.resident_order_new_public_number()
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_num text;
  v_i integer;
  v_try integer := 0;
BEGIN
  LOOP
    v_try := v_try + 1;
    v_num := 'ZAM-';
    FOR v_i IN 1..8 LOOP
      v_num := v_num || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::integer, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.resident_orders WHERE public_number = v_num
    );
    IF v_try > 30 THEN
      RAISE EXCEPTION 'Nie udało się wygenerować numeru zamówienia.';
    END IF;
  END LOOP;
  RETURN v_num;
END;
$$;

REVOKE ALL ON FUNCTION private.resident_order_new_public_number() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_id uuid;
BEGIN
  FOR v_id IN
    SELECT id FROM public.resident_orders WHERE public_number IS NULL
  LOOP
    UPDATE public.resident_orders
    SET public_number = private.resident_order_new_public_number()
    WHERE id = v_id;
  END LOOP;
END;
$$;

ALTER TABLE public.resident_orders
  ALTER COLUMN public_number SET NOT NULL;

ALTER TABLE public.resident_orders
  DROP CONSTRAINT IF EXISTS resident_orders_public_number_fmt;

ALTER TABLE public.resident_orders
  ADD CONSTRAINT resident_orders_public_number_fmt
  CHECK (public_number ~ '^ZAM-[A-HJ-NP-Z2-9]{8}$');

CREATE UNIQUE INDEX IF NOT EXISTS resident_orders_public_number_uidx
  ON public.resident_orders (public_number);

-- ---------------------------------------------------------------------------
-- Statuses and history events
-- ---------------------------------------------------------------------------

ALTER TABLE public.resident_orders
  DROP CONSTRAINT IF EXISTS resident_orders_status_check;

ALTER TABLE public.resident_orders
  ADD CONSTRAINT resident_orders_status_check CHECK (
    status = ANY (
      ARRAY[
        'pending'::text,
        'stock_delivery'::text,
        'delivered'::text,
        'ordered_offline'::text,
        'dispatch_queued'::text,
        'dispatch_sent'::text,
        'dispatch_failed'::text,
        'contractor_ready'::text,
        'contractor_rejected'::text,
        'cancelled'::text
      ]
    )
  );

ALTER TABLE public.resident_order_events
  DROP CONSTRAINT IF EXISTS resident_order_events_type_check;

ALTER TABLE public.resident_order_events
  ADD CONSTRAINT resident_order_events_type_check CHECK (
    event_type = ANY (
      ARRAY[
        'created'::text,
        'stock_assigned'::text,
        'handover_completed'::text,
        'ordered_offline'::text,
        'company_changed'::text,
        'dispatch_queued'::text,
        'dispatch_sent'::text,
        'dispatch_failed'::text,
        'contractor_accepted'::text,
        'contractor_ready'::text,
        'contractor_rejected'::text,
        'cancelled'::text
      ]
    )
  );

-- ---------------------------------------------------------------------------
-- Inbound contractor mail log
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.resident_order_inbound_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations (id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.resident_orders (id) ON DELETE SET NULL,
  message_id text NOT NULL,
  public_number_extracted text,
  event_type text,
  status text NOT NULL,
  from_email text,
  subject text,
  body_excerpt text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resident_order_inbound_events_message_uk UNIQUE (message_id),
  CONSTRAINT resident_order_inbound_events_status_chk CHECK (
    status = ANY (ARRAY['applied'::text, 'unmatched'::text, 'duplicate'::text, 'rejected'::text])
  ),
  CONSTRAINT resident_order_inbound_events_event_chk CHECK (
    event_type IS NULL
    OR event_type = ANY (ARRAY['accepted'::text, 'ready'::text, 'rejected'::text])
  )
);

COMMENT ON TABLE public.resident_order_inbound_events IS
  'Idempotent log of contractor status mails for resident orders. Applied only when the public number is present.';

CREATE INDEX IF NOT EXISTS resident_order_inbound_events_org_created_idx
  ON public.resident_order_inbound_events (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS resident_order_inbound_events_order_idx
  ON public.resident_order_inbound_events (order_id)
  WHERE order_id IS NOT NULL;

ALTER TABLE public.resident_order_inbound_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.resident_order_inbound_events FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.resident_order_inbound_events TO authenticated;
GRANT ALL ON TABLE public.resident_order_inbound_events TO service_role;

DROP POLICY IF EXISTS resident_order_inbound_events_select ON public.resident_order_inbound_events;
CREATE POLICY resident_order_inbound_events_select
  ON public.resident_order_inbound_events
  FOR SELECT
  TO authenticated
  USING (
    org_id IS NOT NULL
    AND public.can_manage_resident_orders(org_id)
  );

-- ---------------------------------------------------------------------------
-- Outbound copy: public number is mandatory in the letter
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.resident_order_default_subject()
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT '[DOMIO {{order.number}}] Zamówienie: {{item.name}} — {{building.address}}, lokal {{unit.number}}'::text;
$$;

CREATE OR REPLACE FUNCTION private.resident_order_default_body()
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
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

Numer zamówienia: {{order.number}}
Data: {{order.created_at}}

W odpowiedzi podaj numer zamówienia: {{order.number}}
oraz czy zamówienie jest przyjęte, gotowe albo odrzucone.$t$;
$$;

CREATE OR REPLACE FUNCTION private.resident_order_ensure_number_templates(
  p_subject text,
  p_body text
)
RETURNS TABLE (subject text, body text)
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_subject text := COALESCE(p_subject, '');
  v_body text := COALESCE(p_body, '');
BEGIN
  IF position('{{order.number}}' IN v_subject) = 0 THEN
    v_subject := '[DOMIO {{order.number}}] ' || v_subject;
  END IF;
  IF position('{{order.number}}' IN v_body) = 0 THEN
    v_body := v_body || E'\n\nNumer zamówienia: {{order.number}}\nW odpowiedzi podaj numer zamówienia: {{order.number}}\noraz czy zamówienie jest przyjęte, gotowe albo odrzucone.';
  END IF;
  subject := v_subject;
  body := v_body;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION private.resident_order_ensure_number_templates(text, text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Place order: assign public number
-- ---------------------------------------------------------------------------

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
SET search_path TO 'public', 'private'
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
    fulfillment_company_id,
    public_number
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
    v_company_id,
    private.resident_order_new_public_number()
  )
  RETURNING id INTO v_id;

  PERFORM private.resident_order_append_event(v_id, v_actor, 'created', '{}'::jsonb);
  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Payload for n8n
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_resident_order_email_payload(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'private'
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
  v_tpl record;
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

  v_subject := COALESCE(NULLIF(btrim(v_subject), ''), private.resident_order_default_subject());
  v_body := COALESCE(NULLIF(btrim(v_body), ''), private.resident_order_default_body());

  SELECT t.subject, t.body INTO v_tpl
  FROM private.resident_order_ensure_number_templates(v_subject, v_body) AS t;

  RETURN jsonb_build_object(
    'orderId', v_order.id,
    'publicNumber', v_order.public_number,
    'replyTo', 'usterki+o_' || v_order.public_number || '@domio.com.pl',
    'toEmail', COALESCE(v_company.email, ''),
    'toName', COALESCE(v_company.name, ''),
    'subjectTemplate', v_tpl.subject,
    'bodyTemplate', v_tpl.body,
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
      'order.number', v_order.public_number,
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

  IF v_order.status NOT IN ('pending', 'dispatch_failed', 'contractor_rejected') THEN
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

  IF v_order.status NOT IN ('pending', 'dispatch_failed', 'contractor_ready', 'contractor_rejected') THEN
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

  IF v_order.status NOT IN ('pending', 'dispatch_failed', 'contractor_rejected') THEN
    RAISE EXCEPTION 'Tego zamówienia nie można oznaczyć jako zamówione poza systemem.';
  END IF;

  UPDATE public.resident_orders
  SET status = 'ordered_offline'
  WHERE id = p_order_id;

  PERFORM private.resident_order_append_event(p_order_id, v_actor, 'ordered_offline', '{}'::jsonb);
END;
$$;

-- ---------------------------------------------------------------------------
-- Inbound apply (service_role / n8n only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.resident_order_extract_public_numbers(p_text text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(array_agg(DISTINCT upper(m[1])), '{}'::text[])
  FROM regexp_matches(COALESCE(p_text, ''), '(ZAM-[A-HJ-NP-Z2-9]{8})', 'gi') AS m;
$$;

REVOKE ALL ON FUNCTION private.resident_order_extract_public_numbers(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.resident_order_unquoted_text(p_body text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_line text;
  v_fresh text := '';
BEGIN
  FOR v_line IN
    SELECT regexp_split_to_table(replace(COALESCE(p_body, ''), E'\r', ''), E'\n')
  LOOP
    EXIT WHEN v_line ~ '^\s*>';
    EXIT WHEN v_line ~* '(original message|wiadomo.. oryginalna|napisa[lł]|wrote:)';
    v_fresh := v_fresh || ' ' || v_line;
    EXIT WHEN length(v_fresh) > 4000;
  END LOOP;
  RETURN v_fresh;
END;
$$;

REVOKE ALL ON FUNCTION private.resident_order_unquoted_text(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.resident_order_guess_contractor_event(p_subject text, p_body text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_scan text := lower(COALESCE(p_subject, '') || ' ' || private.resident_order_unquoted_text(p_body));
BEGIN
  IF v_scan ~ '(odrzuc|rezygn|nie[[:space:]]+przyj|anuluj)' THEN
    RETURN 'rejected';
  ELSIF v_scan ~ '(zrealizowan|wykonan|gotow)' THEN
    RETURN 'ready';
  ELSIF v_scan ~ '(przyj|akcept|potwierdz)' THEN
    RETURN 'accepted';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.resident_order_guess_contractor_event(text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.apply_resident_order_email_event(
  p_to_address text,
  p_message_id text,
  p_from_address text,
  p_subject text,
  p_body_text text,
  p_raw_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_message_id text := btrim(COALESCE(p_message_id, ''));
  v_existing public.resident_order_inbound_events%ROWTYPE;
  v_numbers text[];
  v_number text;
  v_order public.resident_orders%ROWTYPE;
  v_event text;
  v_status text;
  v_from text := NULLIF(lower(btrim(COALESCE(p_from_address, ''))), '');
  v_excerpt text := left(btrim(COALESCE(p_body_text, '')), 500);
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Brak uprawnień.';
  END IF;

  IF v_message_id = '' OR length(v_message_id) > 998 THEN
    RAISE EXCEPTION 'Brak lub nieprawidłowy Message-ID';
  END IF;

  SELECT * INTO v_existing
  FROM public.resident_order_inbound_events
  WHERE message_id = v_message_id;

  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'duplicate',
      'order_id', v_existing.order_id,
      'public_number', v_existing.public_number_extracted,
      'event_type', v_existing.event_type
    );
  END IF;

  v_numbers := private.resident_order_extract_public_numbers(
    COALESCE(p_to_address, '') || ' ' || COALESCE(p_subject, '') || ' ' || COALESCE(p_body_text, '')
  );

  IF COALESCE(array_length(v_numbers, 1), 0) <> 1 THEN
    INSERT INTO public.resident_order_inbound_events (
      message_id, public_number_extracted, status, from_email, subject, body_excerpt
    )
    VALUES (
      v_message_id,
      NULL,
      'unmatched',
      v_from,
      left(COALESCE(p_subject, ''), 500),
      v_excerpt
    );
    RETURN jsonb_build_object('status', 'unmatched', 'reason', 'order_number');
  END IF;

  v_number := v_numbers[1];

  SELECT * INTO v_order
  FROM public.resident_orders
  WHERE public_number = v_number
  FOR UPDATE;

  v_event := private.resident_order_guess_contractor_event(p_subject, p_body_text);

  IF v_order.id IS NULL OR v_event IS NULL THEN
    INSERT INTO public.resident_order_inbound_events (
      org_id, order_id, message_id, public_number_extracted, event_type, status, from_email, subject, body_excerpt
    )
    VALUES (
      v_order.org_id,
      v_order.id,
      v_message_id,
      v_number,
      v_event,
      'unmatched',
      v_from,
      left(COALESCE(p_subject, ''), 500),
      v_excerpt
    );
    RETURN jsonb_build_object(
      'status', 'unmatched',
      'public_number', v_number,
      'order_id', v_order.id,
      'reason', CASE WHEN v_order.id IS NULL THEN 'unknown_order' ELSE 'event_type' END
    );
  END IF;

  IF v_order.status IN ('delivered', 'cancelled', 'ordered_offline') THEN
    v_status := 'rejected';
  ELSE
    v_status := 'applied';
    IF v_event = 'accepted' THEN
      IF v_order.status IS DISTINCT FROM 'contractor_ready' THEN
        UPDATE public.resident_orders
        SET status = 'dispatch_sent',
            dispatched_at = COALESCE(dispatched_at, now()),
            dispatch_error = NULL
        WHERE id = v_order.id;
      END IF;
      PERFORM private.resident_order_append_event(
        v_order.id, NULL, 'contractor_accepted',
        jsonb_build_object('public_number', v_number, 'from', v_from)
      );
    ELSIF v_event = 'ready' THEN
      UPDATE public.resident_orders
      SET status = 'contractor_ready', dispatch_error = NULL
      WHERE id = v_order.id;
      PERFORM private.resident_order_append_event(
        v_order.id, NULL, 'contractor_ready',
        jsonb_build_object('public_number', v_number, 'from', v_from)
      );
    ELSIF v_event = 'rejected' THEN
      UPDATE public.resident_orders
      SET status = 'contractor_rejected', dispatch_error = NULL
      WHERE id = v_order.id;
      PERFORM private.resident_order_append_event(
        v_order.id, NULL, 'contractor_rejected',
        jsonb_build_object('public_number', v_number, 'from', v_from)
      );
    END IF;
  END IF;

  INSERT INTO public.resident_order_inbound_events (
    org_id, order_id, message_id, public_number_extracted, event_type, status, from_email, subject, body_excerpt
  )
  VALUES (
    v_order.org_id,
    v_order.id,
    v_message_id,
    v_number,
    v_event,
    v_status,
    v_from,
    left(COALESCE(p_subject, ''), 500),
    v_excerpt
  );

  RETURN jsonb_build_object(
    'status', v_status,
    'order_id', v_order.id,
    'public_number', v_number,
    'event_type', v_event
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_resident_order_email_event(text, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_resident_order_email_event(text, text, text, text, text, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
