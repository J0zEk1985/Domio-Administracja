-- =============================================================================
-- DEVELOPER WARRANTY MODULE
-- =============================================================================
-- Moduł usterek deweloperskich - zarządzanie dostępem deweloperów i usterkami
-- w okresie gwarancji budowlanej na poziomie Wspólnoty.
--
-- WARSTWA 1: Schema (Tabele + Typy)
-- WARSTWA 2: RPC Functions (Business Logic)
-- WARSTWA 3: RLS Policies (Security)
-- =============================================================================

-- =============================================================================
-- WARSTWA 1: SCHEMA
-- =============================================================================

-- Typ statusu usterki deweloperskiej
CREATE TYPE developer_warranty_issue_status AS ENUM (
  'draft',        -- Draft created by AI or Admin (not yet published)
  'reported',     -- Published by Admin, visible to Developer
  'acknowledged', -- Developer acknowledged receipt
  'in_progress',  -- Developer is working on it
  'completed',    -- Developer marked as fixed
  'rejected',     -- Developer rejected the defect
  'appealed'      -- Admin appealed after rejection
);

-- -----------------------------------------------------------------------------
-- Tabela: developer_accesses
-- Przechowuje dane dostępowe Deweloperów do Portalu dla danej Wspólnoty
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.developer_accesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  developer_email text NOT NULL,
  developer_name text NOT NULL,
  
  -- Activation & Access
  activation_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  activation_token_expires_at timestamptz DEFAULT (now() + interval '7 days'),
  activated_at timestamptz,
  pin_hash text, -- bcrypt hash of 4-6 digit PIN set by developer
  
  -- Access token for portal (stable link)
  access_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deactivated_at timestamptz,
  deactivated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_login_at timestamptz,
  
  CONSTRAINT developer_accesses_community_uidx UNIQUE (community_id),
  CONSTRAINT developer_accesses_email_fmt CHECK (developer_email ~ '^[^@]+@[^@]+\.[^@]+$'),
  CONSTRAINT developer_accesses_pin_hash_when_activated CHECK (
    activated_at IS NULL OR pin_hash IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_developer_accesses_org ON public.developer_accesses(org_id);
CREATE INDEX IF NOT EXISTS idx_developer_accesses_community ON public.developer_accesses(community_id);
CREATE INDEX IF NOT EXISTS idx_developer_accesses_activation_token ON public.developer_accesses(activation_token) 
  WHERE activated_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_developer_accesses_access_token ON public.developer_accesses(access_token);

COMMENT ON TABLE public.developer_accesses IS 
  'Developer portal access credentials per Community. Developer sets their own PIN after email activation.';

-- -----------------------------------------------------------------------------
-- Tabela: developer_warranty_issues
-- Główna tabela usterek deweloperskich
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.developer_warranty_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  location_master_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  
  -- Issue Details
  title text NOT NULL,
  description text,
  category text, -- e.g., 'Hydraulika', 'Elektryka', 'Stolarka', etc.
  location_detail text, -- e.g., 'Klatka A, parter', 'Parking podziemny -1'
  priority text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  
  -- Photos
  photos_reported text[] DEFAULT '{}', -- URLs to photos from initial report
  photos_completion text[] DEFAULT '{}', -- URLs to photos after completion by developer
  
  -- Status & Dates
  status developer_warranty_issue_status NOT NULL DEFAULT 'draft',
  reported_at timestamptz, -- When Admin published (draft -> reported)
  acknowledged_at timestamptz,
  completed_at timestamptz,
  rejected_at timestamptz,
  appealed_at timestamptz,
  
  -- Rejection & Appeal
  rejection_reason text,
  appeal_notes text,
  
  -- Source tracking (future-proofing for AI)
  source_type text DEFAULT 'manual' CHECK (source_type IN ('manual', 'ai_protocol')),
  source_metadata jsonb DEFAULT '{}',
  
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  CONSTRAINT warranty_issue_reported_at_when_published CHECK (
    status = 'draft' OR reported_at IS NOT NULL
  ),
  CONSTRAINT warranty_issue_rejection_reason_when_rejected CHECK (
    status != 'rejected' OR rejection_reason IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_warranty_issues_community ON public.developer_warranty_issues(community_id);
CREATE INDEX IF NOT EXISTS idx_warranty_issues_org ON public.developer_warranty_issues(org_id);
CREATE INDEX IF NOT EXISTS idx_warranty_issues_status ON public.developer_warranty_issues(status);
CREATE INDEX IF NOT EXISTS idx_warranty_issues_created ON public.developer_warranty_issues(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_warranty_issues_location_master ON public.developer_warranty_issues(location_master_id) 
  WHERE location_master_id IS NOT NULL;

COMMENT ON TABLE public.developer_warranty_issues IS 
  'Developer warranty defects reported by Property Admin to Developer, tracked through resolution or appeal.';

-- -----------------------------------------------------------------------------
-- Tabela: developer_warranty_issue_comments
-- Komentarze do usterek (Admin ↔ Developer communication)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.developer_warranty_issue_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES public.developer_warranty_issues(id) ON DELETE CASCADE,
  
  -- Author
  author_type text NOT NULL CHECK (author_type IN ('admin', 'developer')),
  author_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- For admin
  author_name text, -- Display name
  
  -- Content
  comment_text text NOT NULL,
  attachments text[] DEFAULT '{}', -- URLs to attachments
  
  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT warranty_comment_author_user_when_admin CHECK (
    author_type != 'admin' OR author_user_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_warranty_comments_issue ON public.developer_warranty_issue_comments(issue_id, created_at);

COMMENT ON TABLE public.developer_warranty_issue_comments IS 
  'Communication thread between Admin and Developer on warranty defects.';

-- -----------------------------------------------------------------------------
-- Tabela: developer_warranty_issue_events
-- Log zdarzeń (audit trail) dla każdej usterki
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.developer_warranty_issue_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES public.developer_warranty_issues(id) ON DELETE CASCADE,
  
  -- Event
  event_type text NOT NULL, -- e.g., 'created', 'published', 'status_changed', 'commented', 'photos_added'
  old_status developer_warranty_issue_status,
  new_status developer_warranty_issue_status,
  
  -- Actor
  actor_type text NOT NULL CHECK (actor_type IN ('admin', 'developer', 'system')),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name text,
  
  -- Details
  event_metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warranty_events_issue ON public.developer_warranty_issue_events(issue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_warranty_events_created ON public.developer_warranty_issue_events(created_at DESC);

COMMENT ON TABLE public.developer_warranty_issue_events IS 
  'Audit trail for all warranty issue lifecycle events.';

-- -----------------------------------------------------------------------------
-- Tabela: community_warranty_settings
-- Ustawienia widoczności usterek dla mieszkańców na poziomie Wspólnoty
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_warranty_settings (
  community_id uuid PRIMARY KEY REFERENCES public.communities(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Visibility for residents in Home app
  resident_visibility_enabled boolean NOT NULL DEFAULT false,
  
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_community_warranty_settings_org ON public.community_warranty_settings(org_id);

COMMENT ON TABLE public.community_warranty_settings IS 
  'Per-community settings for developer warranty module, including resident visibility toggle.';

-- =============================================================================
-- WARSTWA 2: RPC FUNCTIONS (Business Logic)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Function: create_developer_access_and_send_invite
-- Tworzy dostęp dla dewelopera i zwraca link aktywacyjny
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_developer_access_and_send_invite(
  p_community_id uuid,
  p_developer_email text,
  p_developer_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id uuid;
  v_access_id uuid;
  v_activation_token uuid;
  v_existing_email text;
BEGIN
  -- Get org_id from community
  SELECT org_id INTO v_org_id
  FROM public.communities
  WHERE id = p_community_id;
  
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'community_not_found'
    );
  END IF;
  
  -- Check if access already exists for this community
  SELECT developer_email INTO v_existing_email
  FROM public.developer_accesses
  WHERE community_id = p_community_id;
  
  IF v_existing_email IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'developer_access_already_exists',
      'existing_email', v_existing_email
    );
  END IF;
  
  -- Create developer access
  INSERT INTO public.developer_accesses (
    community_id,
    org_id,
    developer_email,
    developer_name,
    created_by
  ) VALUES (
    p_community_id,
    v_org_id,
    p_developer_email,
    p_developer_name,
    auth.uid()
  )
  RETURNING id, activation_token INTO v_access_id, v_activation_token;
  
  -- Return success with activation URL
  RETURN jsonb_build_object(
    'ok', true,
    'access_id', v_access_id,
    'activation_token', v_activation_token,
    'activation_url', '/developer-activation/' || v_activation_token::text
  );
END;
$$;

COMMENT ON FUNCTION public.create_developer_access_and_send_invite IS
  'Creates developer access for a community and returns activation link. In production, triggers n8n email automation.';

-- -----------------------------------------------------------------------------
-- Function: get_developer_activation_info
-- Pobiera informacje o aktywacji dla danego tokenu
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_developer_activation_info(
  p_activation_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_access record;
  v_community record;
BEGIN
  -- Get developer access with token validation
  SELECT da.*, c.name as community_name, c.legal_name as community_legal_name
  INTO v_access
  FROM public.developer_accesses da
  JOIN public.communities c ON c.id = da.community_id
  WHERE da.activation_token = p_activation_token
    AND da.activated_at IS NULL
    AND (da.activation_token_expires_at IS NULL OR da.activation_token_expires_at > now());
  
  IF v_access IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'token_invalid_or_expired'
    );
  END IF;
  
  RETURN jsonb_build_object(
    'ok', true,
    'developer_name', v_access.developer_name,
    'developer_email', v_access.developer_email,
    'community_name', v_access.community_name,
    'community_legal_name', v_access.community_legal_name
  );
END;
$$;

COMMENT ON FUNCTION public.get_developer_activation_info IS
  'Returns developer and community info for activation page if token is valid and not expired.';

-- -----------------------------------------------------------------------------
-- Function: activate_developer_access
-- Aktywuje dostęp dewelopera ustawiając PIN
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activate_developer_access(
  p_activation_token uuid,
  p_pin text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_access_id uuid;
  v_pin_hash text;
BEGIN
  -- Validate PIN format (4-6 digits)
  IF p_pin !~ '^\d{4,6}$' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_pin_format'
    );
  END IF;
  
  -- Check if token exists and is not activated
  SELECT id INTO v_access_id
  FROM public.developer_accesses
  WHERE activation_token = p_activation_token
    AND activated_at IS NULL
    AND (activation_token_expires_at IS NULL OR activation_token_expires_at > now());
  
  IF v_access_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'token_invalid_or_expired'
    );
  END IF;
  
  -- Hash the PIN using pgcrypto
  v_pin_hash := crypt(p_pin, gen_salt('bf', 10));
  
  -- Activate the access
  UPDATE public.developer_accesses
  SET 
    activated_at = now(),
    pin_hash = v_pin_hash,
    activation_token_expires_at = NULL -- Clear expiration after activation
  WHERE id = v_access_id;
  
  RETURN jsonb_build_object(
    'ok', true,
    'message', 'Developer access activated successfully'
  );
END;
$$;

COMMENT ON FUNCTION public.activate_developer_access IS
  'Activates developer access by setting the PIN hash. Token becomes invalid after activation.';

-- -----------------------------------------------------------------------------
-- Function: developer_portal_login
-- Logowanie dewelopera do portalu używając access_token i PIN
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.developer_portal_login(
  p_access_token uuid,
  p_pin text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_access record;
  v_pin_valid boolean;
BEGIN
  -- Get developer access
  SELECT da.*, c.name as community_name
  INTO v_access
  FROM public.developer_accesses da
  JOIN public.communities c ON c.id = da.community_id
  WHERE da.access_token = p_access_token
    AND da.activated_at IS NOT NULL
    AND da.deactivated_at IS NULL;
  
  IF v_access IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'access_not_found_or_inactive'
    );
  END IF;
  
  -- Verify PIN
  v_pin_valid := (v_access.pin_hash = crypt(p_pin, v_access.pin_hash));
  
  IF NOT v_pin_valid THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_pin'
    );
  END IF;
  
  -- Update last login
  UPDATE public.developer_accesses
  SET last_login_at = now()
  WHERE id = v_access.id;
  
  -- Return success with access info
  RETURN jsonb_build_object(
    'ok', true,
    'access_id', v_access.id,
    'community_id', v_access.community_id,
    'developer_name', v_access.developer_name,
    'developer_email', v_access.developer_email
  );
END;
$$;

COMMENT ON FUNCTION public.developer_portal_login IS
  'Developer portal login using access_token and PIN. Updates last_login_at on success.';

-- -----------------------------------------------------------------------------
-- Function: get_developer_portal_data
-- Pobiera dane dla portalu dewelopera (wspólnota + usterki)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_developer_portal_data(
  p_access_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_access record;
  v_community jsonb;
  v_issues jsonb;
BEGIN
  -- Get developer access
  SELECT da.*
  INTO v_access
  FROM public.developer_accesses da
  WHERE da.access_token = p_access_token
    AND da.activated_at IS NOT NULL
    AND da.deactivated_at IS NULL;
  
  IF v_access IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'access_not_found_or_inactive'
    );
  END IF;
  
  -- Get community info
  SELECT jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'legal_name', c.legal_name
  ) INTO v_community
  FROM public.communities c
  WHERE c.id = v_access.community_id;
  
  -- Get issues for this community (only reported and beyond)
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', i.id,
      'title', i.title,
      'description', i.description,
      'category', i.category,
      'location_detail', i.location_detail,
      'priority', i.priority,
      'status', i.status,
      'photos_reported', i.photos_reported,
      'photos_completion', i.photos_completion,
      'reported_at', i.reported_at,
      'acknowledged_at', i.acknowledged_at,
      'completed_at', i.completed_at,
      'rejected_at', i.rejected_at,
      'appealed_at', i.appealed_at,
      'rejection_reason', i.rejection_reason,
      'appeal_notes', i.appeal_notes,
      'created_at', i.created_at,
      'updated_at', i.updated_at
    ) ORDER BY i.created_at DESC
  ) INTO v_issues
  FROM public.developer_warranty_issues i
  WHERE i.community_id = v_access.community_id
    AND i.status != 'draft'; -- Don't show drafts to developer
  
  RETURN jsonb_build_object(
    'ok', true,
    'community', v_community,
    'issues', COALESCE(v_issues, '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.get_developer_portal_data IS
  'Returns community info and all non-draft warranty issues for developer portal.';

-- -----------------------------------------------------------------------------
-- Function: developer_add_warranty_issue_comment
-- Dodaje komentarz od dewelopera do usterki
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.developer_add_warranty_issue_comment(
  p_access_token uuid,
  p_issue_id uuid,
  p_comment_text text,
  p_attachments text[] DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_access record;
  v_comment_id uuid;
BEGIN
  -- Verify developer access
  SELECT da.*
  INTO v_access
  FROM public.developer_accesses da
  WHERE da.access_token = p_access_token
    AND da.activated_at IS NOT NULL
    AND da.deactivated_at IS NULL;
  
  IF v_access IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'access_not_found_or_inactive'
    );
  END IF;
  
  -- Verify issue belongs to this community
  IF NOT EXISTS (
    SELECT 1 FROM public.developer_warranty_issues
    WHERE id = p_issue_id AND community_id = v_access.community_id
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'issue_not_found'
    );
  END IF;
  
  -- Insert comment
  INSERT INTO public.developer_warranty_issue_comments (
    issue_id,
    author_type,
    author_name,
    comment_text,
    attachments
  ) VALUES (
    p_issue_id,
    'developer',
    v_access.developer_name,
    p_comment_text,
    p_attachments
  )
  RETURNING id INTO v_comment_id;
  
  -- Log event
  INSERT INTO public.developer_warranty_issue_events (
    issue_id,
    event_type,
    actor_type,
    actor_name,
    event_metadata
  ) VALUES (
    p_issue_id,
    'commented',
    'developer',
    v_access.developer_name,
    jsonb_build_object('comment_id', v_comment_id)
  );
  
  RETURN jsonb_build_object(
    'ok', true,
    'comment_id', v_comment_id
  );
END;
$$;

COMMENT ON FUNCTION public.developer_add_warranty_issue_comment IS
  'Adds a comment from developer to a warranty issue with audit trail.';

-- -----------------------------------------------------------------------------
-- Function: developer_update_warranty_issue_status
-- Zmienia status usterki przez dewelopera
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.developer_update_warranty_issue_status(
  p_access_token uuid,
  p_issue_id uuid,
  p_new_status text,
  p_rejection_reason text DEFAULT NULL,
  p_photos_completion text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_access record;
  v_issue record;
  v_old_status text;
BEGIN
  -- Verify developer access
  SELECT da.*
  INTO v_access
  FROM public.developer_accesses da
  WHERE da.access_token = p_access_token
    AND da.activated_at IS NOT NULL
    AND da.deactivated_at IS NULL;
  
  IF v_access IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'access_not_found_or_inactive'
    );
  END IF;
  
  -- Get current issue
  SELECT * INTO v_issue
  FROM public.developer_warranty_issues
  WHERE id = p_issue_id AND community_id = v_access.community_id;
  
  IF v_issue IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'issue_not_found'
    );
  END IF;
  
  v_old_status := v_issue.status;
  
  -- Validate status transition (developer can only: acknowledge, in_progress, complete, reject)
  IF p_new_status NOT IN ('acknowledged', 'in_progress', 'completed', 'rejected') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_status_for_developer'
    );
  END IF;
  
  -- Update issue status
  UPDATE public.developer_warranty_issues
  SET 
    status = p_new_status::developer_warranty_issue_status,
    acknowledged_at = CASE WHEN p_new_status = 'acknowledged' THEN now() ELSE acknowledged_at END,
    completed_at = CASE WHEN p_new_status = 'completed' THEN now() ELSE completed_at END,
    rejected_at = CASE WHEN p_new_status = 'rejected' THEN now() ELSE rejected_at END,
    rejection_reason = CASE WHEN p_new_status = 'rejected' THEN p_rejection_reason ELSE rejection_reason END,
    photos_completion = CASE WHEN p_new_status = 'completed' AND p_photos_completion IS NOT NULL 
                        THEN p_photos_completion ELSE photos_completion END,
    updated_at = now()
  WHERE id = p_issue_id;
  
  -- Log event
  INSERT INTO public.developer_warranty_issue_events (
    issue_id,
    event_type,
    old_status,
    new_status,
    actor_type,
    actor_name,
    event_metadata
  ) VALUES (
    p_issue_id,
    'status_changed',
    v_old_status::developer_warranty_issue_status,
    p_new_status::developer_warranty_issue_status,
    'developer',
    v_access.developer_name,
    jsonb_build_object(
      'rejection_reason', p_rejection_reason,
      'has_completion_photos', (p_photos_completion IS NOT NULL)
    )
  );
  
  RETURN jsonb_build_object(
    'ok', true,
    'issue_id', p_issue_id,
    'new_status', p_new_status
  );
END;
$$;

COMMENT ON FUNCTION public.developer_update_warranty_issue_status IS
  'Updates warranty issue status by developer. Allowed statuses: acknowledged, in_progress, completed, rejected.';

-- =============================================================================
-- WARSTWA 3: RLS POLICIES (Security)
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE public.developer_accesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_warranty_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_warranty_issue_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_warranty_issue_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_warranty_settings ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- RLS: developer_accesses
-- -----------------------------------------------------------------------------

-- Admin can view accesses for their org
CREATE POLICY developer_accesses_admin_select ON public.developer_accesses
  FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM public.org_memberships
      WHERE user_id = auth.uid()
    )
  );

