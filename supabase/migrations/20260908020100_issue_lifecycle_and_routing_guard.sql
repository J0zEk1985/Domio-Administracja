-- Issue lifecycle: claim/start/cancel events + routing lock after technician take / B2B delegate.
-- Apply AFTER 20260908020000 (cancelled enum committed).

-- ---------------------------------------------------------------------------
-- Columns on property_issues
-- ---------------------------------------------------------------------------
ALTER TABLE public.property_issues
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS cancel_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_requested_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS cancel_request_reason text,
  ADD COLUMN IF NOT EXISTS transfer_to_vendor_id uuid REFERENCES public.vendor_partners(id),
  ADD COLUMN IF NOT EXISTS transfer_authorized_at timestamptz,
  ADD COLUMN IF NOT EXISTS transfer_authorized_by uuid REFERENCES public.profiles(id);

COMMENT ON COLUMN public.property_issues.claimed_at IS
  'Set when assigned_staff_id is first populated (technician take or dispatcher assign).';
COMMENT ON COLUMN public.property_issues.cancel_reason IS
  'Required when status becomes cancelled (before started_at).';
COMMENT ON COLUMN public.property_issues.cancel_requested_at IS
  'Admin request to cancel after work started; does not change status by itself.';
COMMENT ON COLUMN public.property_issues.transfer_to_vendor_id IS
  'Target B2B partner for a transfer request; applied to delegated_vendor_id only after authorization.';

