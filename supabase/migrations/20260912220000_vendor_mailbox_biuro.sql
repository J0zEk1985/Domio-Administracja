-- Replace firmy@ with biuro@ for vendor B2B mail and keep firmy@ as a legacy noreply sender.

CREATE OR REPLACE FUNCTION private.inbound_is_noreply(p_from text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v text := lower(btrim(COALESCE(p_from, '')));
  v_email text;
BEGIN
  v_email := substring(v from '<([^>]+)>');
  IF v_email IS NOT NULL THEN
    v := lower(btrim(v_email));
  END IF;
  v := regexp_replace(v, '[<>"]', '', 'g');
  IF v = '' THEN
    RETURN true;
  END IF;
  IF v IN (
    'usterki@domio.com.pl',
    'firmy@domio.com.pl',
    'biuro@domio.com.pl'
  ) THEN
    RETURN true;
  END IF;
  RETURN v ~ '(^|@)(no[-_]?reply|mailer-daemon|postmaster|bounce|noreply)([.@]|$)';
END;
$$;

CREATE OR REPLACE FUNCTION private.vendor_email_build_payload(p_issue_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_issue public.property_issues%ROWTYPE;
  v_dispatch public.issue_email_dispatches%ROWTYPE;
  v_channel public.vendor_email_channels%ROWTYPE;
  v_vendor public.vendor_partners%ROWTYPE;
  v_org public.organizations%ROWTYPE;
  v_loc public.cleaning_locations%ROWTYPE;
  v_to text;
  v_reply text;
BEGIN
  SELECT * INTO v_issue FROM public.property_issues WHERE id = p_issue_id;
  IF v_issue.id IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono zgłoszenia.';
  END IF;

  SELECT * INTO v_dispatch
  FROM public.issue_email_dispatches
  WHERE issue_id = p_issue_id;

  IF v_dispatch.id IS NULL THEN
    RAISE EXCEPTION 'Brak wątku wysyłki e-mail dla zgłoszenia.';
  END IF;

  SELECT * INTO v_channel
  FROM public.vendor_email_channels
  WHERE vendor_id = v_dispatch.vendor_id;

  SELECT * INTO v_vendor FROM public.vendor_partners WHERE id = v_dispatch.vendor_id;
  SELECT * INTO v_org FROM public.organizations WHERE id = v_issue.org_id;
  SELECT * INTO v_loc FROM public.cleaning_locations WHERE id = v_issue.location_id;

  v_to := COALESCE(
    NULLIF(btrim(COALESCE(v_channel.outbound_to_email, '')), ''),
    NULLIF(btrim(COALESCE(v_vendor.contact_email, '')), '')
  );

  v_reply := 'biuro+t_' || v_dispatch.correlation_token || '@domio.com.pl';

  RETURN jsonb_build_object(
    'dispatchId', v_dispatch.id,
    'issueId', v_issue.id,
    'toEmail', COALESCE(v_to, ''),
    'toName', COALESCE(v_vendor.name, ''),
    'cc', to_jsonb(COALESCE(v_channel.outbound_cc, '{}'::text[])),
    'replyTo', v_reply,
    'subjectTemplate', COALESCE(
      v_channel.outbound_subject_template,
      private.vendor_email_default_subject()
    ),
    'bodyTemplate', COALESCE(
      v_channel.outbound_body_template,
      private.vendor_email_default_body()
    ),
    'variables', jsonb_build_object(
      'issue.id', v_issue.id::text,
      'issue.token', v_dispatch.correlation_token,
      'issue.description', COALESCE(v_issue.description, ''),
      'issue.category', COALESCE(v_issue.category, ''),
      'issue.priority', COALESCE(v_issue.priority::text, ''),
      'building.name', COALESCE(v_loc.name, ''),
      'building.address', COALESCE(v_loc.address, ''),
      'org.name', COALESCE(v_org.name, ''),
      'reporter.name', COALESCE(v_issue.reporter_name, ''),
      'reporter.phone', COALESCE(v_issue.reporter_phone, '')
    )
  );
END;
$$;

UPDATE public.page_content
SET content_value = 'biuro@domio.com.pl'
WHERE content_key = 'contact_email'
  AND btrim(COALESCE(content_value, '')) = '';