-- Admin can insert accesses for their org (via RPC function)
CREATE POLICY developer_accesses_admin_insert ON public.developer_accesses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.org_memberships
      WHERE user_id = auth.uid()
    )
  );

-- Admin can update accesses for their org (deactivation)
CREATE POLICY developer_accesses_admin_update ON public.developer_accesses
  FOR UPDATE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM public.org_memberships
      WHERE user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- RLS: developer_warranty_issues
-- -----------------------------------------------------------------------------

-- Admin can view all issues for their org
CREATE POLICY warranty_issues_admin_select ON public.developer_warranty_issues
  FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM public.org_memberships
      WHERE user_id = auth.uid()
    )
  );

-- Admin can insert issues for their org
CREATE POLICY warranty_issues_admin_insert ON public.developer_warranty_issues
  FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.org_memberships
      WHERE user_id = auth.uid()
    )
  );

-- Admin can update issues for their org
CREATE POLICY warranty_issues_admin_update ON public.developer_warranty_issues
  FOR UPDATE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM public.org_memberships
      WHERE user_id = auth.uid()
    )
  );

-- Admin can delete issues for their org
CREATE POLICY warranty_issues_admin_delete ON public.developer_warranty_issues
  FOR DELETE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM public.org_memberships
      WHERE user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- RLS: developer_warranty_issue_comments
