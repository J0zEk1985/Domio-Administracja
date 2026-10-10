-- Companies manually attached to a building for issue handoff.
-- Off-site vendors with a contact email are mailed; those without one are refused.

BEGIN;

CREATE TABLE public.location_issue_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.cleaning_locations (id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendor_partners (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT location_issue_vendors_location_vendor_uidx UNIQUE (location_id, vendor_id)
);

COMMENT ON TABLE public.location_issue_vendors IS
  'Vendors attached to a building for manual issue handoff. Distinct from category auto-dispatch.';

CREATE INDEX location_issue_vendors_org_idx
  ON public.location_issue_vendors (org_id);

CREATE INDEX location_issue_vendors_vendor_idx
  ON public.location_issue_vendors (vendor_id);

CREATE OR REPLACE FUNCTION private.tg_location_issue_vendors_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_location_org uuid;
  v_vendor_org uuid;
  v_status text;
BEGIN
  SELECT cl.org_id
  INTO v_location_org
  FROM public.cleaning_locations cl
  WHERE cl.id = NEW.location_id;

  IF v_location_org IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono budynku.';
  END IF;

  SELECT vp.org_id, vp.status
  INTO v_vendor_org, v_status
  FROM public.vendor_partners vp
  WHERE vp.id = NEW.vendor_id;

  IF v_vendor_org IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono partnera.';
  END IF;

  IF v_vendor_org IS DISTINCT FROM v_location_org THEN
    RAISE EXCEPTION 'Partner nie należy do organizacji budynku.';
  END IF;

  IF lower(COALESCE(v_status, '')) = 'inactive' THEN
    RAISE EXCEPTION 'Partner jest nieaktywny.';
  END IF;

  NEW.org_id := v_location_org;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.tg_location_issue_vendors_guard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.tg_location_issue_vendors_guard() TO authenticated, service_role;

DROP TRIGGER IF EXISTS location_issue_vendors_guard ON public.location_issue_vendors;
CREATE TRIGGER location_issue_vendors_guard
  BEFORE INSERT OR UPDATE OF location_id, vendor_id, org_id
  ON public.location_issue_vendors
  FOR EACH ROW
  EXECUTE FUNCTION private.tg_location_issue_vendors_guard();

ALTER TABLE public.location_issue_vendors ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.location_issue_vendors FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.location_issue_vendors TO authenticated;
GRANT ALL ON TABLE public.location_issue_vendors TO service_role;

DROP POLICY IF EXISTS location_issue_vendors_select ON public.location_issue_vendors;
CREATE POLICY location_issue_vendors_select
  ON public.location_issue_vendors
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_platform_admin())
    OR (SELECT public.is_active_org_member(org_id))
  );

DROP POLICY IF EXISTS location_issue_vendors_insert ON public.location_issue_vendors;
CREATE POLICY location_issue_vendors_insert
  ON public.location_issue_vendors
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT public.is_platform_admin())
    OR (SELECT public.is_org_management(org_id))
    OR (SELECT public.is_management_role(org_id))
  );

DROP POLICY IF EXISTS location_issue_vendors_update ON public.location_issue_vendors;
CREATE POLICY location_issue_vendors_update
  ON public.location_issue_vendors
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT public.is_platform_admin())
    OR (SELECT public.is_org_management(org_id))
    OR (SELECT public.is_management_role(org_id))
  )
  WITH CHECK (
    (SELECT public.is_platform_admin())
    OR (SELECT public.is_org_management(org_id))
    OR (SELECT public.is_management_role(org_id))
  );

DROP POLICY IF EXISTS location_issue_vendors_delete ON public.location_issue_vendors;
CREATE POLICY location_issue_vendors_delete
  ON public.location_issue_vendors
  FOR DELETE
  TO authenticated
  USING (
    (SELECT public.is_platform_admin())
    OR (SELECT public.is_org_management(org_id))
    OR (SELECT public.is_management_role(org_id))
  );

