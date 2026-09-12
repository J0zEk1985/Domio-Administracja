-- Reject notices (option A) + wider DOMIO token scan + thread match helpers + manual assign.

CREATE TABLE IF NOT EXISTS public.inbound_reject_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_address text NOT NULL,
  to_alias text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inbound_reject_notices_from_to_idx
  ON public.inbound_reject_notices (from_address, to_alias, created_at DESC);

ALTER TABLE public.inbound_reject_notices ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.vendor_email_inbound_events
  DROP CONSTRAINT IF EXISTS vendor_email_inbound_events_match_method_chk;

ALTER TABLE public.vendor_email_inbound_events
  ADD CONSTRAINT vendor_email_inbound_events_match_method_chk
  CHECK (match_method IN ('token', 'vendor_ref', 'template', 'thread', 'manual', 'unmatched'));

CREATE OR REPLACE FUNCTION private.inbound_looks_like_org_alias(p_alias text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(p_alias, '') ~ '^usterki\+(serwis|cleaning|administracja)-[a-z0-9]';
$$;

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
  IF v IN ('usterki@domio.com.pl', 'firmy@domio.com.pl') THEN
    RETURN true;
  END IF;
  RETURN v ~ '(^|@)(no[-_]?reply|mailer-daemon|postmaster|bounce|noreply)([.@]|$)';
END;
$$;

CREATE OR REPLACE FUNCTION private.vendor_email_extract_token(
  p_to text,
  p_subject text,
  p_body text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_local text;
  v_token text;
  v_blob text;
BEGIN
  v_local := private.inbound_normalize_alias(p_to);
  IF v_local IS NOT NULL THEN
    v_token := substring(v_local from '\+t_([a-z0-9]{12})');
    IF v_token IS NOT NULL THEN
      RETURN v_token;
    END IF;
  END IF;

  v_blob := lower(COALESCE(p_subject, '') || E'\n' || COALESCE(p_body, ''));
  v_token := substring(v_blob from '\[domio[[:space:]]+([a-z0-9]{12})\]');
  IF v_token IS NOT NULL THEN
    RETURN v_token;
  END IF;

  v_token := substring(v_blob from 'domio[[:space:]]+([a-z0-9]{12})');
  IF v_token IS NOT NULL THEN
    RETURN v_token;
  END IF;

  v_token := substring(v_blob from 'ref:[[:space:]]*([a-z0-9]{12})');
  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION private.vendor_email_thread_blob(p_raw jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v text := '';
  v_headers jsonb;
BEGIN
  v := v || ' ' || lower(COALESCE(p_raw->>'inReplyTo', ''));
  v := v || ' ' || lower(COALESCE(p_raw->>'in_reply_to', ''));
  v := v || ' ' || lower(COALESCE(p_raw->>'references', ''));
  IF jsonb_typeof(p_raw->'headers') = 'object' THEN
    v_headers := p_raw->'headers';
    v := v || ' ' || lower(COALESCE(v_headers->>'in-reply-to', ''));
    v := v || ' ' || lower(COALESCE(v_headers->>'In-Reply-To', ''));
    v := v || ' ' || lower(COALESCE(v_headers->>'references', ''));
    v := v || ' ' || lower(COALESCE(v_headers->>'References', ''));
  END IF;
  IF jsonb_typeof(p_raw->'metadata') = 'object' THEN
    v := v || ' ' || lower(COALESCE(p_raw->'metadata'->>'inReplyTo', ''));
    v := v || ' ' || lower(COALESCE(p_raw->'metadata'->>'references', ''));
  END IF;
  RETURN btrim(v);
END;
$$;

CREATE OR REPLACE FUNCTION private.vendor_email_guess_event(p_subject text, p_body text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v text := lower(COALESCE(p_subject, '') || E'\n' || COALESCE(p_body, ''));
BEGIN
  IF v ~ 'zako[nń]cz|wykonan|completed|resolved|gotowe' THEN
    RETURN 'completed';
  END IF;
  IF v ~ 'odrzu|rezygn|nie przyjmu|cancel' THEN
    RETURN 'rejected';
  END IF;
  IF v ~ 'technik|przypisan|assigned' THEN
    RETURN 'assigned_technician';
  END IF;
  IF v ~ 'przyj[eę]|akcept|przyjel' THEN
    RETURN 'accepted';
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_inbound_mailbox(p_to_address text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_alias text := private.inbound_normalize_alias(p_to_address);
  v_box public.org_inbound_mailboxes%ROWTYPE;
  v_limit integer;
  v_used integer;
  v_month date := private.inbound_month_start();
  v_looks boolean;
BEGIN
  v_looks := private.inbound_looks_like_org_alias(v_alias);

  IF v_alias IS NULL THEN
    RETURN jsonb_build_object(
      'found', false,
      'looks_like_org_alias', false,
      'reject_reason', 'unrecognized_recipient'
    );
  END IF;

  SELECT * INTO v_box
  FROM public.org_inbound_mailboxes
  WHERE alias_local_part = v_alias
  LIMIT 1;

  IF v_box.id IS NULL THEN
    RETURN jsonb_build_object(
      'found', false,
      'alias_local_part', v_alias,
      'looks_like_org_alias', v_looks,
      'reject_reason', CASE WHEN v_looks THEN 'unknown_alias' ELSE 'unrecognized_recipient' END
    );
  END IF;

  v_limit := private.inbound_ai_monthly_limit(v_box.org_id);

  SELECT COALESCE(u.parse_count, 0)
    INTO v_used
  FROM public.org_ai_usage_monthly u
  WHERE u.org_id = v_box.org_id
    AND u.year_month = v_month;

  v_used := COALESCE(v_used, 0);

  RETURN jsonb_build_object(
    'found', true,
    'mailbox_id', v_box.id,
    'org_id', v_box.org_id,
    'module', v_box.module,
    'alias_local_part', v_box.alias_local_part,
    'ingest_mode', v_box.ingest_mode,
    'is_enabled', v_box.is_enabled,
    'auto_create_threshold', v_box.auto_create_threshold,
    'has_ai_auto', private.inbound_has_ai_auto(v_box.org_id),
    'ai_parses_limit', v_limit,
    'ai_parses_used', v_used,
    'ai_parses_remaining', GREATEST(v_limit - v_used, 0),
    'allow_ai_parse', (v_box.is_enabled AND GREATEST(v_limit - v_used, 0) > 0),
    'looks_like_org_alias', v_looks,
    'reject_reason', CASE WHEN v_box.is_enabled THEN NULL ELSE 'mailbox_disabled' END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_inbound_reject_notice(
  p_from_address text,
  p_to_address text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_from text := lower(btrim(COALESCE(p_from_address, '')));
  v_email text;
  v_alias text := private.inbound_normalize_alias(p_to_address);
  v_box public.org_inbound_mailboxes%ROWTYPE;
BEGIN
  IF NOT private.vendor_email_is_service_role() THEN
    RAISE EXCEPTION 'Brak uprawnień.';
  END IF;

  v_email := substring(v_from from '<([^>]+)>');
  IF v_email IS NOT NULL THEN
    v_from := lower(btrim(v_email));
  END IF;

  IF private.inbound_is_noreply(v_from) THEN
    RETURN jsonb_build_object('send', false, 'reason', 'noreply');
  END IF;

  IF NOT private.inbound_looks_like_org_alias(v_alias) THEN
    RETURN jsonb_build_object('send', false, 'reason', 'not_org_alias');
  END IF;

  SELECT * INTO v_box
  FROM public.org_inbound_mailboxes
  WHERE alias_local_part = v_alias
  LIMIT 1;

  IF v_box.id IS NOT NULL AND v_box.is_enabled THEN
    RETURN jsonb_build_object('send', false, 'reason', 'mailbox_ok');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inbound_reject_notices n
    WHERE n.from_address = v_from
      AND n.to_alias = v_alias
      AND n.created_at > now() - interval '1 hour'
  ) THEN
    RETURN jsonb_build_object('send', false, 'reason', 'rate_limited');
  END IF;

  INSERT INTO public.inbound_reject_notices (from_address, to_alias)
  VALUES (v_from, v_alias);

  RETURN jsonb_build_object(
    'send', true,
    'reason', CASE WHEN v_box.id IS NULL THEN 'unknown_alias' ELSE 'mailbox_disabled' END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_unmatched_vendor_email(
  p_event_id uuid,
  p_issue_id uuid,
  p_event_type text,
  p_vendor_external_ref text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_event public.vendor_email_inbound_events%ROWTYPE;
  v_issue public.property_issues%ROWTYPE;
  v_dispatch public.issue_email_dispatches%ROWTYPE;
  v_type text := lower(btrim(COALESCE(p_event_type, '')));
  v_ref text := NULLIF(btrim(COALESCE(p_vendor_external_ref, '')), '');
  v_extracted jsonb;
BEGIN
  IF p_event_id IS NULL OR p_issue_id IS NULL THEN
    RAISE EXCEPTION 'Brak identyfikatora wiadomości lub zgłoszenia.';
  END IF;

  IF v_type NOT IN ('accepted', 'assigned_technician', 'completed', 'rejected') THEN
    RAISE EXCEPTION 'Nieobsługiwany typ zdarzenia.';
  END IF;

  SELECT * INTO v_event
  FROM public.vendor_email_inbound_events
  WHERE id = p_event_id
  FOR UPDATE;

  IF v_event.id IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono wiadomości.';
  END IF;

  IF v_event.status NOT IN ('unmatched', 'received') THEN
    RAISE EXCEPTION 'Wiadomość została już obsłużona.';
  END IF;

  SELECT * INTO v_issue FROM public.property_issues WHERE id = p_issue_id;
  IF v_issue.id IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono zgłoszenia.';
  END IF;

  PERFORM private.vendor_email_require_management(v_issue.org_id);

  IF v_event.org_id IS NOT NULL AND v_event.org_id IS DISTINCT FROM v_issue.org_id THEN
    RAISE EXCEPTION 'Wiadomość należy do innej organizacji.';
  END IF;

  SELECT * INTO v_dispatch
  FROM public.issue_email_dispatches
  WHERE issue_id = p_issue_id
  ORDER BY queued_at DESC
  LIMIT 1;

  IF v_dispatch.id IS NULL THEN
    RAISE EXCEPTION 'To zgłoszenie nie ma wątku e-mail.';
  END IF;

  v_extracted := COALESCE(v_event.extracted, '{}'::jsonb);
  IF v_ref IS NOT NULL THEN
    v_extracted := v_extracted || jsonb_build_object('vendor_ticket', v_ref);
  END IF;

  PERFORM private.vendor_email_apply_matched(v_dispatch, v_type, v_extracted);

  UPDATE public.vendor_email_inbound_events
  SET
    org_id = v_dispatch.org_id,
    vendor_id = v_dispatch.vendor_id,
    issue_id = v_dispatch.issue_id,
    dispatch_id = v_dispatch.id,
    matched_event_type = v_type,
    extracted = v_extracted,
    match_method = 'manual',
    status = 'applied',
    error_detail = NULL
  WHERE id = v_event.id;

  RETURN jsonb_build_object(
    'ok', true,
    'issue_id', v_dispatch.issue_id,
    'event_type', v_type
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_inbound_reject_notice(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_inbound_reject_notice(text, text) TO service_role;

REVOKE ALL ON FUNCTION public.assign_unmatched_vendor_email(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_unmatched_vendor_email(uuid, uuid, text, text) TO authenticated;
