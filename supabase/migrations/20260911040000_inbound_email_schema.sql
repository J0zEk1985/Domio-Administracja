-- Inbound email tickets: per-org aliases, ingest log, monthly AI parse quota.

ALTER TABLE public.pricing_plans
  ADD COLUMN IF NOT EXISTS ai_monthly_parse_limit integer;

ALTER TABLE public.pricing_plans
  DROP CONSTRAINT IF EXISTS pricing_plans_ai_monthly_parse_limit_chk;

ALTER TABLE public.pricing_plans
  ADD CONSTRAINT pricing_plans_ai_monthly_parse_limit_chk
  CHECK (ai_monthly_parse_limit IS NULL OR ai_monthly_parse_limit >= 0);

COMMENT ON COLUMN public.pricing_plans.ai_monthly_parse_limit IS
  'Hard monthly cap on Gemini parses for the org. 20 = base sample, 300 = paid AI add-on. NULL treated as 20 at ingest.';

UPDATE public.pricing_plans
SET ai_monthly_parse_limit = 20
WHERE ai_monthly_parse_limit IS NULL
  AND COALESCE(has_ai_features, false) = false;

UPDATE public.pricing_plans
SET ai_monthly_parse_limit = 300
WHERE COALESCE(has_ai_features, false) = true
  AND (ai_monthly_parse_limit IS NULL OR ai_monthly_parse_limit = 20);

ALTER TABLE public.pricing_plans
  ALTER COLUMN ai_monthly_parse_limit SET DEFAULT 20;

CREATE TABLE public.org_inbound_mailboxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  module text NOT NULL,
  alias_local_part text NOT NULL,
  display_address text,
  ingest_mode text NOT NULL DEFAULT 'redacted_template',
  is_enabled boolean NOT NULL DEFAULT true,
  auto_create_threshold numeric(4, 3) NOT NULL DEFAULT 0.750,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_inbound_mailboxes_module_chk
    CHECK (module IN ('serwis', 'cleaning', 'administracja')),
  CONSTRAINT org_inbound_mailboxes_ingest_mode_chk
    CHECK (ingest_mode IN ('redacted_template', 'ai_auto')),
  CONSTRAINT org_inbound_mailboxes_alias_chk
    CHECK (alias_local_part = lower(btrim(alias_local_part))
      AND length(alias_local_part) BETWEEN 3 AND 64
      AND alias_local_part ~ '^[a-z0-9]+[+._-][a-z0-9+._-]+$'),
  CONSTRAINT org_inbound_mailboxes_threshold_chk
    CHECK (auto_create_threshold >= 0 AND auto_create_threshold <= 1),
  CONSTRAINT org_inbound_mailboxes_org_module_uk UNIQUE (org_id, module),
  CONSTRAINT org_inbound_mailboxes_alias_uk UNIQUE (alias_local_part)
);

COMMENT ON TABLE public.org_inbound_mailboxes IS
  'Alias per organisation and module. Companies forward or send redacted mail here.';

COMMENT ON COLUMN public.org_inbound_mailboxes.ingest_mode IS
  'redacted_template = company edits then sends; ai_auto = raw forward (requires has_ai_features). Sample AI quota still applies in both modes.';

CREATE INDEX org_inbound_mailboxes_org_idx
  ON public.org_inbound_mailboxes (org_id);

CREATE TRIGGER org_inbound_mailboxes_set_updated_at
  BEFORE UPDATE ON public.org_inbound_mailboxes
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE public.inbound_email_ingest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  mailbox_id uuid REFERENCES public.org_inbound_mailboxes (id) ON DELETE SET NULL,
  message_id text NOT NULL,
  from_address text,
  to_address text NOT NULL,
  subject text,
  body_text text,
  parse_method text NOT NULL DEFAULT 'template',
  ai_confidence numeric(4, 3),
  matched_location_id uuid REFERENCES public.cleaning_locations (id) ON DELETE SET NULL,
  issue_id uuid REFERENCES public.property_issues (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'received',
  error_detail text,
  prompt_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inbound_email_ingest_message_id_uk UNIQUE (message_id),
  CONSTRAINT inbound_email_ingest_parse_method_chk
    CHECK (parse_method IN ('template', 'ai', 'manual')),
  CONSTRAINT inbound_email_ingest_status_chk
    CHECK (status IN (
      'received', 'parsed', 'created', 'needs_review', 'rejected', 'duplicate'
    )),
  CONSTRAINT inbound_email_ingest_tokens_chk
    CHECK (prompt_tokens >= 0 AND output_tokens >= 0),
  CONSTRAINT inbound_email_ingest_confidence_chk
    CHECK (ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1))
);

COMMENT ON TABLE public.inbound_email_ingest IS
  'Idempotent log of inbound emails. Dedup key is RFC Message-ID.';

CREATE INDEX inbound_email_ingest_org_created_idx
  ON public.inbound_email_ingest (org_id, created_at DESC);

CREATE INDEX inbound_email_ingest_mailbox_idx
  ON public.inbound_email_ingest (mailbox_id, created_at DESC);

CREATE INDEX inbound_email_ingest_status_idx
  ON public.inbound_email_ingest (status)
  WHERE status IN ('needs_review', 'received');

CREATE TABLE public.org_ai_usage_monthly (
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  year_month date NOT NULL,
  parse_count integer NOT NULL DEFAULT 0,
  prompt_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, year_month),
  CONSTRAINT org_ai_usage_monthly_month_chk
    CHECK (year_month = date_trunc('month', year_month::timestamp)::date),
  CONSTRAINT org_ai_usage_monthly_nonneg_chk
    CHECK (parse_count >= 0 AND prompt_tokens >= 0 AND output_tokens >= 0)
);

COMMENT ON TABLE public.org_ai_usage_monthly IS
  'UTC calendar-month Gemini parse counters. Unused sample quota does not roll over.';
