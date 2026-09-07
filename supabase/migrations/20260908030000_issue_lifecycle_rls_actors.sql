-- Layer 2: actor checks + vendor transfer-target RLS.
-- Triggers already lock invalid routing; this restricts WHO may perform each action.

CREATE OR REPLACE FUNCTION public.is_vendor_partner_actor(p_vendor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p_vendor_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.vendor_partners vp
      INNER JOIN public.memberships m
        ON m.org_id = vp.org_id
       AND m.user_id = auth.uid()
      WHERE vp.id = p_vendor_id
        AND COALESCE(m.is_active, true) = true
    );
$$;

COMMENT ON FUNCTION public.is_vendor_partner_actor(uuid) IS
  'True when the current user belongs to the vendor_partners.org_id of the given partner row.';

REVOKE ALL ON FUNCTION public.is_vendor_partner_actor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_vendor_partner_actor(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_property_issue_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
  v_claimed boolean;
  v_started boolean;
  v_broadcast_on boolean;
  v_vendor_changed boolean;
  v_mgmt boolean;
  v_tech boolean;
  v_transfer_vendor boolean;
  v_authorizing boolean;
  v_declining_transfer boolean;
  v_routing_changed boolean;
BEGIN
  v_org := COALESCE(NEW.org_id, OLD.org_id);
  v_claimed := OLD.assigned_staff_id IS NOT NULL;
  v_started := OLD.started_at IS NOT NULL OR OLD.status = 'in_progress';
  v_broadcast_on := NEW.is_public_broadcast IS TRUE AND OLD.is_public_broadcast IS NOT TRUE;
  v_vendor_changed := NEW.delegated_vendor_id IS DISTINCT FROM OLD.delegated_vendor_id;
  v_mgmt := v_org IS NOT NULL AND public.is_management_role(v_org);
  v_tech := v_org IS NOT NULL AND public.is_serwis_technician_role(v_org);
  v_transfer_vendor := public.is_vendor_partner_actor(
    COALESCE(OLD.transfer_to_vendor_id, NEW.transfer_to_vendor_id)
  );
  v_authorizing :=
    NEW.transfer_authorized_at IS NOT NULL
    AND OLD.transfer_authorized_at IS NULL;
  v_declining_transfer :=
    OLD.is_transfer_requested IS TRUE
    AND NEW.is_transfer_requested IS NOT TRUE
    AND NEW.transfer_authorized_at IS NULL
    AND NEW.delegated_vendor_id IS NOT DISTINCT FROM OLD.delegated_vendor_id;

  IF v_authorizing THEN
    IF NOT v_transfer_vendor THEN
      RAISE EXCEPTION 'ISSUE_TRANSFER_AUTH_FORBIDDEN'
        USING HINT = 'Only the target contractor can authorize a B2B transfer.';
    END IF;
    IF NEW.transfer_to_vendor_id IS NULL THEN
      RAISE EXCEPTION 'ISSUE_TRANSFER_FIELDS_REQUIRED';
    END IF;
    NEW.transfer_authorized_by := COALESCE(NEW.transfer_authorized_by, auth.uid());
    NEW.delegated_vendor_id := NEW.transfer_to_vendor_id;
    NEW.assigned_staff_id := NULL;
    NEW.claimed_at := NULL;
    NEW.is_transfer_requested := false;
    NEW.status := 'delegated';
    NEW.is_public_broadcast := false;
    v_vendor_changed := NEW.delegated_vendor_id IS DISTINCT FROM OLD.delegated_vendor_id;
  END IF;

  IF v_declining_transfer AND NOT (v_transfer_vendor OR v_mgmt) THEN
    RAISE EXCEPTION 'ISSUE_TRANSFER_DECLINE_FORBIDDEN';
  END IF;

  IF OLD.assigned_staff_id IS NULL AND NEW.assigned_staff_id IS NOT NULL THEN
    NEW.claimed_at := COALESCE(NEW.claimed_at, now());
  END IF;

  IF NEW.assigned_staff_id IS NULL AND OLD.assigned_staff_id IS NOT NULL THEN
    IF NEW.status = 'cancelled' THEN
      NULL;
    ELSIF v_vendor_changed
      AND NEW.delegated_vendor_id IS NOT NULL
      AND NEW.transfer_authorized_at IS NOT NULL
      AND NEW.transfer_to_vendor_id IS NOT DISTINCT FROM NEW.delegated_vendor_id THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'ISSUE_UNCLAIM_LOCKED'
        USING HINT = 'Clearing assigned_staff_id is only allowed on cancel or authorized B2B transfer.';
    END IF;
  END IF;

  IF NEW.status = 'rejected' AND OLD.status IS DISTINCT FROM 'rejected' THEN
    IF NOT v_mgmt THEN
      RAISE EXCEPTION 'ISSUE_REJECT_FORBIDDEN';
    END IF;
    IF v_claimed OR OLD.delegated_vendor_id IS NOT NULL THEN
      RAISE EXCEPTION 'ISSUE_REJECT_LOCKED'
        USING HINT = 'Reject is only for unassigned tickets. Cancel before start, or request cancel after start.';
    END IF;
  END IF;

  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    IF NOT v_mgmt THEN
      RAISE EXCEPTION 'ISSUE_CANCEL_FORBIDDEN';
    END IF;
    IF v_started THEN
      RAISE EXCEPTION 'ISSUE_CANCEL_AFTER_START'
        USING HINT = 'After work started, set cancel_requested_* instead of status=cancelled.';
    END IF;
    IF NEW.cancel_reason IS NULL OR length(btrim(NEW.cancel_reason)) < 3 THEN
      RAISE EXCEPTION 'ISSUE_CANCEL_REASON_REQUIRED';
    END IF;
    NEW.cancelled_at := COALESCE(NEW.cancelled_at, now());
    NEW.cancelled_by := COALESCE(NEW.cancelled_by, auth.uid());
    NEW.is_public_broadcast := false;
  END IF;

  IF NEW.cancel_requested_at IS NOT NULL AND OLD.cancel_requested_at IS NULL THEN
    IF NOT v_mgmt THEN
      RAISE EXCEPTION 'ISSUE_CANCEL_REQUEST_FORBIDDEN';
    END IF;
    IF NEW.cancel_request_reason IS NULL OR length(btrim(NEW.cancel_request_reason)) < 3 THEN
      RAISE EXCEPTION 'ISSUE_CANCEL_REASON_REQUIRED';
    END IF;
    NEW.cancel_requested_by := COALESCE(NEW.cancel_requested_by, auth.uid());
  END IF;

  IF v_broadcast_on THEN
    IF NOT v_mgmt THEN
      RAISE EXCEPTION 'ISSUE_BROADCAST_FORBIDDEN';
    END IF;
    IF v_claimed OR OLD.delegated_vendor_id IS NOT NULL THEN
      RAISE EXCEPTION 'ISSUE_BROADCAST_LOCKED'
        USING HINT = 'Marketplace broadcast after claim/delegate requires an authorized transfer.';
    END IF;
  END IF;

  IF v_vendor_changed AND NEW.delegated_vendor_id IS NOT NULL AND NOT v_authorizing THEN
    IF v_claimed OR OLD.delegated_vendor_id IS NOT NULL THEN
      IF NEW.transfer_authorized_at IS NULL
         OR NEW.transfer_to_vendor_id IS DISTINCT FROM NEW.delegated_vendor_id THEN
        RAISE EXCEPTION 'ISSUE_TRANSFER_NEEDS_AUTH'
          USING HINT = 'Contractor must authorize transfer_to_vendor_id before delegated_vendor_id changes.';
      END IF;
      NEW.assigned_staff_id := NULL;
      NEW.claimed_at := NULL;
      NEW.is_transfer_requested := false;
    ELSIF NOT v_mgmt THEN
      RAISE EXCEPTION 'ISSUE_DELEGATE_FORBIDDEN';
    END IF;
  END IF;

  IF NEW.is_transfer_requested IS TRUE AND OLD.is_transfer_requested IS NOT TRUE THEN
    IF NOT v_mgmt THEN
      RAISE EXCEPTION 'ISSUE_TRANSFER_REQUEST_FORBIDDEN';
    END IF;
    IF NOT v_claimed AND OLD.delegated_vendor_id IS NULL THEN
      RAISE EXCEPTION 'ISSUE_TRANSFER_NOT_NEEDED'
        USING HINT = 'Unassigned tickets can be delegated directly.';
    END IF;
    IF NEW.transfer_to_vendor_id IS NULL
       OR NEW.transfer_reason IS NULL
       OR length(btrim(NEW.transfer_reason)) < 3 THEN
      RAISE EXCEPTION 'ISSUE_TRANSFER_FIELDS_REQUIRED';
    END IF;
  END IF;

  v_routing_changed :=
    NEW.is_public_broadcast IS DISTINCT FROM OLD.is_public_broadcast
    OR NEW.delegated_vendor_id IS DISTINCT FROM OLD.delegated_vendor_id
    OR NEW.is_transfer_requested IS DISTINCT FROM OLD.is_transfer_requested
    OR NEW.transfer_to_vendor_id IS DISTINCT FROM OLD.transfer_to_vendor_id
    OR NEW.transfer_reason IS DISTINCT FROM OLD.transfer_reason
    OR NEW.transfer_authorized_at IS DISTINCT FROM OLD.transfer_authorized_at
    OR NEW.cancel_reason IS DISTINCT FROM OLD.cancel_reason
    OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
    OR NEW.cancel_requested_at IS DISTINCT FROM OLD.cancel_requested_at
    OR (NEW.status IN ('rejected', 'cancelled') AND NEW.status IS DISTINCT FROM OLD.status);

  IF v_tech AND NOT v_mgmt AND v_routing_changed THEN
    RAISE EXCEPTION 'ISSUE_ROUTING_FORBIDDEN'
      USING HINT = 'Technicians cannot reject, cancel, broadcast, or reassign to another company.';
  END IF;

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS property_issues_select_for_transfer_target ON public.property_issues;
CREATE POLICY property_issues_select_for_transfer_target
  ON public.property_issues
  FOR SELECT
  TO authenticated
  USING (
    COALESCE(is_transfer_requested, false) = true
    AND public.is_vendor_partner_actor(transfer_to_vendor_id)
  );

DROP POLICY IF EXISTS property_issues_update_for_transfer_target ON public.property_issues;
CREATE POLICY property_issues_update_for_transfer_target
  ON public.property_issues
  FOR UPDATE
  TO authenticated
  USING (
    COALESCE(is_transfer_requested, false) = true
    AND public.is_vendor_partner_actor(transfer_to_vendor_id)
  )
  WITH CHECK (
    public.is_vendor_partner_actor(delegated_vendor_id)
    OR (
      COALESCE(is_transfer_requested, false) = false
      AND public.is_vendor_partner_actor(transfer_to_vendor_id)
    )
  );

DROP POLICY IF EXISTS issue_lifecycle_events_select ON public.issue_lifecycle_events;
CREATE POLICY issue_lifecycle_events_select
  ON public.issue_lifecycle_events
  FOR SELECT
  TO authenticated
  USING (
    public.is_management_role(org_id)
    OR actor_user_id = auth.uid()
    OR (event_type = 'claimed' AND (payload ->> 'assigned_staff_id') = auth.uid()::text)
    OR EXISTS (
      SELECT 1
      FROM public.property_issues i
      WHERE i.id = issue_lifecycle_events.issue_id
        AND (
          i.assigned_staff_id = auth.uid()
          OR public.is_vendor_partner_actor(i.delegated_vendor_id)
          OR public.is_vendor_partner_actor(i.transfer_to_vendor_id)
        )
    )
  );