-- ---------------------------------------------------------------------------
-- Delegation: attached vendors keep the current channel.
-- A vendor that is not on the building list is mailed when contact_email
-- is present, and refused otherwise.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.vendor_email_queue_for_issue(
  p_issue_id uuid,
  p_vendor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_issue public.property_issues%ROWTYPE;
  v_vendor public.vendor_partners%ROWTYPE;
  v_channel public.vendor_email_channels%ROWTYPE;
  v_dispatch public.issue_email_dispatches%ROWTYPE;
  v_token text;
  v_to text;
  v_tries integer := 0;
  v_linked boolean;
BEGIN
  SELECT * INTO v_issue
  FROM public.property_issues
  WHERE id = p_issue_id
  FOR UPDATE;

  IF v_issue.id IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono zgłoszenia.';
  END IF;

  PERFORM private.vendor_email_require_management(v_issue.org_id);

  SELECT * INTO v_vendor FROM public.vendor_partners WHERE id = p_vendor_id;
  IF v_vendor.id IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono partnera.';
  END IF;
  IF v_vendor.org_id IS DISTINCT FROM v_issue.org_id THEN
    RAISE EXCEPTION 'Partner nie należy do organizacji zgłoszenia.';
  END IF;

  v_linked := v_issue.location_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.location_issue_vendors liv
    WHERE liv.location_id = v_issue.location_id
      AND liv.vendor_id = p_vendor_id
  );

  SELECT * INTO v_channel
  FROM public.vendor_email_channels
  WHERE vendor_id = p_vendor_id;

  v_to := COALESCE(
    NULLIF(btrim(COALESCE(v_channel.outbound_to_email, '')), ''),
    NULLIF(btrim(COALESCE(v_vendor.contact_email, '')), '')
  );

  IF NOT v_linked THEN
    IF v_to IS NULL OR position('@' IN v_to) < 2 THEN
      RAISE EXCEPTION 'ISSUE_VENDOR_OFFSITE_NO_EMAIL';
    END IF;
  ELSE
    IF COALESCE(v_vendor.dispatch_channel, 'in_app') IS DISTINCT FROM 'email' THEN
      RAISE EXCEPTION 'Partner nie obsługuje kanału e-mail.';
    END IF;
    IF v_channel.vendor_id IS NULL OR v_channel.is_enabled IS NOT TRUE THEN
      RAISE EXCEPTION 'Kanał e-mail partnera jest wyłączony albo nieustawiony.';
    END IF;
    IF v_to IS NULL OR position('@' IN v_to) < 2 THEN
      RAISE EXCEPTION 'Partner nie ma adresu e-mail.';
    END IF;
  END IF;

  SELECT * INTO v_dispatch
  FROM public.issue_email_dispatches
  WHERE issue_id = p_issue_id
  FOR UPDATE;

  IF v_dispatch.id IS NULL THEN
    LOOP
      v_tries := v_tries + 1;
      v_token := private.vendor_email_new_token();
      BEGIN
        INSERT INTO public.issue_email_dispatches (
          org_id, issue_id, vendor_id, correlation_token, status, queued_at
        )
        VALUES (
          v_issue.org_id, p_issue_id, p_vendor_id, v_token, 'queued', now()
        )
        RETURNING * INTO v_dispatch;
        EXIT;
      EXCEPTION
        WHEN unique_violation THEN
          IF v_tries >= 8 THEN
            RAISE EXCEPTION 'Nie udało się wygenerować tokenu korelacji.';
          END IF;
      END;
    END LOOP;
  ELSE
    UPDATE public.issue_email_dispatches
    SET
      vendor_id = p_vendor_id,
      status = 'queued',
      dispatch_error = NULL,
      queued_at = now(),
      sent_at = NULL
    WHERE id = v_dispatch.id
    RETURNING * INTO v_dispatch;
    v_token := v_dispatch.correlation_token;
  END IF;

  UPDATE public.property_issues
  SET
    email_dispatch_status = 'queued',
    email_correlation_token = v_token,
    delegated_vendor_id = p_vendor_id,
    status = 'delegated'
  WHERE id = p_issue_id;

  PERFORM private.vendor_email_append_lifecycle(
    v_issue.org_id,
    p_issue_id,
    'email_queued',
    jsonb_build_object(
      'dispatch_id', v_dispatch.id,
      'correlation_token', v_token,
      'vendor_id', p_vendor_id,
      'offsite', NOT v_linked
    )
  );

  RETURN private.vendor_email_build_payload(p_issue_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.delegate_property_issue(p_issue_id uuid, p_vendor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_issue public.property_issues%ROWTYPE;
  v_vendor public.vendor_partners%ROWTYPE;
  v_channel text;
  v_linked boolean;
  v_email text;
BEGIN
  IF (SELECT auth.uid()) IS NULL AND NOT private.vendor_email_is_service_role() THEN
    RAISE EXCEPTION 'ISSUE_AUTH_REQUIRED';
  END IF;
  IF p_vendor_id IS NULL THEN
    RAISE EXCEPTION 'ISSUE_TRANSFER_FIELDS_REQUIRED';
  END IF;

  SELECT * INTO v_issue FROM public.property_issues WHERE id = p_issue_id;
  IF v_issue.id IS NULL THEN
    RAISE EXCEPTION 'ISSUE_NOT_FOUND';
  END IF;

  PERFORM private.vendor_email_require_management(v_issue.org_id);

  SELECT * INTO v_vendor FROM public.vendor_partners WHERE id = p_vendor_id;
  IF v_vendor.id IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono partnera.';
  END IF;
  IF v_vendor.org_id IS DISTINCT FROM v_issue.org_id THEN
    RAISE EXCEPTION 'Partner nie należy do organizacji zgłoszenia.';
  END IF;

  v_linked := v_issue.location_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.location_issue_vendors liv
    WHERE liv.location_id = v_issue.location_id
      AND liv.vendor_id = p_vendor_id
  );

  IF NOT v_linked THEN
    v_email := NULLIF(btrim(COALESCE(v_vendor.contact_email, '')), '');
    IF v_email IS NULL OR position('@' IN v_email) < 2 THEN
      RAISE EXCEPTION 'ISSUE_VENDOR_OFFSITE_NO_EMAIL';
    END IF;
    RETURN private.vendor_email_queue_for_issue(p_issue_id, p_vendor_id)
      || jsonb_build_object('queued', true);
  END IF;

  v_channel := COALESCE(v_vendor.dispatch_channel, 'in_app');

  IF v_channel = 'email' THEN
    RETURN private.vendor_email_queue_for_issue(p_issue_id, p_vendor_id)
      || jsonb_build_object('queued', true);
  END IF;

  UPDATE public.property_issues
  SET
    status = 'delegated',
    delegated_vendor_id = p_vendor_id
  WHERE id = p_issue_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ISSUE_NOT_FOUND';
  END IF;

  RETURN jsonb_build_object(
    'queued', false,
    'issueId', p_issue_id,
    'dispatchId', NULL
  );
END;
$$;

COMMIT;
