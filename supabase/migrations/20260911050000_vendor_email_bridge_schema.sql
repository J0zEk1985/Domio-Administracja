-- Email bridge for vendors without DOMIO login (Layer 1: schema only).
-- RLS policies and RPCs are the next migration.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;
GRANT USAGE ON SCHEMA private TO postgres, service_role;

-- ---------------------------------------------------------------------------
-- Default outbound templates (used as column defaults)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.vendor_email_default_subject()
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT '[DOMIO {{issue.token}}] Zgłoszenie: {{building.address}}'::text;
$$;

CREATE OR REPLACE FUNCTION private.vendor_email_default_body()
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT $t$Dzień dobry,

Przekazujemy zgłoszenie serwisowe do realizacji.

Budynek
{{building.name}}
{{building.address}}

Zgłoszenie
Kategoria: {{issue.category}}
Priorytet: {{issue.priority}}
Opis:
{{issue.description}}

Zgłaszający
{{reporter.name}}
Telefon: {{reporter.phone}}

Nadawca
{{org.name}}

Numer DOMIO: {{issue.id}}
Ref: {{issue.token}}

Prosimy o potwierdzenie przyjęcia zgłoszenia.$t$::text;
$$;

-- ---------------------------------------------------------------------------
-- vendor_partners.dispatch_channel
-- ---------------------------------------------------------------------------

ALTER TABLE public.vendor_partners
  ADD COLUMN IF NOT EXISTS dispatch_channel text NOT NULL DEFAULT 'in_app';

ALTER TABLE public.vendor_partners
  DROP CONSTRAINT IF EXISTS vendor_partners_dispatch_channel_chk;

ALTER TABLE public.vendor_partners
  ADD CONSTRAINT vendor_partners_dispatch_channel_chk
  CHECK (dispatch_channel IN ('in_app', 'email'));

COMMENT ON COLUMN public.vendor_partners.dispatch_channel IS
  'in_app = partner logs into DOMIO; email = outbound template + inbound status mails.';

-- ---------------------------------------------------------------------------
-- Per-vendor email channel (1:1)
-- ---------------------------------------------------------------------------

