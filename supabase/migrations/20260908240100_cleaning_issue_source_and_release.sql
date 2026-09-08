-- Layer 1: isolate Cleaning tickets from Serwis / Administracja.
-- source enum, release timestamp, per-building skip-approval flag, backfill.

-- ---------------------------------------------------------------------------
-- Source enum
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'issue_source_enum'
  ) THEN
    CREATE TYPE public.issue_source_enum AS ENUM (
      'cleaning',
      'admin_ui',
      'dispatcher',
      'serwis',
      'tenant_qr',
      'public_qr',
      'email_ai',
      'manual'
    );
  END IF;
END $$;

COMMENT ON TYPE public.issue_source_enum IS
  'App that created the ticket: cleaning | admin_ui | dispatcher | serwis | tenant_qr | public_qr | email_ai | manual.';

UPDATE public.property_issues
SET source = 'cleaning'
WHERE lower(btrim(COALESCE(source, ''))) IN ('cleaning', 'cleaning_app')
   OR lower(btrim(COALESCE(reporter_type, ''))) IN ('cleaner', 'sprzataczka');

ALTER TABLE public.property_issues
  ALTER COLUMN source DROP DEFAULT;

ALTER TABLE public.property_issues
  ALTER COLUMN source TYPE public.issue_source_enum
  USING (
    CASE lower(btrim(COALESCE(source, 'manual')))
      WHEN 'cleaning' THEN 'cleaning'::public.issue_source_enum
      WHEN 'cleaning_app' THEN 'cleaning'::public.issue_source_enum
      WHEN 'admin_ui' THEN 'admin_ui'::public.issue_source_enum
      WHEN 'dispatcher' THEN 'dispatcher'::public.issue_source_enum
      WHEN 'serwis' THEN 'serwis'::public.issue_source_enum
      WHEN 'tenant_qr' THEN 'tenant_qr'::public.issue_source_enum
      WHEN 'public_qr' THEN 'public_qr'::public.issue_source_enum
      WHEN 'email_ai' THEN 'email_ai'::public.issue_source_enum
      ELSE 'manual'::public.issue_source_enum
    END
  );

ALTER TABLE public.property_issues
  ALTER COLUMN source SET DEFAULT 'manual'::public.issue_source_enum;

ALTER TABLE public.property_issues
  ALTER COLUMN source SET NOT NULL;

COMMENT ON COLUMN public.property_issues.source IS
  'Creating module. cleaning = DOMIO Cleaning personnel; not visible in Admin/Serwis until released_from_cleaning_at.';

-- ---------------------------------------------------------------------------
-- Release + skip-approval
-- ---------------------------------------------------------------------------

ALTER TABLE public.property_issues
  ADD COLUMN IF NOT EXISTS released_from_cleaning_at timestamptz;

COMMENT ON COLUMN public.property_issues.released_from_cleaning_at IS
  'Set when Cleaning hands the ticket off (Przekaż / auto_notify). NULL = still inside Cleaning.';

ALTER TABLE public.property_issues
  DROP CONSTRAINT IF EXISTS property_issues_released_from_cleaning_chk;

ALTER TABLE public.property_issues
  ADD CONSTRAINT property_issues_released_from_cleaning_chk
  CHECK (
    released_from_cleaning_at IS NULL
    OR source = 'cleaning'::public.issue_source_enum
  );

ALTER TABLE public.cleaning_locations
  ADD COLUMN IF NOT EXISTS skip_cleaning_issue_approval boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.cleaning_locations.skip_cleaning_issue_approval IS
  'If true, tickets released from Cleaning skip Administracja triage and become open in Serwis.';

-- Already left Cleaning (sent, claimed, broadcast, or past the local queue).
UPDATE public.property_issues pi
SET released_from_cleaning_at = COALESCE(pi.created_at, now())
WHERE pi.source = 'cleaning'::public.issue_source_enum
  AND pi.released_from_cleaning_at IS NULL
  AND (
    pi.notification_status = 'sent'
    OR pi.assigned_staff_id IS NOT NULL
    OR pi.is_public_broadcast IS TRUE
    OR (
      pi.status IS DISTINCT FROM 'open'::public.issue_status_enum
      AND pi.status IS DISTINCT FROM 'new'::public.issue_status_enum
    )
  );

-- Still in the Cleaning queue.
UPDATE public.property_issues
SET status = 'pending_cleaning_review'::public.issue_status_enum
WHERE source = 'cleaning'::public.issue_source_enum
  AND released_from_cleaning_at IS NULL
  AND assigned_staff_id IS NULL
  AND COALESCE(is_public_broadcast, false) = false
  AND status IN (
    'open'::public.issue_status_enum,
    'new'::public.issue_status_enum
  );

-- ---------------------------------------------------------------------------
-- Indexes (partial — module queues)
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS property_issues_cleaning_queue_idx
  ON public.property_issues (org_id, created_at DESC)
  WHERE source = 'cleaning'::public.issue_source_enum
    AND released_from_cleaning_at IS NULL;

CREATE INDEX IF NOT EXISTS property_issues_released_cleaning_idx
  ON public.property_issues (org_id, released_from_cleaning_at DESC)
  WHERE source = 'cleaning'::public.issue_source_enum
    AND released_from_cleaning_at IS NOT NULL;
