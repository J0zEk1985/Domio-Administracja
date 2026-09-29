-- Board portal: comments on board_visible tasks (read in snapshot, write via token RPC).

ALTER TABLE public.task_comments
  ALTER COLUMN author_id DROP NOT NULL;

ALTER TABLE public.task_comments
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'staff';

UPDATE public.task_comments
SET source = 'staff'
WHERE source IS NULL OR btrim(source) = '';

ALTER TABLE public.task_comments
  DROP CONSTRAINT IF EXISTS task_comments_source_check;

ALTER TABLE public.task_comments
  ADD CONSTRAINT task_comments_source_check
  CHECK (source IN ('staff', 'board'));

ALTER TABLE public.task_comments
  DROP CONSTRAINT IF EXISTS task_comments_source_author_chk;

ALTER TABLE public.task_comments
  ADD CONSTRAINT task_comments_source_author_chk
  CHECK (
    (source = 'staff' AND author_id IS NOT NULL)
    OR (source = 'board' AND author_id IS NULL)
  );

COMMENT ON COLUMN public.task_comments.source IS
  'staff = logged-in administrator; board = guest comment from Portal Zarządu.';

CREATE OR REPLACE FUNCTION public.board_portal_task_comments_json(p_task_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'content', c.content,
        'created_at', c.created_at,
        'source', c.source,
        'author_name', c.author_name
      )
      ORDER BY c.created_at ASC
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT
      tc.id,
      left(tc.content, 4000) AS content,
      tc.created_at,
      tc.source,
      CASE
        WHEN tc.source = 'board' THEN 'Zarząd'::text
        ELSE COALESCE(NULLIF(btrim(p.full_name), ''), 'Administracja')
      END AS author_name
    FROM public.task_comments tc
    LEFT JOIN public.profiles p ON p.id = tc.author_id
    WHERE tc.task_id = p_task_id
    ORDER BY tc.created_at ASC
    LIMIT 80
  ) c;
$$;

REVOKE ALL ON FUNCTION public.board_portal_task_comments_json(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.board_portal_task_comments_json(uuid) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_board_portal_snapshot(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_community public.communities%ROWTYPE;
  v_loc public.cleaning_locations%ROWTYPE;
  v_issues jsonb;
  v_tasks jsonb;
  v_announcements jsonb;
  v_contacts jsonb;
BEGIN
  IF p_token IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  SELECT *
  INTO v_community
  FROM public.communities
  WHERE board_portal_token = p_token
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT *
    INTO v_loc
    FROM public.cleaning_locations
    WHERE board_portal_token = p_token
      AND COALESCE(is_admin_active, true) = true
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_found');
    END IF;

    IF v_loc.community_id IS NOT NULL THEN
      SELECT *
      INTO v_community
      FROM public.communities
      WHERE id = v_loc.community_id;
    END IF;
  END IF;

  IF v_community.id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.created_at DESC NULLS LAST), '[]'::jsonb)
    INTO v_issues
    FROM (
      SELECT
        pi.id,
        pi.category,
        left(coalesce(pi.description, ''), 280) AS description,
        pi.status,
        pi.priority,
        pi.created_at,
        pi.emergency_mode,
        cl.name AS location_name
      FROM public.property_issues pi
      INNER JOIN public.cleaning_locations cl ON cl.id = pi.location_id
      WHERE cl.community_id = v_community.id
        AND COALESCE(cl.is_admin_active, true) = true
        AND pi.status IN (
          'new',
          'open',
          'pending_admin_approval',
          'in_progress',
          'waiting_for_parts',
          'delegated'
        )
        AND (pi.source IS DISTINCT FROM 'cleaning' OR pi.released_from_cleaning_at IS NOT NULL)
      ORDER BY pi.created_at DESC NULLS LAST
      LIMIT 40
    ) i;

    SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC), '[]'::jsonb)
    INTO v_tasks
    FROM (
      SELECT
        pt.id,
        pt.title,
        pt.status,
        pt.priority,
        pt.created_at,
        cl.name AS location_name,
        public.board_portal_task_comments_json(pt.id) AS comments
      FROM public.property_tasks pt
      LEFT JOIN public.cleaning_locations cl ON cl.id = pt.location_id
      WHERE pt.visibility = 'board_visible'
        AND pt.status <> 'done'
        AND (
          pt.community_id = v_community.id
          OR cl.community_id = v_community.id
        )
      ORDER BY pt.created_at DESC
      LIMIT 40
    ) t;

    SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.created_at DESC NULLS LAST), '[]'::jsonb)
    INTO v_announcements
    FROM (
      SELECT
        e.id,
        e.title,
        e.content,
        e.msg_type,
        e.valid_until,
        e.created_at
      FROM public.e_board_messages e
      WHERE e.community_id = v_community.id
        AND e.status = 'published'
        AND COALESCE(e.is_active, true) = true
        AND (e.valid_until IS NULL OR e.valid_until >= CURRENT_DATE)
      ORDER BY e.created_at DESC NULLS LAST
      LIMIT 20
    ) m;

    SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.sort_order ASC, c.label ASC), '[]'::jsonb)
    INTO v_contacts
    FROM (
      SELECT
        cb.label,
        cb.phone,
        cb.email,
        cb.sort_order
      FROM public.community_contact_board_entries cb
      WHERE cb.community_id = v_community.id
      ORDER BY cb.sort_order ASC, cb.label ASC
      LIMIT 40
    ) c;

    RETURN jsonb_build_object(
      'ok', true,
      'property', jsonb_build_object(
        'name', v_community.name,
        'address', NULL,
        'community_name', COALESCE(NULLIF(btrim(v_community.legal_name), ''), v_community.name)
      ),
      'issues', v_issues,
      'tasks', v_tasks,
      'announcements', v_announcements,
      'contacts', v_contacts
    );
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.created_at DESC NULLS LAST), '[]'::jsonb)
  INTO v_issues
  FROM (
    SELECT
      pi.id,
      pi.category,
      left(coalesce(pi.description, ''), 280) AS description,
      pi.status,
      pi.priority,
      pi.created_at,
      pi.emergency_mode,
      v_loc.name AS location_name
    FROM public.property_issues pi
    WHERE pi.location_id = v_loc.id
      AND pi.status IN (
        'new',
        'open',
        'pending_admin_approval',
        'in_progress',
        'waiting_for_parts',
        'delegated'
      )
      AND (pi.source IS DISTINCT FROM 'cleaning' OR pi.released_from_cleaning_at IS NOT NULL)
    ORDER BY pi.created_at DESC NULLS LAST
    LIMIT 40
  ) i;

  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC), '[]'::jsonb)
  INTO v_tasks
  FROM (
    SELECT
      pt.id,
      pt.title,
      pt.status,
      pt.priority,
      pt.created_at,
      v_loc.name AS location_name,
      public.board_portal_task_comments_json(pt.id) AS comments
    FROM public.property_tasks pt
    WHERE pt.visibility = 'board_visible'
      AND pt.status <> 'done'
      AND pt.location_id = v_loc.id
    ORDER BY pt.created_at DESC
    LIMIT 40
  ) t;

  RETURN jsonb_build_object(
    'ok', true,
    'property', jsonb_build_object(
      'name', v_loc.name,
      'address', v_loc.address,
      'community_name', NULL
    ),
    'issues', v_issues,
    'tasks', v_tasks,
    'announcements', '[]'::jsonb,
    'contacts', '[]'::jsonb
  );
