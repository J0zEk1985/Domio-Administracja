-- Public QR form is generated from Administracja. Lookup previously required
-- is_maintenance_active, so tokens for admin-only buildings always failed.

CREATE OR REPLACE FUNCTION public.lookup_location_by_public_qr_token(p_token text)
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
  WHERE (cl.status IS NULL OR cl.status IN ('active', 'archived'))
    AND (
      COALESCE(cl.is_admin_active, false) = true
      OR COALESCE(cl.is_maintenance_active, false) = true
    )
    AND (
      (v_uuid IS NOT NULL AND (cl.issue_qr_token = v_uuid OR cl.public_report_token = v_uuid))
      OR (cl.qr_code_token IS NOT NULL AND cl.qr_code_token = v_token)
    )
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.lookup_location_by_public_qr_token(text) IS
  'Resolves a public issue QR token for Serwis /zgloszenie. Accepts buildings enrolled in Administracja or Serwis.';

REVOKE ALL ON FUNCTION public.lookup_location_by_public_qr_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_location_by_public_qr_token(text) TO anon, authenticated;
