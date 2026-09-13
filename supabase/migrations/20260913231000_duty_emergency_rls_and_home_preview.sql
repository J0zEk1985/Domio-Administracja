-- WARSTWA 2: RLS dyżuru / pogotowia / tablicy, strażnik flag zgłoszenia,
-- RPC podglądu Home dla platform_admin.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;
GRANT USAGE ON SCHEMA private TO postgres, service_role;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_serwis_org_staff(target_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.org_id = target_org_id
      AND m.user_id = (SELECT auth.uid())
      AND COALESCE(m.is_active, true) = true
      AND public.is_service_staff_role(m.role)
  );
$$;

COMMENT ON FUNCTION public.is_serwis_org_staff(uuid) IS
  'Active Serwis staff membership (technik / koordynator / właściciel).';

CREATE OR REPLACE FUNCTION public.can_manage_serwis_duty(target_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_org_management(target_org_id)
    OR public.is_management_role(target_org_id);
$$;

COMMENT ON FUNCTION public.can_manage_serwis_duty(uuid) IS
  'Coordinator / owner / admin of the given org (Serwis duty writes and Administracja operational writes).';

CREATE OR REPLACE FUNCTION public.resident_belongs_to_community(p_community_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.cleaning_locations cl
    INNER JOIN public.location_access la ON la.location_id = cl.id
    WHERE cl.community_id = p_community_id
      AND la.user_id = (SELECT auth.uid())
      AND (la.expires_at IS NULL OR la.expires_at > now())
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_read_community_contact_board(p_community_id uuid, p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p_community_id IS NOT NULL
    AND (
      public.is_platform_admin()
      OR public.is_active_org_member(p_org_id)
      OR public.resident_belongs_to_community(p_community_id)
    );
$$;

REVOKE ALL ON FUNCTION public.is_serwis_org_staff(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_serwis_duty(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resident_belongs_to_community(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_read_community_contact_board(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_serwis_org_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_serwis_duty(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resident_belongs_to_community(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_read_community_contact_board(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- org_duty_state
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS org_duty_state_select ON public.org_duty_state;
CREATE POLICY org_duty_state_select
  ON public.org_duty_state
  FOR SELECT
  TO authenticated
  USING (public.is_serwis_org_staff(org_id));

DROP POLICY IF EXISTS org_duty_state_insert ON public.org_duty_state;
CREATE POLICY org_duty_state_insert
  ON public.org_duty_state
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_serwis_duty(org_id));

DROP POLICY IF EXISTS org_duty_state_update ON public.org_duty_state;
CREATE POLICY org_duty_state_update
  ON public.org_duty_state
  FOR UPDATE
  TO authenticated
  USING (public.can_manage_serwis_duty(org_id))
  WITH CHECK (public.can_manage_serwis_duty(org_id));

DROP POLICY IF EXISTS org_duty_state_delete ON public.org_duty_state;
CREATE POLICY org_duty_state_delete
  ON public.org_duty_state
  FOR DELETE
  TO authenticated
  USING (public.can_manage_serwis_duty(org_id));

-- ---------------------------------------------------------------------------
-- org_duty_eligible
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS org_duty_eligible_select ON public.org_duty_eligible;
CREATE POLICY org_duty_eligible_select
  ON public.org_duty_eligible
  FOR SELECT
  TO authenticated
  USING (public.is_serwis_org_staff(org_id));

DROP POLICY IF EXISTS org_duty_eligible_insert ON public.org_duty_eligible;
CREATE POLICY org_duty_eligible_insert
  ON public.org_duty_eligible
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_serwis_duty(org_id));

DROP POLICY IF EXISTS org_duty_eligible_update ON public.org_duty_eligible;
CREATE POLICY org_duty_eligible_update
  ON public.org_duty_eligible
  FOR UPDATE
  TO authenticated
  USING (public.can_manage_serwis_duty(org_id))
  WITH CHECK (public.can_manage_serwis_duty(org_id));

DROP POLICY IF EXISTS org_duty_eligible_delete ON public.org_duty_eligible;
CREATE POLICY org_duty_eligible_delete
  ON public.org_duty_eligible
  FOR DELETE
  TO authenticated
  USING (public.can_manage_serwis_duty(org_id));

-- ---------------------------------------------------------------------------
-- duty_alerts
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS duty_alerts_select ON public.duty_alerts;
CREATE POLICY duty_alerts_select
  ON public.duty_alerts
  FOR SELECT
  TO authenticated
  USING (
    public.is_serwis_org_staff(org_id)
    OR target_user_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS duty_alerts_insert ON public.duty_alerts;
CREATE POLICY duty_alerts_insert
  ON public.duty_alerts
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_serwis_duty(org_id));

DROP POLICY IF EXISTS duty_alerts_update ON public.duty_alerts;
CREATE POLICY duty_alerts_update
  ON public.duty_alerts
  FOR UPDATE
  TO authenticated
  USING (
    public.can_manage_serwis_duty(org_id)
    OR (
      target_user_id = (SELECT auth.uid())
      AND status = 'pending'
    )
  )
  WITH CHECK (
    public.can_manage_serwis_duty(org_id)
    OR (
      target_user_id = (SELECT auth.uid())
      AND status = 'accepted'
    )
  );

DROP POLICY IF EXISTS duty_alerts_delete ON public.duty_alerts;
CREATE POLICY duty_alerts_delete
  ON public.duty_alerts
  FOR DELETE
  TO authenticated
  USING (public.can_manage_serwis_duty(org_id));

CREATE OR REPLACE FUNCTION public.enforce_duty_alert_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_mgmt boolean;
BEGIN
  v_mgmt := public.can_manage_serwis_duty(OLD.org_id);
  IF v_mgmt OR (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.target_user_id IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'DUTY_ALERT_FORBIDDEN'
      USING HINT = 'Only the duty target can acknowledge this alert.';
  END IF;

  IF OLD.status IS DISTINCT FROM 'pending' OR NEW.status IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION 'DUTY_ALERT_ACCEPT_ONLY'
      USING HINT = 'The duty target may only move pending → accepted.';
  END IF;

  IF NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.issue_id IS DISTINCT FROM OLD.issue_id
     OR NEW.target_user_id IS DISTINCT FROM OLD.target_user_id
     OR NEW.max_attempts IS DISTINCT FROM OLD.max_attempts THEN
    RAISE EXCEPTION 'DUTY_ALERT_IMMUTABLE';
  END IF;

  NEW.accepted_at := COALESCE(NEW.accepted_at, now());
  NEW.accepted_by := COALESCE(NEW.accepted_by, (SELECT auth.uid()));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_duty_alert_update ON public.duty_alerts;
CREATE TRIGGER trg_enforce_duty_alert_update
  BEFORE UPDATE ON public.duty_alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_duty_alert_update();

-- ---------------------------------------------------------------------------
-- push_subscriptions (own rows only)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS push_subscriptions_select ON public.push_subscriptions;
CREATE POLICY push_subscriptions_select
  ON public.push_subscriptions
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS push_subscriptions_insert ON public.push_subscriptions;
CREATE POLICY push_subscriptions_insert
  ON public.push_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS push_subscriptions_update ON public.push_subscriptions;
CREATE POLICY push_subscriptions_update
  ON public.push_subscriptions
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS push_subscriptions_delete ON public.push_subscriptions;
CREATE POLICY push_subscriptions_delete
  ON public.push_subscriptions
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- community_emergency_providers (Administracja, nie Home)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS community_emergency_providers_select ON public.community_emergency_providers;
CREATE POLICY community_emergency_providers_select
  ON public.community_emergency_providers
  FOR SELECT
  TO authenticated
  USING (public.is_active_org_member(org_id));

DROP POLICY IF EXISTS community_emergency_providers_insert ON public.community_emergency_providers;
CREATE POLICY community_emergency_providers_insert
  ON public.community_emergency_providers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_manage_serwis_duty(org_id)
    AND EXISTS (
      SELECT 1
      FROM public.communities c
      WHERE c.id = community_id
        AND c.org_id = org_id
    )
  );

DROP POLICY IF EXISTS community_emergency_providers_update ON public.community_emergency_providers;
CREATE POLICY community_emergency_providers_update
  ON public.community_emergency_providers
  FOR UPDATE
  TO authenticated
  USING (public.can_manage_serwis_duty(org_id))
  WITH CHECK (
    public.can_manage_serwis_duty(org_id)
    AND EXISTS (
      SELECT 1
      FROM public.communities c
      WHERE c.id = community_id
        AND c.org_id = org_id
    )
  );

DROP POLICY IF EXISTS community_emergency_providers_delete ON public.community_emergency_providers;
CREATE POLICY community_emergency_providers_delete
  ON public.community_emergency_providers
  FOR DELETE
  TO authenticated
  USING (public.can_manage_serwis_duty(org_id));

-- ---------------------------------------------------------------------------
-- community_contact_board_entries
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS community_contact_board_select ON public.community_contact_board_entries;
CREATE POLICY community_contact_board_select
  ON public.community_contact_board_entries
  FOR SELECT
  TO authenticated
  USING (public.user_can_read_community_contact_board(community_id, org_id));

DROP POLICY IF EXISTS community_contact_board_insert ON public.community_contact_board_entries;
CREATE POLICY community_contact_board_insert
  ON public.community_contact_board_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_manage_serwis_duty(org_id)
    AND EXISTS (
      SELECT 1
      FROM public.communities c
      WHERE c.id = community_id
        AND c.org_id = org_id
    )
  );

DROP POLICY IF EXISTS community_contact_board_update ON public.community_contact_board_entries;
CREATE POLICY community_contact_board_update
  ON public.community_contact_board_entries
  FOR UPDATE
  TO authenticated
  USING (public.can_manage_serwis_duty(org_id))
  WITH CHECK (
    public.can_manage_serwis_duty(org_id)
    AND EXISTS (
      SELECT 1
      FROM public.communities c
      WHERE c.id = community_id
        AND c.org_id = org_id
    )
  );

DROP POLICY IF EXISTS community_contact_board_delete ON public.community_contact_board_entries;
CREATE POLICY community_contact_board_delete
  ON public.community_contact_board_entries
  FOR DELETE
  TO authenticated
  USING (public.can_manage_serwis_duty(org_id));

-- ---------------------------------------------------------------------------
-- Flags on property_issues (separate trigger — does not replace lifecycle FSM)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_property_issue_duty_flags()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
  v_mgmt boolean;
  v_flags_changed boolean;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;

  v_org := COALESCE(NEW.org_id, OLD.org_id);
  v_mgmt := v_org IS NOT NULL AND (
    public.is_management_role(v_org) OR public.is_org_management(v_org)
  );

  IF TG_OP = 'INSERT' THEN
    IF (
      NEW.immediate_fulfillment IS TRUE
      OR NEW.emergency_mode IS TRUE
      OR NEW.emergency_vendor_id IS NOT NULL
    ) AND NOT v_mgmt THEN
      RAISE EXCEPTION 'ISSUE_DUTY_FLAGS_FORBIDDEN'
        USING HINT = 'Only Administracja management can set emergency / immediate fulfillment.';
    END IF;
    RETURN NEW;
  END IF;

  v_flags_changed :=
    NEW.immediate_fulfillment IS DISTINCT FROM OLD.immediate_fulfillment
    OR NEW.emergency_mode IS DISTINCT FROM OLD.emergency_mode
    OR NEW.emergency_vendor_id IS DISTINCT FROM OLD.emergency_vendor_id;

  IF v_flags_changed AND NOT v_mgmt THEN
    RAISE EXCEPTION 'ISSUE_DUTY_FLAGS_FORBIDDEN'
      USING HINT = 'Serwis staff cannot change emergency_mode or immediate_fulfillment.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_property_issue_duty_flags ON public.property_issues;
CREATE TRIGGER trg_enforce_property_issue_duty_flags
  BEFORE INSERT OR UPDATE OF immediate_fulfillment, emergency_mode, emergency_vendor_id, org_id
  ON public.property_issues
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_property_issue_duty_flags();

-- ---------------------------------------------------------------------------
-- Home preview RPC (platform_admin) — implementation in private
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.list_home_preview_locations()
RETURNS TABLE (
  access_id uuid,
  location_id uuid,
  org_id uuid,
  name text,
  address text,
  unit_number text,
  community_name text,
  community_id uuid,
  estate_id uuid,
  estate_name text,
  issue_qr_token text,
  access_type text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'HOME_PREVIEW_FORBIDDEN'
      USING ERRCODE = '42501',
            HINT = 'Only the system administrator can preview Home across communities.';
  END IF;

  RETURN QUERY
  SELECT
    cl.id AS access_id,
    cl.id AS location_id,
    cl.org_id,
    cl.name,
    cl.address,
    NULL::text AS unit_number,
    COALESCE(NULLIF(btrim(c.legal_name), ''), NULLIF(btrim(c.name), '')) AS community_name,
    cl.community_id,
    est.estate_id,
    est.estate_name,
    cl.issue_qr_token,
    'preview'::text AS access_type
  FROM public.cleaning_locations cl
  LEFT JOIN public.communities c ON c.id = cl.community_id
  LEFT JOIN LATERAL (
    SELECT e.id AS estate_id, e.name AS estate_name
    FROM public.estate_members em
    INNER JOIN public.estates e ON e.id = em.estate_id
    WHERE em.community_id = cl.community_id
      AND em.status = 'accepted'
      AND e.status = 'active'
    ORDER BY e.name
    LIMIT 1
  ) est ON true
  WHERE cl.community_id IS NOT NULL
    AND COALESCE(cl.status, 'active') IS DISTINCT FROM 'archived'
  ORDER BY community_name NULLS LAST, cl.address, cl.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_home_preview_locations()
RETURNS TABLE (
  access_id uuid,
  location_id uuid,
  org_id uuid,
  name text,
  address text,
  unit_number text,
  community_name text,
  community_id uuid,
  estate_id uuid,
  estate_name text,
  issue_qr_token text,
  access_type text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
  SELECT * FROM private.list_home_preview_locations();
$$;

COMMENT ON FUNCTION public.list_home_preview_locations() IS
  'Platform admin: all active community buildings as synthetic Home locations (access_id = location_id).';

REVOKE ALL ON FUNCTION private.list_home_preview_locations() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_home_preview_locations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_home_preview_locations() TO authenticated;
