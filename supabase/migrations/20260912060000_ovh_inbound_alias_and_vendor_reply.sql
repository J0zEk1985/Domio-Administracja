-- OVH plus-addressing: mail to local+tag@ lands in local@.
-- Public aliases must therefore be usterki+{module}-{slug}, not {module}+{slug}.
-- Vendor Reply-To uses firmy+t_{token}@domio.com.pl (same plus rule).

UPDATE public.org_inbound_mailboxes
SET alias_local_part = 'usterki+' || module || '-' || split_part(alias_local_part, '+', 2)
WHERE alias_local_part ~ '^(serwis|cleaning|administracja)\+'
  AND alias_local_part !~ '^usterki\+';

CREATE OR REPLACE FUNCTION public.ensure_org_inbound_mailboxes(p_org_id uuid)
RETURNS SETOF public.org_inbound_mailboxes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_slug text;
  v_mod text;
  v_alias text;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'Brak organizacji.';
  END IF;

  IF NOT (SELECT public.is_platform_admin())
     AND NOT (SELECT public.is_org_management(p_org_id)) THEN
    RAISE EXCEPTION 'Brak uprawnień do konfiguracji skrzynek.';
  END IF;

  SELECT lower(regexp_replace(COALESCE(o.slug, ''), '[^a-z0-9]+', '', 'g'))
    INTO v_slug
  FROM public.organizations o
  WHERE o.id = p_org_id;

  IF v_slug IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono organizacji.';
  END IF;

  IF v_slug = '' OR length(v_slug) < 2 THEN
    v_slug := substr(replace(p_org_id::text, '-', ''), 1, 12);
  END IF;

  FOREACH v_mod IN ARRAY ARRAY['serwis', 'cleaning', 'administracja'] LOOP
    v_alias := 'usterki+' || v_mod || '-' || v_slug;
    IF length(v_alias) > 64 THEN
      v_alias := left(v_alias, 64);
    END IF;
    BEGIN
      INSERT INTO public.org_inbound_mailboxes (org_id, module, alias_local_part)
      VALUES (p_org_id, v_mod, v_alias)
      ON CONFLICT (org_id, module) DO NOTHING;
    EXCEPTION
      WHEN unique_violation THEN
        INSERT INTO public.org_inbound_mailboxes (org_id, module, alias_local_part)
        VALUES (
          p_org_id,
          v_mod,
          left(
            'usterki+' || v_mod || '-' || v_slug || substr(replace(p_org_id::text, '-', ''), 1, 6),
            64
          )
        )
        ON CONFLICT (org_id, module) DO NOTHING;
    END;
  END LOOP;

  RETURN QUERY
  SELECT *
  FROM public.org_inbound_mailboxes
  WHERE org_id = p_org_id
  ORDER BY module;
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

  v_reply := 'firmy+t_' || v_dispatch.correlation_token || '@domio.com.pl';

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