CREATE TABLE public.vendor_email_channels (
  vendor_id uuid PRIMARY KEY REFERENCES public.vendor_partners (id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  outbound_to_email text,
  outbound_cc text[] NOT NULL DEFAULT '{}'::text[],
  outbound_subject_template text NOT NULL
    DEFAULT '[DOMIO {{issue.token}}] Zgłoszenie: {{building.address}}'::text,
  outbound_body_template text NOT NULL
    DEFAULT $t$Dzień dobry,

Przekazujemy zgłoszenie serwisowe do realizacji.

Budynek
{{building.name}}
{{building.address}}

Zgłoszenie
Kategoria: {{issue.category}}
Priorytet: {{issue.priority}}
Opis:
{{issue.description}}

Zgłaszający
{{reporter.name}}
Telefon: {{reporter.phone}}

Nadawca
{{org.name}}

Numer DOMIO: {{issue.id}}
Ref: {{issue.token}}

Prosimy o potwierdzenie przyjęcia zgłoszenia.$t$::text,
  inbound_from_allowlist text[] NOT NULL DEFAULT '{}'::text[],
  is_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_email_channels_subject_not_blank
    CHECK (length(btrim(outbound_subject_template)) > 0),
  CONSTRAINT vendor_email_channels_body_not_blank
    CHECK (length(btrim(outbound_body_template)) > 0),
  CONSTRAINT vendor_email_channels_to_email_fmt
    CHECK (
      outbound_to_email IS NULL
      OR (
        length(btrim(outbound_to_email)) >= 3
        AND position('@' IN outbound_to_email) > 1
      )
    ),
  CONSTRAINT vendor_email_channels_enabled_email_chk
    CHECK (
      is_enabled = false
      OR (
        outbound_to_email IS NOT NULL
        AND length(btrim(outbound_to_email)) >= 3
        AND position('@' IN outbound_to_email) > 1
      )
    )
);

COMMENT ON TABLE public.vendor_email_channels IS
  'Outbound SMTP templates and inbound sender allowlist for an email-channel vendor.';

CREATE INDEX vendor_email_channels_org_idx
  ON public.vendor_email_channels (org_id);

CREATE INDEX vendor_email_channels_org_enabled_idx
  ON public.vendor_email_channels (org_id)
  WHERE is_enabled = true;

CREATE TRIGGER vendor_email_channels_set_updated_at
  BEFORE UPDATE ON public.vendor_email_channels
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- Inbound status templates (one row per vendor event type)
-- ---------------------------------------------------------------------------

CREATE TABLE public.vendor_email_inbound_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendor_partners (id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  event_type text NOT NULL,
  subject_pattern text,
  body_pattern text NOT NULL,
  sample_body text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_email_inbound_templates_event_type_chk
    CHECK (event_type IN (
      'accepted',
      'assigned_technician',
      'completed',
      'rejected'
    )),
  CONSTRAINT vendor_email_inbound_templates_body_not_blank
    CHECK (length(btrim(body_pattern)) > 0),
  CONSTRAINT vendor_email_inbound_templates_vendor_event_uk
    UNIQUE (vendor_id, event_type)
);

COMMENT ON TABLE public.vendor_email_inbound_templates IS
  'Vendor CRM status-mail patterns. {{capture}} tokens become regex groups in Layer 3.';

CREATE INDEX vendor_email_inbound_templates_org_idx
  ON public.vendor_email_inbound_templates (org_id);

CREATE INDEX vendor_email_inbound_templates_vendor_idx
  ON public.vendor_email_inbound_templates (vendor_id);

CREATE TRIGGER vendor_email_inbound_templates_set_updated_at
  BEFORE UPDATE ON public.vendor_email_inbound_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- One email dispatch thread per issue
-- ---------------------------------------------------------------------------

CREATE TABLE public.issue_email_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  issue_id uuid NOT NULL REFERENCES public.property_issues (id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendor_partners (id) ON DELETE RESTRICT,
  correlation_token text NOT NULL,
  outbound_message_id text,
  vendor_external_ref text,
  status text NOT NULL DEFAULT 'queued',
  dispatch_error text,
  queued_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT issue_email_dispatches_issue_uk UNIQUE (issue_id),
  CONSTRAINT issue_email_dispatches_token_uk UNIQUE (correlation_token),
  CONSTRAINT issue_email_dispatches_token_fmt
    CHECK (correlation_token ~ '^[a-z0-9]{12}$'),
  CONSTRAINT issue_email_dispatches_status_chk
    CHECK (status IN ('queued', 'sent', 'failed', 'cancelled')),
  CONSTRAINT issue_email_dispatches_vendor_ref_not_blank
    CHECK (vendor_external_ref IS NULL OR length(btrim(vendor_external_ref)) > 0)
);

COMMENT ON TABLE public.issue_email_dispatches IS
  'Outbound email thread for a delegated issue. correlation_token is the plus-address / subject ref.';

CREATE INDEX issue_email_dispatches_org_status_idx
  ON public.issue_email_dispatches (org_id, status, queued_at DESC);

CREATE INDEX issue_email_dispatches_vendor_status_idx
  ON public.issue_email_dispatches (vendor_id, status);

CREATE INDEX issue_email_dispatches_vendor_ref_idx
  ON public.issue_email_dispatches (vendor_id, vendor_external_ref)
  WHERE vendor_external_ref IS NOT NULL;

CREATE TRIGGER issue_email_dispatches_set_updated_at
  BEFORE UPDATE ON public.issue_email_dispatches
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- Denormalized list fields on property_issues
-- ---------------------------------------------------------------------------

ALTER TABLE public.property_issues
  ADD COLUMN IF NOT EXISTS email_dispatch_status text,
  ADD COLUMN IF NOT EXISTS email_correlation_token text,
  ADD COLUMN IF NOT EXISTS vendor_external_ref text;

ALTER TABLE public.property_issues
  DROP CONSTRAINT IF EXISTS property_issues_email_dispatch_status_chk;

ALTER TABLE public.property_issues
  ADD CONSTRAINT property_issues_email_dispatch_status_chk
  CHECK (
    email_dispatch_status IS NULL
    OR email_dispatch_status IN ('queued', 'sent', 'failed')
  );

ALTER TABLE public.property_issues
  DROP CONSTRAINT IF EXISTS property_issues_email_token_fmt;

ALTER TABLE public.property_issues
  ADD CONSTRAINT property_issues_email_token_fmt
  CHECK (
    email_correlation_token IS NULL
    OR email_correlation_token ~ '^[a-z0-9]{12}$'
  );

CREATE UNIQUE INDEX IF NOT EXISTS property_issues_email_correlation_token_uk
  ON public.property_issues (email_correlation_token)
  WHERE email_correlation_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS property_issues_vendor_external_ref_idx
  ON public.property_issues (delegated_vendor_id, vendor_external_ref)
  WHERE vendor_external_ref IS NOT NULL;

COMMENT ON COLUMN public.property_issues.email_dispatch_status IS
  'Denormalized issue_email_dispatches.status for inbox lists (queued|sent|failed).';
COMMENT ON COLUMN public.property_issues.email_correlation_token IS
  'Copy of issue_email_dispatches.correlation_token for inbound plus-address lookup.';
COMMENT ON COLUMN public.property_issues.vendor_external_ref IS
  'External vendor ticket number extracted from their first matched status email.';

-- ---------------------------------------------------------------------------
-- Inbound status-mail log (separate from inbound_email_ingest ticket creation)
-- ---------------------------------------------------------------------------

CREATE TABLE public.vendor_email_inbound_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  vendor_id uuid REFERENCES public.vendor_partners (id) ON DELETE SET NULL,
  issue_id uuid REFERENCES public.property_issues (id) ON DELETE SET NULL,
  dispatch_id uuid REFERENCES public.issue_email_dispatches (id) ON DELETE SET NULL,
  message_id text NOT NULL,
  from_address text,
  to_address text,
  subject text,
  body_text text,
  matched_event_type text,
  extracted jsonb NOT NULL DEFAULT '{}'::jsonb,
  match_method text NOT NULL DEFAULT 'unmatched',
  status text NOT NULL DEFAULT 'received',
  error_detail text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_email_inbound_events_message_id_uk UNIQUE (message_id),
  CONSTRAINT vendor_email_inbound_events_extracted_object
    CHECK (jsonb_typeof(extracted) = 'object'),
  CONSTRAINT vendor_email_inbound_events_payload_object
    CHECK (jsonb_typeof(raw_payload) = 'object'),
  CONSTRAINT vendor_email_inbound_events_event_type_chk
    CHECK (
      matched_event_type IS NULL
      OR matched_event_type IN (
        'accepted',
        'assigned_technician',
        'completed',
        'rejected'
      )
    ),
  CONSTRAINT vendor_email_inbound_events_match_method_chk
    CHECK (match_method IN ('token', 'vendor_ref', 'template', 'unmatched')),
  CONSTRAINT vendor_email_inbound_events_status_chk
    CHECK (status IN (
      'received',
      'applied',
      'unmatched',
      'rejected',
      'duplicate'
    ))
);

