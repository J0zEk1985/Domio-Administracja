-- Layer 3: RPCs for reject / cancel / broadcast / first delegate / B2B transfer.
-- RLS + enforce_property_issue_lifecycle still apply (INVOKER).

CREATE OR REPLACE FUNCTION public.reject_property_issue(p_issue_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_reason text := btrim(COALESCE(p_reason, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'ISSUE_AUTH_REQUIRED';
  END IF;
  IF length(v_reason) < 3 THEN
    RAISE EXCEPTION 'ISSUE_CANCEL_REASON_REQUIRED';
  END IF;

  UPDATE public.property_issues
  SET
    status = 'rejected',
    resolution_notes = v_reason
  WHERE id = p_issue_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ISSUE_NOT_FOUND';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_property_issue(p_issue_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_reason text := btrim(COALESCE(p_reason, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'ISSUE_AUTH_REQUIRED';
  END IF;
  IF length(v_reason) < 3 THEN
    RAISE EXCEPTION 'ISSUE_CANCEL_REASON_REQUIRED';
  END IF;

  UPDATE public.property_issues
  SET
    status = 'cancelled',
    cancel_reason = v_reason
  WHERE id = p_issue_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ISSUE_NOT_FOUND';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_property_issue_cancel(p_issue_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_reason text := btrim(COALESCE(p_reason, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'ISSUE_AUTH_REQUIRED';
  END IF;
  IF length(v_reason) < 3 THEN
    RAISE EXCEPTION 'ISSUE_CANCEL_REASON_REQUIRED';
  END IF;

  UPDATE public.property_issues
  SET
    cancel_requested_at = now(),
    cancel_request_reason = v_reason
  WHERE id = p_issue_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ISSUE_NOT_FOUND';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.broadcast_property_issue(p_issue_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'ISSUE_AUTH_REQUIRED';
  END IF;

  UPDATE public.property_issues
  SET is_public_broadcast = true
  WHERE id = p_issue_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ISSUE_NOT_FOUND';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delegate_property_issue(p_issue_id uuid, p_vendor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'ISSUE_AUTH_REQUIRED';
  END IF;
  IF p_vendor_id IS NULL THEN
    RAISE EXCEPTION 'ISSUE_TRANSFER_FIELDS_REQUIRED';
  END IF;

  UPDATE public.property_issues
  SET
    status = 'delegated',
    delegated_vendor_id = p_vendor_id
  WHERE id = p_issue_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ISSUE_NOT_FOUND';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_property_issue_transfer(
  p_issue_id uuid,
  p_vendor_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_reason text := btrim(COALESCE(p_reason, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'ISSUE_AUTH_REQUIRED';
  END IF;
  IF p_vendor_id IS NULL OR length(v_reason) < 3 THEN
    RAISE EXCEPTION 'ISSUE_TRANSFER_FIELDS_REQUIRED';
  END IF;

  UPDATE public.property_issues
  SET
    is_transfer_requested = true,
    transfer_to_vendor_id = p_vendor_id,
    transfer_reason = v_reason,
    transfer_authorized_at = NULL,
    transfer_authorized_by = NULL
  WHERE id = p_issue_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ISSUE_NOT_FOUND';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.authorize_property_issue_transfer(p_issue_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'ISSUE_AUTH_REQUIRED';
  END IF;

  UPDATE public.property_issues
  SET transfer_authorized_at = now()
  WHERE id = p_issue_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ISSUE_NOT_FOUND';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.decline_property_issue_transfer(p_issue_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'ISSUE_AUTH_REQUIRED';
  END IF;

  UPDATE public.property_issues
  SET is_transfer_requested = false
  WHERE id = p_issue_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ISSUE_NOT_FOUND';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_issue_lifecycle_events(p_issue_id uuid)
RETURNS SETOF public.issue_lifecycle_events
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT *
  FROM public.issue_lifecycle_events
  WHERE issue_id = p_issue_id
  ORDER BY created_at ASC;
$$;

REVOKE ALL ON FUNCTION public.reject_property_issue(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_property_issue(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_property_issue_cancel(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.broadcast_property_issue(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delegate_property_issue(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_property_issue_transfer(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.authorize_property_issue_transfer(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decline_property_issue_transfer(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_issue_lifecycle_events(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.reject_property_issue(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_property_issue(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_property_issue_cancel(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.broadcast_property_issue(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delegate_property_issue(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_property_issue_transfer(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_property_issue_transfer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_property_issue_transfer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_issue_lifecycle_events(uuid) TO authenticated;