-- -----------------------------------------------------------------------------

-- Admin can view comments for issues in their org
CREATE POLICY warranty_comments_admin_select ON public.developer_warranty_issue_comments
  FOR SELECT
  TO authenticated
  USING (
    issue_id IN (
      SELECT id FROM public.developer_warranty_issues
      WHERE org_id IN (
        SELECT org_id FROM public.org_memberships
        WHERE user_id = auth.uid()
      )
    )
  );

-- Admin can insert comments (via regular table or RPC)
CREATE POLICY warranty_comments_admin_insert ON public.developer_warranty_issue_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    issue_id IN (
      SELECT id FROM public.developer_warranty_issues
      WHERE org_id IN (
        SELECT org_id FROM public.org_memberships
        WHERE user_id = auth.uid()
      )
    )
  );

-- -----------------------------------------------------------------------------
-- RLS: developer_warranty_issue_events
-- -----------------------------------------------------------------------------

-- Admin can view events for issues in their org
CREATE POLICY warranty_events_admin_select ON public.developer_warranty_issue_events
  FOR SELECT
  TO authenticated
  USING (
    issue_id IN (
      SELECT id FROM public.developer_warranty_issues
      WHERE org_id IN (
        SELECT org_id FROM public.org_memberships
        WHERE user_id = auth.uid()
      )
    )
  );

-- System can insert events (triggers/functions)
CREATE POLICY warranty_events_system_insert ON public.developer_warranty_issue_events
  FOR INSERT
  TO authenticated
  WITH CHECK (true); -- Events are created by SECURITY DEFINER functions

-- -----------------------------------------------------------------------------
-- RLS: community_warranty_settings
-- -----------------------------------------------------------------------------

-- Admin can view settings for their org
CREATE POLICY warranty_settings_admin_select ON public.community_warranty_settings
  FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM public.org_memberships
      WHERE user_id = auth.uid()
    )
  );

-- Admin can insert/update settings for their org
CREATE POLICY warranty_settings_admin_upsert ON public.community_warranty_settings
  FOR ALL
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM public.org_memberships
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.org_memberships
      WHERE user_id = auth.uid()
    )
  );

-- =============================================================================
-- GRANT PERMISSIONS
-- =============================================================================

-- Grant execute permissions on RPC functions to authenticated users
GRANT EXECUTE ON FUNCTION public.create_developer_access_and_send_invite TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_developer_activation_info TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_developer_access TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.developer_portal_login TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_developer_portal_data TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.developer_add_warranty_issue_comment TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.developer_update_warranty_issue_status TO anon, authenticated;

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
