-- Per-building switch: public QR issue form may require a logged-in user.

ALTER TABLE public.cleaning_locations
  ADD COLUMN IF NOT EXISTS allow_anonymous_qr_reports boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.cleaning_locations.allow_anonymous_qr_reports IS
  'When true, anyone with the QR link can submit an issue. When false, reporter must be logged in and belong to the org or have location_access.';

DROP FUNCTION IF EXISTS public.lookup_location_by_public_qr_token(text);

CREATE FUNCTION public.lookup_location_by_public_qr_token(p_token text)
RETURNS TABLE (
  id uuid,
  org_id uuid,
  address text,
  allow_anonymous_qr_reports boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text := trim(COALESCE(p_token, ''));
  v_uuid uuid;
BEGIN
  IF length(v_token) < 16 THEN
    RETURN;
  END IF;

  BEGIN
    v_uuid := v_token::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      v_uuid := NULL;
  END;

  RETURN QUERY
  SELECT
    cl.id,
    cl.org_id,
    cl.address,
    COALESCE(cl.allow_anonymous_qr_reports, true)
  FROM public.cleaning_locations cl
  WHERE COALESCE(cl.is_maintenance_active, true) = true
    AND (cl.status IS NULL OR cl.status IN ('active', 'archived'))
    AND (
      (v_uuid IS NOT NULL AND (cl.issue_qr_token = v_uuid OR cl.public_report_token = v_uuid))
      OR (cl.qr_code_token IS NOT NULL AND cl.qr_code_token = v_token)
    )
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.insert_public_qr_issue(
  p_token text,
  p_description text,
  p_reporter_name text,
  p_reporter_phone text,
  p_photos_before text[] DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_location public.cleaning_locations%ROWTYPE;
  v_issue_id uuid;
  v_description text := trim(COALESCE(p_description, ''));
  v_name text := trim(COALESCE(p_reporter_name, ''));
  v_phone text := trim(COALESCE(p_reporter_phone, ''));
BEGIN
  IF length(v_description) < 1 OR length(v_description) > 500 THEN
    RAISE EXCEPTION 'Nieprawidłowy opis zgłoszenia';
  END IF;
  IF length(v_name) < 1 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'Nieprawidłowe imię zgłaszającego';
  END IF;
  IF length(v_phone) < 1 OR length(v_phone) > 40 THEN
    RAISE EXCEPTION 'Nieprawidłowy numer telefonu';
  END IF;

  SELECT cl.*
  INTO v_location
  FROM public.lookup_location_by_public_qr_token(p_token) loc
  JOIN public.cleaning_locations cl ON cl.id = loc.id
  LIMIT 1;

  IF v_location.id IS NULL THEN
    RAISE EXCEPTION 'Nieprawidłowy lub nieaktywny token QR';
  END IF;

  IF COALESCE(v_location.allow_anonymous_qr_reports, true) = false THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'To zgłoszenie wymaga zalogowania';
    END IF;
    IF NOT public.is_org_member(v_location.org_id)
       AND NOT public.has_location_access(v_location.id) THEN
      RAISE EXCEPTION 'Brak uprawnień do zgłoszenia usterki w tym budynku';
    END IF;
  END IF;

  INSERT INTO public.property_issues (
    location_id,
    org_id,
    description,
    reporter_name,
    reporter_phone,
    reporter_type,
    priority,
    status,
    photos_before,
    source,
    reporter_id
  )
  VALUES (
    v_location.id,
    v_location.org_id,
    v_description,
    v_name,
    v_phone,
    'tenant',
    'medium',
    'pending_admin_approval',
    CASE WHEN p_photos_before IS NOT NULL AND cardinality(p_photos_before) > 0 THEN p_photos_before ELSE NULL END,
    'public_qr',
    auth.uid()
  )
  RETURNING id INTO v_issue_id;

  RETURN v_issue_id;
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_location_by_public_qr_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.insert_public_qr_issue(text, text, text, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_location_by_public_qr_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_public_qr_issue(text, text, text, text, text[]) TO anon, authenticated;
