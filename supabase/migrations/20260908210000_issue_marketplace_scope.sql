-- Marketplace scope (serving | all) + RLS visibility + race-safe claim.
-- Layer 2 (RLS/guards) and Layer 3 (broadcast/claim RPCs).
-- Concurrent take: SELECT FOR UPDATE + UPDATE ... WHERE claimed_by_org_id IS NULL.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'issue_marketplace_scope'
  ) THEN
    CREATE TYPE public.issue_marketplace_scope AS ENUM ('serving', 'all');
  END IF;
END $$;

ALTER TABLE public.property_issues
  ADD COLUMN IF NOT EXISTS marketplace_scope public.issue_marketplace_scope;

COMMENT ON COLUMN public.property_issues.marketplace_scope IS
  'serving = orgs that service the building/community; all = any Serwis org. NULL = not on marketplace.';

UPDATE public.property_issues
SET marketplace_scope = 'serving'
WHERE is_public_broadcast IS TRUE
  AND marketplace_scope IS NULL;

UPDATE public.property_issues
SET marketplace_scope = NULL
WHERE COALESCE(is_public_broadcast, false) = false
  AND marketplace_scope IS NOT NULL;

ALTER TABLE public.property_issues
  DROP CONSTRAINT IF EXISTS property_issues_marketplace_scope_broadcast_chk;

ALTER TABLE public.property_issues
  ADD CONSTRAINT property_issues_marketplace_scope_broadcast_chk
  CHECK (
    (is_public_broadcast IS TRUE AND marketplace_scope IS NOT NULL)
    OR (COALESCE(is_public_broadcast, false) = false AND marketplace_scope IS NULL)
  );

CREATE INDEX IF NOT EXISTS property_issues_marketplace_open_idx
  ON public.property_issues (location_id, marketplace_scope)
  WHERE is_public_broadcast IS TRUE
    AND claimed_by_org_id IS NULL
    AND assigned_staff_id IS NULL
    AND status = 'open';

CREATE INDEX IF NOT EXISTS property_issues_claimed_by_org_id_idx
  ON public.property_issues (claimed_by_org_id)
  WHERE claimed_by_org_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Helpers (STABLE + (select ...) in policies for initplan)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_org_has_serwis_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND COALESCE(m.is_active, true) = true
      AND (
        public.is_serwis_technician_role(m.org_id)
        OR public.is_serwis_dispatcher_or_owner(m.org_id)
        OR public.is_management_role(m.org_id)
      )
  );
$$;

COMMENT ON FUNCTION public.current_org_has_serwis_access() IS
  'True when the current user belongs to an org with Serwis technician, dispatcher, or management access.';

REVOKE ALL ON FUNCTION public.current_org_has_serwis_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_org_has_serwis_access() TO authenticated;

CREATE OR REPLACE FUNCTION public.org_serves_issue_location(p_org_id uuid, p_location_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p_org_id IS NOT NULL
    AND p_location_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.cleaning_locations loc
        WHERE loc.id = p_location_id
          AND loc.org_id = p_org_id
          AND COALESCE(loc.is_active_in_serwis, true) = true
      )
      OR EXISTS (
        SELECT 1
        FROM public.property_contracts pc
        INNER JOIN public.companies c ON c.id = pc.company_id
        INNER JOIN public.cleaning_locations loc ON loc.id = p_location_id
        WHERE c.org_id = p_org_id
          AND c.category = 'contractor'
          AND pc.start_date <= CURRENT_DATE
          AND (pc.end_date IS NULL OR pc.end_date >= CURRENT_DATE)
          AND (
            pc.location_id = p_location_id
            OR (
              pc.community_id IS NOT NULL
              AND loc.community_id IS NOT NULL
              AND pc.community_id = loc.community_id
            )
          )
      )
    );
$$;

COMMENT ON FUNCTION public.org_serves_issue_location(uuid, uuid) IS
  'True when the org owns the building in Serwis or has an active contractor contract on the building/community.';