END;
$$;

COMMENT ON FUNCTION public.get_board_portal_snapshot(uuid) IS
  'Anonymous snapshot for /portal/board/:token. Tasks are board_visible only and include comments.';

REVOKE ALL ON FUNCTION public.get_board_portal_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_board_portal_snapshot(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.add_board_portal_task_comment(
  p_token uuid,
  p_task_id uuid,
  p_content text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_community_id uuid;
  v_location_id uuid;
  v_task public.property_tasks%ROWTYPE;
  v_content text;
  v_row public.task_comments%ROWTYPE;
BEGIN
  IF p_token IS NULL OR p_task_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_request');
  END IF;

  v_content := left(btrim(coalesce(p_content, '')), 4000);
  IF v_content = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'empty_content');
  END IF;

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

  SELECT *
  INTO v_task
  FROM public.property_tasks
  WHERE id = p_task_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'task_not_found');
  END IF;

  IF v_task.visibility IS DISTINCT FROM 'board_visible' OR v_task.status = 'done' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'task_not_visible');
  END IF;

  IF v_community_id IS NOT NULL THEN
    IF NOT (
      v_task.community_id = v_community_id
      OR EXISTS (
        SELECT 1
        FROM public.cleaning_locations cl
        WHERE cl.id = v_task.location_id
          AND cl.community_id = v_community_id
      )
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'task_not_visible');
    END IF;
  ELSE
    IF v_task.location_id IS DISTINCT FROM v_location_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'task_not_visible');
    END IF;
  END IF;

  INSERT INTO public.task_comments (task_id, author_id, content, source)
  VALUES (v_task.id, NULL, v_content, 'board')
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'ok', true,
    'comment', jsonb_build_object(
      'id', v_row.id,
      'content', v_row.content,
      'created_at', v_row.created_at,
      'source', v_row.source,
      'author_name', 'Zarząd'
    )
  );
END;
$$;

COMMENT ON FUNCTION public.add_board_portal_task_comment(uuid, uuid, text) IS
  'Guest insert of a board comment on a board_visible, non-done task scoped by portal token.';

REVOKE ALL ON FUNCTION public.add_board_portal_task_comment(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_board_portal_task_comment(uuid, uuid, text) TO anon, authenticated;