COMMENT ON TABLE public.vendor_email_inbound_events IS
  'Idempotent log of vendor status emails. Dedup key is RFC Message-ID. Not used to create issues.';

CREATE INDEX vendor_email_inbound_events_org_created_idx
  ON public.vendor_email_inbound_events (org_id, created_at DESC);

CREATE INDEX vendor_email_inbound_events_vendor_created_idx
  ON public.vendor_email_inbound_events (vendor_id, created_at DESC)
  WHERE vendor_id IS NOT NULL;

CREATE INDEX vendor_email_inbound_events_issue_idx
  ON public.vendor_email_inbound_events (issue_id, created_at DESC)
  WHERE issue_id IS NOT NULL;

CREATE INDEX vendor_email_inbound_events_open_idx
  ON public.vendor_email_inbound_events (org_id, created_at DESC)
  WHERE status IN ('received', 'unmatched');

-- ---------------------------------------------------------------------------
-- Keep org_id aligned with vendor_partners / property_issues
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tg_vendor_email_set_org_from_vendor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT vp.org_id INTO v_org
  FROM public.vendor_partners vp
  WHERE vp.id = NEW.vendor_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono partnera.';
  END IF;

  NEW.org_id := v_org;
  RETURN NEW;
END;
$$;

CREATE TRIGGER vendor_email_channels_set_org
  BEFORE INSERT OR UPDATE OF vendor_id ON public.vendor_email_channels
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_vendor_email_set_org_from_vendor();