-- ---------------------------------------------------------------------------
-- Event log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.issue_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  issue_id uuid NOT NULL REFERENCES public.property_issues(id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (event_type IN (
      'claimed',
      'started',
      'cancel_requested',
      'cancelled',
      'transfer_requested',
      'transfer_accepted',
      'transfer_rejected'
    )),
  actor_user_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS issue_lifecycle_events_issue_created_idx
  ON public.issue_lifecycle_events (issue_id, created_at DESC);

CREATE INDEX IF NOT EXISTS issue_lifecycle_events_org_created_idx
  ON public.issue_lifecycle_events (org_id, created_at DESC);

COMMENT ON TABLE public.issue_lifecycle_events IS
  'Append-only lifecycle log for coordinator and technician notices (claim, cancel, B2B transfer).';

ALTER TABLE public.issue_lifecycle_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS issue_lifecycle_events_select ON public.issue_lifecycle_events;
CREATE POLICY issue_lifecycle_events_select
  ON public.issue_lifecycle_events
  FOR SELECT
  TO authenticated
  USING (
    public.is_management_role(org_id)
    OR EXISTS (
      SELECT 1
      FROM public.property_issues i
      WHERE i.id = issue_lifecycle_events.issue_id
        AND i.assigned_staff_id = auth.uid()
    )
  );

REVOKE ALL ON TABLE public.issue_lifecycle_events FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.issue_lifecycle_events FROM authenticated;
GRANT SELECT ON TABLE public.issue_lifecycle_events TO authenticated;

-- ---------------------------------------------------------------------------
-- BEFORE UPDATE: routing / cancel guards
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_property_issue_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_claimed boolean;
  v_started boolean;
  v_broadcast_on boolean;
  v_vendor_changed boolean;
BEGIN
  v_claimed := OLD.assigned_staff_id IS NOT NULL;
  v_started := OLD.started_at IS NOT NULL OR OLD.status = 'in_progress';
  v_broadcast_on := NEW.is_public_broadcast IS TRUE AND OLD.is_public_broadcast IS NOT TRUE;
  v_vendor_changed := NEW.delegated_vendor_id IS DISTINCT FROM OLD.delegated_vendor_id;

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
    IF v_claimed OR OLD.delegated_vendor_id IS NOT NULL THEN
      RAISE EXCEPTION 'ISSUE_REJECT_LOCKED'
        USING HINT = 'Reject is only for unassigned tickets. Cancel before start, or request cancel after start.';
    END IF;
  END IF;

  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
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

  IF v_broadcast_on AND (v_claimed OR OLD.delegated_vendor_id IS NOT NULL) THEN
    RAISE EXCEPTION 'ISSUE_BROADCAST_LOCKED'
      USING HINT = 'Marketplace broadcast after claim/delegate requires an authorized transfer.';
  END IF;

  IF v_vendor_changed AND NEW.delegated_vendor_id IS NOT NULL THEN
    IF v_claimed OR OLD.delegated_vendor_id IS NOT NULL THEN
      IF NEW.transfer_authorized_at IS NULL
         OR NEW.transfer_to_vendor_id IS DISTINCT FROM NEW.delegated_vendor_id THEN
        RAISE EXCEPTION 'ISSUE_TRANSFER_NEEDS_AUTH'
          USING HINT = 'Contractor must authorize transfer_to_vendor_id before delegated_vendor_id changes.';
      END IF;
      NEW.assigned_staff_id := NULL;
      NEW.claimed_at := NULL;
      NEW.is_transfer_requested := false;
    END IF;
  END IF;

  IF NEW.is_transfer_requested IS TRUE AND OLD.is_transfer_requested IS NOT TRUE THEN
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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_property_issue_lifecycle ON public.property_issues;
CREATE TRIGGER trg_enforce_property_issue_lifecycle
  BEFORE UPDATE ON public.property_issues
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_property_issue_lifecycle();

-- ---------------------------------------------------------------------------
-- AFTER INSERT/UPDATE: append lifecycle events (no client INSERT)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_property_issue_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
  v_actor uuid;
BEGIN
  v_actor := auth.uid();

  IF TG_OP = 'INSERT' THEN
    v_org := NEW.org_id;
    IF NEW.assigned_staff_id IS NOT NULL THEN
      INSERT INTO public.issue_lifecycle_events (org_id, issue_id, event_type, actor_user_id, payload)
      VALUES (
        v_org,
        NEW.id,
        'claimed',
        v_actor,
        jsonb_build_object('assigned_staff_id', NEW.assigned_staff_id)
      );
    END IF;
    RETURN NEW;
  END IF;

  v_org := COALESCE(NEW.org_id, OLD.org_id);

  IF OLD.assigned_staff_id IS NULL AND NEW.assigned_staff_id IS NOT NULL THEN
    INSERT INTO public.issue_lifecycle_events (org_id, issue_id, event_type, actor_user_id, payload)
    VALUES (
      v_org,
      NEW.id,
      'claimed',
      v_actor,
      jsonb_build_object('assigned_staff_id', NEW.assigned_staff_id)
    );
  END IF;

  IF (OLD.started_at IS NULL AND NEW.started_at IS NOT NULL)
     OR (OLD.status IS DISTINCT FROM 'in_progress' AND NEW.status = 'in_progress') THEN
    INSERT INTO public.issue_lifecycle_events (org_id, issue_id, event_type, actor_user_id, payload)
    VALUES (v_org, NEW.id, 'started', v_actor, '{}'::jsonb);
  END IF;

  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    INSERT INTO public.issue_lifecycle_events (org_id, issue_id, event_type, actor_user_id, payload)
    VALUES (
      v_org,
      NEW.id,
      'cancelled',
      v_actor,
      jsonb_build_object('reason', NEW.cancel_reason)
    );
  END IF;

  IF NEW.cancel_requested_at IS NOT NULL AND OLD.cancel_requested_at IS NULL THEN
    INSERT INTO public.issue_lifecycle_events (org_id, issue_id, event_type, actor_user_id, payload)
    VALUES (
      v_org,
      NEW.id,
      'cancel_requested',
      v_actor,
      jsonb_build_object('reason', NEW.cancel_request_reason)
    );
  END IF;

  IF NEW.is_transfer_requested IS TRUE AND OLD.is_transfer_requested IS NOT TRUE THEN
    INSERT INTO public.issue_lifecycle_events (org_id, issue_id, event_type, actor_user_id, payload)
    VALUES (
      v_org,
      NEW.id,
      'transfer_requested',
      v_actor,
      jsonb_build_object(
        'transfer_to_vendor_id', NEW.transfer_to_vendor_id,
        'reason', NEW.transfer_reason
      )
    );
  END IF;

  IF NEW.transfer_authorized_at IS NOT NULL AND OLD.transfer_authorized_at IS NULL THEN
    INSERT INTO public.issue_lifecycle_events (org_id, issue_id, event_type, actor_user_id, payload)
    VALUES (
      v_org,
      NEW.id,
      'transfer_accepted',
      v_actor,
      jsonb_build_object('transfer_to_vendor_id', NEW.transfer_to_vendor_id)
    );
  END IF;

  IF NEW.is_transfer_requested IS NOT TRUE
     AND OLD.is_transfer_requested IS TRUE
     AND NEW.delegated_vendor_id IS NOT DISTINCT FROM OLD.delegated_vendor_id
     AND NEW.transfer_authorized_at IS NULL THEN
    INSERT INTO public.issue_lifecycle_events (org_id, issue_id, event_type, actor_user_id, payload)
    VALUES (v_org, NEW.id, 'transfer_rejected', v_actor, '{}'::jsonb);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_property_issue_lifecycle ON public.property_issues;
CREATE TRIGGER trg_log_property_issue_lifecycle
  AFTER INSERT OR UPDATE ON public.property_issues
  FOR EACH ROW
  EXECUTE FUNCTION public.log_property_issue_lifecycle();
