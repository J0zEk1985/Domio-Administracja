-- =============================================================================
-- Property Tasks & Notes — schema, RLS, helper RPC
-- =============================================================================
-- Deploy: Supabase Dashboard → SQL Editor → paste this file → Run
-- Or: supabase db push (if CLI linked to the project)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Enums
-- -----------------------------------------------------------------------------
CREATE TYPE public.property_task_status AS ENUM ('todo', 'in_progress', 'done');
CREATE TYPE public.property_task_priority AS ENUM ('low', 'medium', 'urgent');
CREATE TYPE public.property_task_visibility AS ENUM ('internal_only', 'board_visible');

-- -----------------------------------------------------------------------------
-- 2. Tables
-- -----------------------------------------------------------------------------
CREATE TABLE public.property_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.cleaning_locations (id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) > 0),
  status public.property_task_status NOT NULL DEFAULT 'todo',
  priority public.property_task_priority NOT NULL DEFAULT 'medium',
  visibility public.property_task_visibility NOT NULL DEFAULT 'internal_only',
  assignee_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES public.profiles (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_property_tasks_location_id ON public.property_tasks (location_id);
CREATE INDEX idx_property_tasks_status ON public.property_tasks (status);

CREATE TABLE public.task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.property_tasks (id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles (id),
  content text NOT NULL CHECK (length(trim(content)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_comments_task_id ON public.task_comments (task_id);

-- -----------------------------------------------------------------------------
-- 3. Access helpers (SECURITY DEFINER — avoid RLS recursion, centralize rules)
-- -----------------------------------------------------------------------------
-- Owner: active membership with role owner in the organization of the location.
-- Admin: row in location_access for same location, access_type = administration, not expired.

CREATE OR REPLACE FUNCTION public.property_task_user_has_access (p_location_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.cleaning_locations cl
      INNER JOIN public.memberships m
        ON m.org_id = cl.org_id
       AND m.user_id = auth.uid()
       AND m.is_active = true
       AND lower(trim(m.role)) = 'owner'
      WHERE cl.id = p_location_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.location_access la
      WHERE la.location_id = p_location_id
        AND la.user_id = auth.uid()
        AND la.access_type = 'administration'
        AND (la.expires_at IS NULL OR la.expires_at > now())
    );
$$;

COMMENT ON FUNCTION public.property_task_user_has_access (uuid) IS
  'True if current user is org Owner for the location or has administration location_access.';

-- Resolve location_id for a task without triggering RLS on property_tasks (used by task_comments policies).
CREATE OR REPLACE FUNCTION public.property_task_location_id (p_task_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT location_id FROM public.property_tasks WHERE id = p_task_id;
$$;

-- -----------------------------------------------------------------------------
-- 4. Row Level Security — property_tasks
-- -----------------------------------------------------------------------------
ALTER TABLE public.property_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "property_tasks_select_access"
  ON public.property_tasks
  FOR SELECT
  TO authenticated
  USING (public.property_task_user_has_access (location_id));

CREATE POLICY "property_tasks_insert_access"
  ON public.property_tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.property_task_user_has_access (location_id)
    AND created_by = auth.uid ()
  );

CREATE POLICY "property_tasks_update_access"
  ON public.property_tasks
  FOR UPDATE
  TO authenticated
  USING (public.property_task_user_has_access (location_id))
  WITH CHECK (public.property_task_user_has_access (location_id));

CREATE POLICY "property_tasks_delete_access"
  ON public.property_tasks
  FOR DELETE
  TO authenticated
  USING (public.property_task_user_has_access (location_id));

-- -----------------------------------------------------------------------------
-- 5. Row Level Security — task_comments
-- -----------------------------------------------------------------------------
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_comments_select_access"
  ON public.task_comments
  FOR SELECT
  TO authenticated
  USING (
    public.property_task_user_has_access (public.property_task_location_id (task_id))
  );

CREATE POLICY "task_comments_insert_access"
  ON public.task_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid ()
    AND public.property_task_user_has_access (public.property_task_location_id (task_id))
  );

CREATE POLICY "task_comments_update_access"
  ON public.task_comments
  FOR UPDATE
  TO authenticated
  USING (
    public.property_task_user_has_access (public.property_task_location_id (task_id))
  )
  WITH CHECK (
    public.property_task_user_has_access (public.property_task_location_id (task_id))
  );

CREATE POLICY "task_comments_delete_access"
  ON public.task_comments
  FOR DELETE
  TO authenticated
  USING (
    public.property_task_user_has_access (public.property_task_location_id (task_id))
  );

-- -----------------------------------------------------------------------------
-- 6. RPC — tasks for one location with comments_count (single round-trip)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_property_tasks_with_comment_counts (p_location_id uuid)
RETURNS TABLE (
  id uuid,
  location_id uuid,
  title text,
  status public.property_task_status,
  priority public.property_task_priority,
  visibility public.property_task_visibility,
  assignee_id uuid,
  created_by uuid,
  created_at timestamptz,
  comments_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    pt.id,
    pt.location_id,
    pt.title,
    pt.status,
    pt.priority,
    pt.visibility,
    pt.assignee_id,
    pt.created_by,
    pt.created_at,
    (
      SELECT count(*)::bigint
      FROM public.task_comments tc
      WHERE tc.task_id = pt.id
    ) AS comments_count
  FROM public.property_tasks pt
  WHERE pt.location_id = p_location_id
  ORDER BY pt.created_at DESC;
$$;

COMMENT ON FUNCTION public.get_property_tasks_with_comment_counts (uuid) IS
  'Lists property_tasks for a location with aggregated comment counts; RLS applies per row.';

-- Optional: expose RPC to PostgREST
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_comments TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_property_tasks_with_comment_counts (uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.property_task_user_has_access (uuid) TO authenticated;

GRANT USAGE ON TYPE public.property_task_status TO authenticated;
GRANT USAGE ON TYPE public.property_task_priority TO authenticated;
GRANT USAGE ON TYPE public.property_task_visibility TO authenticated;

-- -----------------------------------------------------------------------------
-- 7. API alternative (PostgREST aggregate — no RPC)
-- -----------------------------------------------------------------------------
-- From the client (single query, no N+1 for counts):
--   supabase
--     .from('property_tasks')
--     .select(`
--       id, location_id, title, status, priority, visibility,
--       assignee_id, created_by, created_at,
--       task_comments (count)
--     `)
--     .eq('location_id', locationId)
-- Map `task_comments` aggregate to `comments_count` in the UI layer if needed.
