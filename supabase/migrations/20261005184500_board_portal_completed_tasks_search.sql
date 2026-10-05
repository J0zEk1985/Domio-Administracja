BEGIN;

ALTER TABLE public.property_tasks
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

COMMENT ON COLUMN public.property_tasks.completed_at IS
  'Set when status becomes done; cleared when the task is reopened.';

UPDATE public.property_tasks
SET completed_at = created_at
WHERE status = 'done'
  AND completed_at IS NULL;

CREATE OR REPLACE FUNCTION public.property_tasks_set_completed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'done' THEN
    IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'done' THEN
      NEW.completed_at := COALESCE(NEW.completed_at, now());
    END IF;
  ELSE
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_property_tasks_completed_at ON public.property_tasks;
CREATE TRIGGER trg_property_tasks_completed_at
  BEFORE INSERT OR UPDATE OF status ON public.property_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.property_tasks_set_completed_at();

REVOKE ALL ON FUNCTION public.property_tasks_set_completed_at() FROM PUBLIC;

CREATE INDEX IF NOT EXISTS property_tasks_board_done_community_completed_idx
  ON public.property_tasks (community_id, completed_at DESC)
  WHERE visibility = 'board_visible' AND status = 'done';

CREATE INDEX IF NOT EXISTS property_tasks_board_done_location_completed_idx
  ON public.property_tasks (location_id, completed_at DESC)
  WHERE visibility = 'board_visible' AND status = 'done';

CREATE OR REPLACE FUNCTION public.get_board_portal_completed_tasks(
  p_token uuid,
  p_from date,
  p_to date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_community_id uuid;
  v_location_id uuid;
  v_from timestamptz;
  v_to_excl timestamptz;
  v_tasks jsonb;
BEGIN
  IF p_token IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR (p_to - p_from) > 366 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_range');
  END IF;

  v_from := (p_from::timestamp AT TIME ZONE 'Europe/Warsaw');
  v_to_excl := ((p_to + 1)::timestamp AT TIME ZONE 'Europe/Warsaw');

  SELECT id
  INTO v_community_id
  FROM public.communities
  WHERE board_portal_token = p_token
  LIMIT 1;

  IF v_community_id IS NULL THEN
    SELECT community_id, id
    INTO v_community_id, v_location_id
    FROM public.cleaning_locations
    WHERE board_portal_token = p_token
      AND COALESCE(is_admin_active, true) = true
    LIMIT 1;
  END IF;

  IF v_community_id IS NULL AND v_location_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_community_id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.completed_at DESC NULLS LAST), '[]'::jsonb)
    INTO v_tasks
    FROM (
      SELECT
        pt.id,
        pt.title,
        pt.status,
        pt.priority,
        pt.created_at,
        pt.completed_at,
        cl.name AS location_name,
        public.board_portal_task_comments_json(pt.id) AS comments
      FROM public.property_tasks pt
      LEFT JOIN public.cleaning_locations cl ON cl.id = pt.location_id
      WHERE pt.visibility = 'board_visible'
        AND pt.status = 'done'
        AND pt.completed_at >= v_from
        AND pt.completed_at < v_to_excl
        AND (
          pt.community_id = v_community_id
          OR cl.community_id = v_community_id
        )
      ORDER BY pt.completed_at DESC NULLS LAST
      LIMIT 80
    ) t;
  ELSE
    SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.completed_at DESC NULLS LAST), '[]'::jsonb)
    INTO v_tasks
    FROM (
      SELECT
        pt.id,
        pt.title,
        pt.status,
        pt.priority,
        pt.created_at,
        pt.completed_at,
        NULL::text AS location_name,
        public.board_portal_task_comments_json(pt.id) AS comments
      FROM public.property_tasks pt
      WHERE pt.visibility = 'board_visible'
        AND pt.status = 'done'
        AND pt.completed_at >= v_from
        AND pt.completed_at < v_to_excl
        AND pt.location_id = v_location_id
      ORDER BY pt.completed_at DESC NULLS LAST
      LIMIT 80
    ) t;
  END IF;

  RETURN jsonb_build_object('ok', true, 'tasks', COALESCE(v_tasks, '[]'::jsonb));
END;
$$;

COMMENT ON FUNCTION public.get_board_portal_completed_tasks(uuid, date, date) IS
  'Anonymous search of board_visible done tasks in a date range for Portal Zarządu. Called only when the guest submits the search.';

REVOKE ALL ON FUNCTION public.get_board_portal_completed_tasks(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_board_portal_completed_tasks(uuid, date, date) TO anon, authenticated;

COMMIT;
