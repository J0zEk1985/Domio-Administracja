-- WARSTWA 3: RPC dyżuru, pogotowia 24h oraz joby Web Push dla n8n.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;
GRANT USAGE ON SCHEMA private TO postgres, service_role;

-- ---------------------------------------------------------------------------
-- Resolve Serwis org for a building / issue
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.resolve_serwis_org_for_issue(p_issue_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
  v_location uuid;
  v_claimed uuid;
  v_master uuid;
  v_legal uuid;
BEGIN
  SELECT i.claimed_by_org_id, i.location_id
  INTO v_claimed, v_location
  FROM public.property_issues i
  WHERE i.id = p_issue_id;

  IF v_claimed IS NOT NULL THEN
    RETURN v_claimed;
  END IF;

  IF v_location IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT cl.location_master_id, c.legal_entity_id
  INTO v_master, v_legal
  FROM public.cleaning_locations cl
  LEFT JOIN public.communities c ON c.id = cl.community_id
  WHERE cl.id = v_location;

  IF v_master IS NOT NULL THEN
    SELECT bcl.maintenance_org_id
    INTO v_org
    FROM public.building_cooperation_links bcl
    WHERE bcl.location_master_id = v_master
      AND bcl.status = 'active'
      AND bcl.maintenance_org_id IS NOT NULL
    LIMIT 1;
    IF v_org IS NOT NULL THEN
      RETURN v_org;
    END IF;
  END IF;

  IF v_legal IS NOT NULL THEN
    SELECT sm.org_id
    INTO v_org
    FROM public.service_mandates sm
    WHERE sm.community_legal_entity_id = v_legal
      AND sm.module = 'maintenance'
      AND sm.status = 'active'
      AND sm.org_id IS NOT NULL
      AND (sm.valid_until IS NULL OR sm.valid_until > now())
      AND (
        sm.location_master_id IS NULL
        OR sm.location_master_id = v_master
      )
    ORDER BY sm.location_master_id NULLS LAST
    LIMIT 1;
    IF v_org IS NOT NULL THEN
      RETURN v_org;
    END IF;
  END IF;

  SELECT i.org_id
  INTO v_org
  FROM public.property_issues i
  JOIN public.org_duty_state d ON d.org_id = i.org_id AND d.is_duty_enabled
  WHERE i.id = p_issue_id;

  RETURN v_org;
END;
$$;

CREATE OR REPLACE FUNCTION private.try_dispatch_duty_alert(p_issue_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_issue public.property_issues%ROWTYPE;
  v_serwis uuid;
  v_duty public.org_duty_state%ROWTYPE;
  v_existing uuid;
  v_alert uuid;
  v_urgent boolean;
BEGIN
  SELECT * INTO v_issue
  FROM public.property_issues
  WHERE id = p_issue_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ISSUE_NOT_FOUND');
  END IF;

  IF COALESCE(v_issue.emergency_mode, false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'DUTY_SKIP_EMERGENCY');
  END IF;

  IF v_issue.status IS DISTINCT FROM 'open' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'DUTY_SKIP_STATUS');
  END IF;

  v_urgent :=
    COALESCE(v_issue.immediate_fulfillment, false)
    OR v_issue.priority IN ('high', 'critical');

  IF NOT v_urgent THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'DUTY_SKIP_PRIORITY');
  END IF;

  SELECT a.id INTO v_existing
  FROM public.duty_alerts a
  WHERE a.issue_id = p_issue_id;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'alert_id', v_existing, 'already', true);
  END IF;

  v_serwis := private.resolve_serwis_org_for_issue(p_issue_id);
  IF v_serwis IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'DUTY_NO_SERWIS_ORG');
  END IF;

  SELECT * INTO v_duty
  FROM public.org_duty_state
  WHERE org_id = v_serwis;

  IF NOT FOUND OR NOT v_duty.is_duty_enabled OR v_duty.active_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'DUTY_NOT_ENABLED');
  END IF;

  IF v_issue.assigned_staff_id IS NOT NULL
     AND v_issue.assigned_staff_id IS DISTINCT FROM v_duty.active_user_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'DUTY_ALREADY_ASSIGNED');
  END IF;

  UPDATE public.property_issues
  SET
    assigned_staff_id = v_duty.active_user_id,
    claimed_by_org_id = COALESCE(claimed_by_org_id, v_serwis),
    status = 'open'
  WHERE id = p_issue_id;

  INSERT INTO public.duty_alerts (
    org_id, issue_id, target_user_id, status
  ) VALUES (
    v_serwis, p_issue_id, v_duty.active_user_id, 'pending'
  )
  RETURNING id INTO v_alert;

  RETURN jsonb_build_object(
    'ok', true,
    'alert_id', v_alert,
    'org_id', v_serwis,
    'target_user_id', v_duty.active_user_id,
    'already', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.dispatch_duty_alert(p_issue_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_org uuid;
  v_result jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'ISSUE_AUTH_REQUIRED';
  END IF;

  SELECT COALESCE(claimed_by_org_id, org_id) INTO v_org
  FROM public.property_issues
  WHERE id = p_issue_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'ISSUE_NOT_FOUND';
  END IF;

  IF NOT (
    public.can_manage_serwis_duty(v_org)
    OR public.is_org_management(v_org)
    OR public.is_management_role(v_org)
  ) THEN
    RAISE EXCEPTION 'DUTY_DISPATCH_FORBIDDEN';
  END IF;

  v_result := private.try_dispatch_duty_alert(p_issue_id);
  IF COALESCE((v_result ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION '%', COALESCE(v_result ->> 'reason', 'DUTY_DISPATCH_FAILED');
  END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_auto_dispatch_duty_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
  PERFORM private.try_dispatch_duty_alert(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_dispatch_duty_alert ON public.property_issues;
CREATE TRIGGER trg_auto_dispatch_duty_alert
  AFTER INSERT OR UPDATE OF priority, status, immediate_fulfillment, emergency_mode
  ON public.property_issues
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_auto_dispatch_duty_alert();

-- ---------------------------------------------------------------------------
-- Duty roster
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_org_duty_eligible(p_org_id uuid, p_user_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_ids uuid[] := COALESCE(p_user_ids, ARRAY[]::uuid[]);
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'ISSUE_AUTH_REQUIRED';
  END IF;
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'DUTY_ORG_REQUIRED';
  END IF;
  IF NOT public.can_manage_serwis_duty(p_org_id) THEN
    RAISE EXCEPTION 'DUTY_MANAGE_FORBIDDEN';
  END IF;

  DELETE FROM public.org_duty_eligible
  WHERE org_id = p_org_id
    AND NOT (user_id = ANY (v_ids));

  INSERT INTO public.org_duty_eligible (org_id, user_id, added_by)
  SELECT p_org_id, u, (SELECT auth.uid())
  FROM unnest(v_ids) AS u
  ON CONFLICT (org_id, user_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_org_duty_state(
  p_org_id uuid,
  p_enabled boolean,
  p_active_user_id uuid DEFAULT NULL
)
RETURNS public.org_duty_state
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.org_duty_state;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'ISSUE_AUTH_REQUIRED';
  END IF;
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'DUTY_ORG_REQUIRED';
  END IF;
  IF NOT public.can_manage_serwis_duty(p_org_id) THEN
    RAISE EXCEPTION 'DUTY_MANAGE_FORBIDDEN';
  END IF;

  INSERT INTO public.org_duty_state (
    org_id, is_duty_enabled, active_user_id, updated_by
  ) VALUES (
    p_org_id,
    COALESCE(p_enabled, false),
    CASE WHEN COALESCE(p_enabled, false) THEN p_active_user_id ELSE NULL END,
    (SELECT auth.uid())
  )
  ON CONFLICT (org_id) DO UPDATE
  SET
    is_duty_enabled = EXCLUDED.is_duty_enabled,
    active_user_id = EXCLUDED.active_user_id,
    updated_by = EXCLUDED.updated_by,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_duty_alert(p_issue_id uuid)
RETURNS public.duty_alerts
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.duty_alerts;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'ISSUE_AUTH_REQUIRED';
  END IF;

  UPDATE public.duty_alerts
  SET status = 'accepted'
  WHERE issue_id = p_issue_id
    AND target_user_id = (SELECT auth.uid())
    AND status = 'pending'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DUTY_ALERT_ACCEPT_FAILED';
  END IF;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text DEFAULT NULL,
  p_org_id uuid DEFAULT NULL
)
RETURNS public.push_subscriptions
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.push_subscriptions;
  v_user uuid := (SELECT auth.uid());
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'ISSUE_AUTH_REQUIRED';
  END IF;
  IF length(btrim(COALESCE(p_endpoint, ''))) = 0
     OR length(btrim(COALESCE(p_p256dh, ''))) = 0
     OR length(btrim(COALESCE(p_auth, ''))) = 0 THEN
    RAISE EXCEPTION 'PUSH_SUBSCRIPTION_INVALID';
  END IF;

  INSERT INTO public.push_subscriptions (
    user_id, org_id, endpoint, p256dh, auth, user_agent, last_seen_at
  ) VALUES (
    v_user, p_org_id, btrim(p_endpoint), btrim(p_p256dh), btrim(p_auth), p_user_agent, now()
  )
  ON CONFLICT (endpoint) DO UPDATE
  SET
    user_id = v_user,
    org_id = COALESCE(EXCLUDED.org_id, public.push_subscriptions.org_id),
    p256dh = EXCLUDED.p256dh,
    auth = EXCLUDED.auth,
    user_agent = EXCLUDED.user_agent,
    last_seen_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.unregister_push_subscription(p_endpoint text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'ISSUE_AUTH_REQUIRED';
  END IF;
  DELETE FROM public.push_subscriptions
  WHERE endpoint = btrim(COALESCE(p_endpoint, ''))
    AND user_id = (SELECT auth.uid());
END;
$$;

-- ---------------------------------------------------------------------------
-- Emergency 24h
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_emergency_vendor(
  p_community_id uuid,
  p_location_id uuid,
  p_trade_category text
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
  v_vendor uuid;
  v_trade text := btrim(COALESCE(p_trade_category, ''));
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'ISSUE_AUTH_REQUIRED';
  END IF;
  IF p_community_id IS NULL OR length(v_trade) = 0 THEN
    RAISE EXCEPTION 'EMERGENCY_VENDOR_ARGS';
  END IF;

  SELECT c.org_id INTO v_org
  FROM public.communities c
  WHERE c.id = p_community_id;

  IF v_org IS NULL OR NOT public.can_manage_serwis_duty(v_org) THEN
    RAISE EXCEPTION 'EMERGENCY_MANAGE_FORBIDDEN';
  END IF;

  IF p_location_id IS NOT NULL THEN
    SELECT cep.vendor_partner_id
    INTO v_vendor
    FROM public.community_emergency_providers cep
    JOIN public.vendor_partners vp ON vp.id = cep.vendor_partner_id
    WHERE cep.community_id = p_community_id
      AND cep.location_id = p_location_id
      AND cep.trade_category = v_trade
      AND vp.is_emergency_24h = true
    LIMIT 1;
    IF v_vendor IS NOT NULL THEN
      RETURN v_vendor;
    END IF;
  END IF;

  SELECT cep.vendor_partner_id
  INTO v_vendor
  FROM public.community_emergency_providers cep
  JOIN public.vendor_partners vp ON vp.id = cep.vendor_partner_id
  WHERE cep.community_id = p_community_id
    AND cep.location_id IS NULL
    AND cep.trade_category = v_trade
    AND vp.is_emergency_24h = true
  LIMIT 1;

  IF v_vendor IS NULL THEN
    RAISE EXCEPTION 'EMERGENCY_VENDOR_MISSING';
  END IF;
  RETURN v_vendor;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_emergency_issue(
  p_location_id uuid,
  p_category text,
  p_description text,
  p_photos_before text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
  v_community uuid;
  v_vendor uuid;
  v_issue uuid;
  v_desc text := btrim(COALESCE(p_description, ''));
  v_cat text := btrim(COALESCE(p_category, ''));
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'ISSUE_AUTH_REQUIRED';
  END IF;
  IF p_location_id IS NULL OR length(v_cat) = 0 OR length(v_desc) < 10 THEN
    RAISE EXCEPTION 'EMERGENCY_ISSUE_INVALID';
  END IF;

  v_org := public.get_my_org_id_safe();
  IF v_org IS NULL OR NOT public.can_manage_serwis_duty(v_org) THEN
    RAISE EXCEPTION 'EMERGENCY_MANAGE_FORBIDDEN';
  END IF;

  SELECT cl.community_id INTO v_community
  FROM public.cleaning_locations cl
  WHERE cl.id = p_location_id
    AND cl.org_id = v_org;

  IF v_community IS NULL THEN
    RAISE EXCEPTION 'EMERGENCY_LOCATION_FORBIDDEN';
  END IF;

  v_vendor := public.resolve_emergency_vendor(v_community, p_location_id, v_cat);

  INSERT INTO public.property_issues (
    org_id,
    location_id,
    category,
    description,
    priority,
    status,
    source,
    reporter_type,
    reporter_id,
    photos_before,
    immediate_fulfillment,
    emergency_mode,
    emergency_vendor_id,
    delegated_vendor_id
  ) VALUES (
    v_org,
    p_location_id,
    v_cat,
    v_desc,
    'critical',
    'delegated',
    'admin_ui',
    'admin',
    (SELECT auth.uid()),
    p_photos_before,
    true,
    true,
    v_vendor,
    v_vendor
  )
  RETURNING id INTO v_issue;

  RETURN jsonb_build_object(
    'issue_id', v_issue,
    'vendor_id', v_vendor
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- n8n push jobs (service_role)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.duty_push_job_payload(p_alert public.duty_alerts)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'alertId', p_alert.id,
    'issueId', p_alert.issue_id,
    'orgId', p_alert.org_id,
    'status', p_alert.status,
    'attemptCount', p_alert.attempt_count,
    'maxAttempts', p_alert.max_attempts,
    'targetUserId', p_alert.target_user_id,
    'title', 'DOMIO Serwis — dyżur',
    'body', 'Krytyczne zgłoszenie oczekuje na potwierdzenie odbioru.',
    'tag', 'duty-' || p_alert.issue_id::text,
    'url', '/dashboard?dutyAlert=' || p_alert.issue_id::text,
    'requireInteraction', true,
    'renotify', true,
    'subscriptions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'endpoint', s.endpoint,
        'p256dh', s.p256dh,
        'auth', s.auth
      ))
      FROM public.push_subscriptions s
      WHERE s.user_id = p_alert.target_user_id
    ), '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.get_duty_push_job(p_alert_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_alert public.duty_alerts;
BEGIN
  SELECT * INTO v_alert FROM public.duty_alerts WHERE id = p_alert_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DUTY_ALERT_NOT_FOUND';
  END IF;
  RETURN private.duty_push_job_payload(v_alert);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_pending_duty_push_jobs()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
  SELECT COALESCE(jsonb_agg(private.duty_push_job_payload(a) ORDER BY a.created_at), '[]'::jsonb)
  FROM public.duty_alerts a
  WHERE a.status = 'pending'
    AND a.attempt_count < a.max_attempts
    AND (
      a.last_pushed_at IS NULL
      OR a.last_pushed_at <= now() - interval '45 seconds'
    );
$$;

CREATE OR REPLACE FUNCTION public.mark_duty_alert_pushed(p_alert_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.duty_alerts;
BEGIN
  UPDATE public.duty_alerts
  SET
    attempt_count = attempt_count + 1,
    last_pushed_at = now(),
    status = CASE
      WHEN attempt_count + 1 >= max_attempts THEN 'exhausted'
      ELSE status
    END
  WHERE id = p_alert_id
    AND status = 'pending'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'DUTY_ALERT_NOT_PENDING');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'alert_id', v_row.id,
    'status', v_row.status,
    'attempt_count', v_row.attempt_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_duty_escalation_push_jobs(p_alert_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_alert public.duty_alerts;
BEGIN
  SELECT * INTO v_alert FROM public.duty_alerts WHERE id = p_alert_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DUTY_ALERT_NOT_FOUND';
  END IF;

  RETURN jsonb_build_object(
    'alertId', v_alert.id,
    'issueId', v_alert.issue_id,
    'orgId', v_alert.org_id,
    'title', 'DOMIO Serwis — dyżur bez odbioru',
    'body', 'Dyżurny nie potwierdził odbioru. Wymagana eskalacja.',
    'tag', 'duty-escalation-' || v_alert.issue_id::text,
    'url', '/admin?dutyAlert=' || v_alert.issue_id::text,
    'requireInteraction', true,
    'renotify', true,
    'subscriptions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'endpoint', s.endpoint,
        'p256dh', s.p256dh,
        'auth', s.auth
      ))
      FROM public.memberships m
      JOIN public.push_subscriptions s ON s.user_id = m.user_id
      WHERE m.org_id = v_alert.org_id
        AND COALESCE(m.is_active, true) = true
        AND lower(btrim(COALESCE(m.role, ''))) IN (
          'owner', 'wlasciciel', 'właściciel', 'admin', 'administrator',
          'coordinator', 'koordynator', 'manager'
        )
        AND m.user_id IS DISTINCT FROM v_alert.target_user_id
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION private.resolve_serwis_org_for_issue(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.try_dispatch_duty_alert(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.duty_push_job_payload(public.duty_alerts) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.dispatch_duty_alert(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_org_duty_eligible(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_org_duty_state(uuid, boolean, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_duty_alert(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_push_subscription(text, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unregister_push_subscription(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_emergency_vendor(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_emergency_issue(uuid, text, text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_duty_push_job(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_pending_duty_push_jobs() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_duty_alert_pushed(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_duty_escalation_push_jobs(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.dispatch_duty_alert(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_org_duty_eligible(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_org_duty_state(uuid, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_duty_alert(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_push_subscription(text, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unregister_push_subscription(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_emergency_vendor(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_emergency_issue(uuid, text, text, text[]) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_duty_push_job(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_pending_duty_push_jobs() TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_duty_alert_pushed(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_duty_escalation_push_jobs(uuid) TO service_role;
