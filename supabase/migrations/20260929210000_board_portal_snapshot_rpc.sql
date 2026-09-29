-- Guest board portal: resolve cleaning_locations.board_portal_token without auth.
-- Read-only snapshot (no PII of reporters). Tasks: board_visible only.

CREATE OR REPLACE FUNCTION public.get_board_portal_snapshot(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_loc public.cleaning_locations%ROWTYPE;
  v_community_name text;
  v_issues jsonb;
  v_tasks jsonb;
  v_announcements jsonb;
  v_contacts jsonb;
BEGIN
  IF p_token IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

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
    SELECT c.name
    INTO v_community_name
    FROM public.communities c
    WHERE c.id = v_loc.community_id;
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
      pi.emergency_mode
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
      pt.created_at
    FROM public.property_tasks pt
    WHERE pt.visibility = 'board_visible'
      AND pt.status <> 'done'
      AND (
        pt.location_id = v_loc.id
        OR (v_loc.community_id IS NOT NULL AND pt.community_id = v_loc.community_id)
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
    WHERE v_loc.community_id IS NOT NULL
      AND e.community_id = v_loc.community_id
      AND e.status = 'published'
      AND COALESCE(e.is_active, true) = true
      AND (e.valid_until IS NULL OR e.valid_until >= CURRENT_DATE)
      AND (e.location_id IS NULL OR e.location_id = v_loc.id)
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
    WHERE v_loc.community_id IS NOT NULL
      AND cb.community_id = v_loc.community_id
    ORDER BY cb.sort_order ASC, cb.label ASC
    LIMIT 40
  ) c;

  RETURN jsonb_build_object(
    'ok', true,
    'property', jsonb_build_object(
      'name', v_loc.name,
      'address', v_loc.address,
      'community_name', v_community_name
    ),
    'issues', v_issues,
    'tasks', v_tasks,
    'announcements', v_announcements,
    'contacts', v_contacts
  );
END;
$$;

COMMENT ON FUNCTION public.get_board_portal_snapshot(uuid) IS
  'Anonymous snapshot for /portal/board/:token. Opaque UUID; rotate via board_portal_token.';

REVOKE ALL ON FUNCTION public.get_board_portal_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_board_portal_snapshot(uuid) TO anon, authenticated;