REVOKE ALL ON FUNCTION public.org_serves_issue_location(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_serves_issue_location(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.actor_can_see_open_marketplace(
  p_is_broadcast boolean,
  p_scope public.issue_marketplace_scope,
  p_location_id uuid,
  p_claimed_by uuid,
  p_assigned uuid,
  p_status public.issue_status_enum
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p_is_broadcast IS TRUE
    AND p_scope IS NOT NULL
    AND p_claimed_by IS NULL
    AND p_assigned IS NULL
    AND p_status = 'open'
    AND public.current_org_has_serwis_access()
    AND (
      p_scope = 'all'
      OR (
        p_scope = 'serving'
        AND public.org_serves_issue_location(
          (SELECT public.get_my_org_id_safe()),
          p_location_id
        )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.actor_can_see_open_marketplace(
  boolean, public.issue_marketplace_scope, uuid, uuid, uuid, public.issue_status_enum
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.actor_can_see_open_marketplace(
  boolean, public.issue_marketplace_scope, uuid, uuid, uuid, public.issue_status_enum
) TO authenticated;

-- ---------------------------------------------------------------------------
-- BEFORE UPDATE: race + scope sync (runs with lifecycle trigger)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_property_issue_marketplace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_org uuid;
BEGIN
  v_actor_org := public.get_my_org_id_safe();

  IF NEW.is_public_broadcast IS NOT TRUE THEN
    NEW.marketplace_scope := NULL;
  ELSIF NEW.marketplace_scope IS NULL THEN
    NEW.marketplace_scope := 'serving';
    NEW.is_public_broadcast := true;
  ELSE
    NEW.is_public_broadcast := true;
  END IF;

  IF OLD.claimed_by_org_id IS NOT NULL
     AND NEW.claimed_by_org_id IS DISTINCT FROM OLD.claimed_by_org_id THEN
    RAISE EXCEPTION 'ISSUE_MARKETPLACE_ALREADY_CLAIMED'
      USING HINT = 'Another company already took this job.';
  END IF;

  IF OLD.assigned_staff_id IS NOT NULL
     AND NEW.assigned_staff_id IS DISTINCT FROM OLD.assigned_staff_id
     AND NEW.assigned_staff_id IS NOT NULL THEN
    IF NOT (
      public.is_management_role(OLD.org_id)
      OR (
        OLD.claimed_by_org_id IS NOT NULL
        AND public.is_management_role(OLD.claimed_by_org_id)
      )
    ) THEN
      RAISE EXCEPTION 'ISSUE_MARKETPLACE_ALREADY_CLAIMED'
        USING HINT = 'This job was already taken by someone else.';
    END IF;
  END IF;

  IF OLD.assigned_staff_id IS NULL AND NEW.assigned_staff_id IS NOT NULL THEN
    IF OLD.claimed_by_org_id IS NOT NULL
       AND v_actor_org IS DISTINCT FROM OLD.claimed_by_org_id THEN
      RAISE EXCEPTION 'ISSUE_MARKETPLACE_ALREADY_CLAIMED'
        USING HINT = 'Another company already took this job.';
    END IF;
    NEW.claimed_by_org_id := COALESCE(NEW.claimed_by_org_id, OLD.claimed_by_org_id, v_actor_org);
    IF OLD.is_public_broadcast IS TRUE THEN
      NEW.is_public_broadcast := false;
      NEW.marketplace_scope := NULL;
    END IF;
  END IF;

  IF OLD.claimed_by_org_id IS NULL AND NEW.claimed_by_org_id IS NOT NULL THEN
    IF OLD.is_public_broadcast IS TRUE THEN
      NEW.is_public_broadcast := false;
      NEW.marketplace_scope := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_property_issue_marketplace() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_enforce_property_issue_marketplace ON public.property_issues;
CREATE TRIGGER trg_enforce_property_issue_marketplace
  BEFORE UPDATE ON public.property_issues
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_property_issue_marketplace();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS property_issues_select_open_marketplace ON public.property_issues;
CREATE POLICY property_issues_select_open_marketplace
  ON public.property_issues
  FOR SELECT
  TO authenticated
  USING (
    public.actor_can_see_open_marketplace(
      is_public_broadcast,
      marketplace_scope,
      location_id,
      claimed_by_org_id,
      assigned_staff_id,
      status
    )
  );

DROP POLICY IF EXISTS property_issues_select_claimed_org ON public.property_issues;
CREATE POLICY property_issues_select_claimed_org
  ON public.property_issues
  FOR SELECT
  TO authenticated
  USING (
    claimed_by_org_id IS NOT NULL
    AND (
      public.is_management_role(claimed_by_org_id)
      OR public.is_serwis_dispatcher_or_owner(claimed_by_org_id)
      OR (
        public.is_serwis_technician_role(claimed_by_org_id)
        AND (
          assigned_staff_id = auth.uid()
          OR assigned_staff_id IS NULL
        )
      )
    )
  );

DROP POLICY IF EXISTS property_issues_update_claimed_org ON public.property_issues;
CREATE POLICY property_issues_update_claimed_org
  ON public.property_issues
  FOR UPDATE
  TO authenticated
  USING (
    claimed_by_org_id IS NOT NULL
    AND (
      public.is_management_role(claimed_by_org_id)
      OR public.is_serwis_dispatcher_or_owner(claimed_by_org_id)
      OR (
        public.is_serwis_technician_role(claimed_by_org_id)
        AND (
          assigned_staff_id = auth.uid()
          OR assigned_staff_id IS NULL
        )
      )
    )
  )
  WITH CHECK (
    claimed_by_org_id IS NOT NULL
    AND (
      public.is_management_role(claimed_by_org_id)
      OR public.is_serwis_dispatcher_or_owner(claimed_by_org_id)
      OR public.is_serwis_technician_role(claimed_by_org_id)
    )
  );

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.broadcast_property_issue(
  p_issue_id uuid,
  p_scope public.issue_marketplace_scope
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'ISSUE_AUTH_REQUIRED';
  END IF;
  IF p_scope IS NULL THEN
    RAISE EXCEPTION 'ISSUE_BROADCAST_SCOPE_REQUIRED';
  END IF;

  UPDATE public.property_issues
  SET
    is_public_broadcast = true,
    marketplace_scope = p_scope
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
  PERFORM public.broadcast_property_issue(p_issue_id, 'serving'::public.issue_marketplace_scope);
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_marketplace_property_issue(
  p_issue_id uuid,
  p_assigned_staff_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_org uuid;
  v_issue public.property_issues%ROWTYPE;
  v_updated integer;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'ISSUE_AUTH_REQUIRED';
  END IF;

  v_org := public.get_my_org_id_safe();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'ISSUE_AUTH_REQUIRED';
  END IF;

  SELECT * INTO v_issue
  FROM public.property_issues
  WHERE id = p_issue_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ISSUE_NOT_FOUND';
  END IF;

  IF v_issue.claimed_by_org_id IS NOT NULL
     AND v_issue.claimed_by_org_id IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'ISSUE_MARKETPLACE_ALREADY_CLAIMED';
  END IF;

  IF v_issue.assigned_staff_id IS NOT NULL
     AND v_issue.claimed_by_org_id IS DISTINCT FROM v_org
     AND v_issue.org_id IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'ISSUE_MARKETPLACE_ALREADY_CLAIMED';
  END IF;

  IF v_issue.claimed_by_org_id IS NULL THEN
    IF v_issue.org_id IS DISTINCT FROM v_org THEN
      IF NOT public.actor_can_see_open_marketplace(
        v_issue.is_public_broadcast,
        v_issue.marketplace_scope,
        v_issue.location_id,
        v_issue.claimed_by_org_id,
        v_issue.assigned_staff_id,
        v_issue.status
      ) THEN
        RAISE EXCEPTION 'ISSUE_MARKETPLACE_FORBIDDEN';
      END IF;
    ELSIF NOT public.current_org_has_serwis_access() THEN
      RAISE EXCEPTION 'ISSUE_MARKETPLACE_FORBIDDEN';
    END IF;
  ELSIF NOT (
    public.is_serwis_dispatcher_or_owner(v_org)
    OR public.is_management_role(v_org)
    OR (p_assigned_staff_id IS NOT DISTINCT FROM v_actor)
  ) THEN
    RAISE EXCEPTION 'ISSUE_MARKETPLACE_FORBIDDEN';
  END IF;

  IF p_assigned_staff_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.memberships m
       WHERE m.org_id = v_org
         AND m.user_id = p_assigned_staff_id
         AND COALESCE(m.is_active, true) = true
     ) THEN
    RAISE EXCEPTION 'ISSUE_MARKETPLACE_FORBIDDEN';
  END IF;

  UPDATE public.property_issues
  SET
    claimed_by_org_id = v_org,
    assigned_staff_id = COALESCE(p_assigned_staff_id, assigned_staff_id),
    is_public_broadcast = false,
    marketplace_scope = NULL,
    status = CASE WHEN status = 'open' THEN status ELSE 'open' END
  WHERE id = p_issue_id
    AND (claimed_by_org_id IS NULL OR claimed_by_org_id = v_org)
    AND (
      assigned_staff_id IS NULL
      OR assigned_staff_id IS NOT DISTINCT FROM COALESCE(p_assigned_staff_id, assigned_staff_id)
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'ISSUE_MARKETPLACE_ALREADY_CLAIMED';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.claim_marketplace_property_issue(uuid, uuid) IS
  'Atomically takes a marketplace job for the caller org. Raises ISSUE_MARKETPLACE_ALREADY_CLAIMED on conflict.';

REVOKE ALL ON FUNCTION public.broadcast_property_issue(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.broadcast_property_issue(uuid, public.issue_marketplace_scope) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_marketplace_property_issue(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.broadcast_property_issue(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.broadcast_property_issue(uuid, public.issue_marketplace_scope) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_marketplace_property_issue(uuid, uuid) TO authenticated;