CREATE TRIGGER vendor_email_inbound_templates_set_org
  BEFORE INSERT OR UPDATE OF vendor_id ON public.vendor_email_inbound_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_vendor_email_set_org_from_vendor();

CREATE OR REPLACE FUNCTION public.tg_issue_email_dispatch_set_org()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_issue_org uuid;
  v_vendor_org uuid;
BEGIN
  SELECT pi.org_id INTO v_issue_org
  FROM public.property_issues pi
  WHERE pi.id = NEW.issue_id;

  SELECT vp.org_id INTO v_vendor_org
  FROM public.vendor_partners vp
  WHERE vp.id = NEW.vendor_id;

  IF v_issue_org IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono zgłoszenia.';
  END IF;
  IF v_vendor_org IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono partnera.';
  END IF;
  IF v_issue_org IS DISTINCT FROM v_vendor_org THEN
    RAISE EXCEPTION 'Partner nie należy do organizacji zgłoszenia.';
  END IF;

  NEW.org_id := v_issue_org;
  RETURN NEW;
END;
$$;

CREATE TRIGGER issue_email_dispatches_set_org
  BEFORE INSERT OR UPDATE OF issue_id, vendor_id ON public.issue_email_dispatches
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_issue_email_dispatch_set_org();

-- ---------------------------------------------------------------------------
-- Lifecycle event types for the email bridge
-- ---------------------------------------------------------------------------

ALTER TABLE public.issue_lifecycle_events
  DROP CONSTRAINT IF EXISTS issue_lifecycle_events_event_type_check;

ALTER TABLE public.issue_lifecycle_events
  ADD CONSTRAINT issue_lifecycle_events_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'claimed'::text,
    'started'::text,
    'cancel_requested'::text,
    'cancelled'::text,
    'transfer_requested'::text,
    'transfer_accepted'::text,
    'transfer_rejected'::text,
    'gps_start_override'::text,
    'dispatcher_forced'::text,
    'dispatcher_unforced'::text,
    'email_queued'::text,
    'email_sent'::text,
    'email_accepted'::text,
    'email_assigned'::text,
    'email_completed'::text,
    'email_rejected'::text,
    'email_unmatched'::text
  ]));

-- ---------------------------------------------------------------------------
-- Grants + RLS enabled (no policies yet — deny-by-default)
-- ---------------------------------------------------------------------------

ALTER TABLE public.vendor_email_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_email_inbound_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issue_email_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_email_inbound_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.vendor_email_channels FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.vendor_email_inbound_templates FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.issue_email_dispatches FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.vendor_email_inbound_events FROM anon, PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vendor_email_channels TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vendor_email_inbound_templates TO authenticated;
GRANT SELECT ON TABLE public.issue_email_dispatches TO authenticated;
GRANT SELECT ON TABLE public.vendor_email_inbound_events TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vendor_email_channels TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vendor_email_inbound_templates TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.issue_email_dispatches TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vendor_email_inbound_events TO service_role;
