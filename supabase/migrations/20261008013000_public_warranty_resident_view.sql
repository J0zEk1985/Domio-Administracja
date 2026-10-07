BEGIN;

-- Public read-only register for residents. The token is the only secret.
-- Drafts stay hidden. Turning visibility off makes the same token return nothing.

ALTER TABLE public.community_warranty_settings
  ADD COLUMN IF NOT EXISTS public_view_token uuid;

UPDATE public.community_warranty_settings
SET public_view_token = gen_random_uuid()
WHERE public_view_token IS NULL;

ALTER TABLE public.community_warranty_settings
  ALTER COLUMN public_view_token SET DEFAULT gen_random_uuid();

ALTER TABLE public.community_warranty_settings
  ALTER COLUMN public_view_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS community_warranty_settings_public_view_token_uidx
  ON public.community_warranty_settings (public_view_token);

COMMENT ON COLUMN public.community_warranty_settings.public_view_token IS
  'Unguessable token for the resident read-only warranty page. Valid only while resident_visibility_enabled is true.';

-- Buildings often have no resident_configs row. The admin toggle must create one.
CREATE OR REPLACE FUNCTION public.sync_warranty_visibility_to_resident_configs(
  p_community_id uuid,
  p_enabled boolean
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_updated_count integer;
BEGIN
  WITH upserted AS (
    INSERT INTO public.resident_configs (org_id, location_id, enable_developer_warranty_view)
    SELECT cl.org_id, cl.id, p_enabled
    FROM public.cleaning_locations cl
    WHERE cl.community_id = p_community_id
      AND cl.org_id IS NOT NULL
    ON CONFLICT (location_id) DO UPDATE
      SET enable_developer_warranty_view = EXCLUDED.enable_developer_warranty_view,
          updated_at = now()
    RETURNING id
  )
  SELECT count(*) INTO v_updated_count FROM upserted;

  RETURN v_updated_count;
END;
$$;

CREATE OR REPLACE FUNCTION private.trg_location_warranty_visibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_enabled boolean;
BEGIN
  IF NEW.community_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.community_id IS NOT DISTINCT FROM OLD.community_id THEN
    RETURN NEW;
  END IF;

  SELECT resident_visibility_enabled
  INTO v_enabled
  FROM public.community_warranty_settings
  WHERE community_id = NEW.community_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  PERFORM public.sync_warranty_visibility_to_resident_configs(NEW.community_id, v_enabled);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_location_warranty_visibility ON public.cleaning_locations;

CREATE TRIGGER trg_location_warranty_visibility
  AFTER INSERT OR UPDATE OF community_id
  ON public.cleaning_locations
  FOR EACH ROW
  EXECUTE FUNCTION private.trg_location_warranty_visibility();

-- Authenticated resident list. Live columns are location_detail / photos_reported / user_id.
CREATE OR REPLACE FUNCTION public.get_resident_warranty_issues()
RETURNS TABLE (
  id uuid,
  community_id uuid,
  community_name text,
  title text,
  description text,
  category text,
  status developer_warranty_issue_status,
  location_description text,
  photos text[],
  photos_completion text[],
  rejection_reason text,
  reported_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  comments_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_resident_community_id uuid;
  v_warranty_enabled boolean;
BEGIN
  SELECT cl.community_id
  INTO v_resident_community_id
  FROM public.location_access la
  JOIN public.cleaning_locations cl ON cl.id = la.location_id
  LEFT JOIN public.community_warranty_settings s ON s.community_id = cl.community_id
  WHERE la.user_id = auth.uid()
    AND cl.community_id IS NOT NULL
  ORDER BY COALESCE(s.resident_visibility_enabled, false) DESC, la.created_at DESC
  LIMIT 1;

  IF v_resident_community_id IS NULL THEN
    RETURN;
  END IF;

  SELECT s.resident_visibility_enabled
  INTO v_warranty_enabled
  FROM public.community_warranty_settings s
  WHERE s.community_id = v_resident_community_id;

  IF NOT COALESCE(v_warranty_enabled, false) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    dwi.id,
    dwi.community_id,
    c.name AS community_name,
    dwi.title,
    dwi.description,
    dwi.category,
    dwi.status,
    dwi.location_detail AS location_description,
    dwi.photos_reported AS photos,
    dwi.photos_completion,
    dwi.rejection_reason,
    dwi.reported_at,
    dwi.created_at,
    dwi.updated_at,
    (
      SELECT count(*)::bigint
      FROM public.developer_warranty_issue_comments dwic
      WHERE dwic.issue_id = dwi.id
    ) AS comments_count
  FROM public.developer_warranty_issues dwi
  JOIN public.communities c ON c.id = dwi.community_id
  WHERE dwi.community_id = v_resident_community_id
    AND dwi.status <> 'draft'
  ORDER BY dwi.reported_at DESC NULLS LAST, dwi.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_resident_warranty_issue_details(p_issue_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_resident_community_id uuid;
  v_warranty_enabled boolean;
  v_issue_community_id uuid;
  v_status developer_warranty_issue_status;
  v_result json;
BEGIN
  SELECT cl.community_id
  INTO v_resident_community_id
  FROM public.location_access la
  JOIN public.cleaning_locations cl ON cl.id = la.location_id
  WHERE la.user_id = auth.uid()
    AND cl.community_id IS NOT NULL
  ORDER BY la.created_at DESC
  LIMIT 1;

  IF v_resident_community_id IS NULL THEN
    RAISE EXCEPTION 'Brak przypisanej wspólnoty dla tego mieszkańca';
  END IF;

  SELECT s.resident_visibility_enabled
  INTO v_warranty_enabled
  FROM public.community_warranty_settings s
  WHERE s.community_id = v_resident_community_id;

  IF NOT COALESCE(v_warranty_enabled, false) THEN
    RAISE EXCEPTION 'Widok usterek deweloperskich jest wyłączony dla Twojego lokalu';
  END IF;

  SELECT community_id, status
  INTO v_issue_community_id, v_status
  FROM public.developer_warranty_issues
  WHERE id = p_issue_id;

  IF v_issue_community_id IS NULL OR v_status = 'draft' OR v_issue_community_id <> v_resident_community_id THEN
    RAISE EXCEPTION 'Usterka nie istnieje';
  END IF;

  SELECT json_build_object(
    'issue', (
      SELECT row_to_json(t)
      FROM (
        SELECT
          dwi.id,
          dwi.community_id,
          c.name AS community_name,
          dwi.title,
          dwi.description,
          dwi.category,
          dwi.status,
          dwi.location_detail AS location_description,
          dwi.photos_reported AS photos,
          dwi.photos_completion,
          dwi.rejection_reason,
          dwi.reported_at,
          dwi.created_at,
          dwi.updated_at
        FROM public.developer_warranty_issues dwi
        JOIN public.communities c ON c.id = dwi.community_id
        WHERE dwi.id = p_issue_id
      ) t
    ),
    'comments', (
      SELECT COALESCE(json_agg(row_to_json(cmt) ORDER BY cmt.created_at ASC), '[]'::json)
      FROM (
        SELECT
          dwic.id,
          dwic.issue_id,
          dwic.author_type,
          dwic.comment_text AS content,
          dwic.created_at
        FROM public.developer_warranty_issue_comments dwic
        WHERE dwic.issue_id = p_issue_id
      ) cmt
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

-- Link shown inside Domio Home for the resident's current building.
CREATE OR REPLACE FUNCTION public.get_resident_warranty_link(p_location_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_community_id uuid;
  v_token uuid;
  v_enabled boolean;
  v_name text;
  v_count bigint;
  v_latest text;
BEGIN
  IF auth.uid() IS NULL OR p_location_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'enabled', false);
  END IF;

  SELECT cl.community_id
  INTO v_community_id
  FROM public.location_access la
  JOIN public.cleaning_locations cl ON cl.id = la.location_id
  WHERE la.user_id = auth.uid()
    AND la.location_id = p_location_id
    AND cl.community_id IS NOT NULL
  LIMIT 1;

  IF v_community_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'enabled', false);
  END IF;

  SELECT s.public_view_token, s.resident_visibility_enabled, c.name
  INTO v_token, v_enabled, v_name
  FROM public.community_warranty_settings s
  JOIN public.communities c ON c.id = s.community_id
  WHERE s.community_id = v_community_id;

  IF NOT COALESCE(v_enabled, false) OR v_token IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'enabled', false);
  END IF;

  SELECT count(*)::bigint,
         (array_agg(dwi.title ORDER BY dwi.reported_at DESC NULLS LAST, dwi.created_at DESC))[1]
  INTO v_count, v_latest
  FROM public.developer_warranty_issues dwi
  WHERE dwi.community_id = v_community_id
    AND dwi.status <> 'draft';

  RETURN jsonb_build_object(
    'ok', true,
    'enabled', true,
    'token', v_token,
    'community_name', v_name,
    'issue_count', v_count,
    'latest_title', v_latest
  );
END;
$$;

-- Anonymous read-only board. Same payload whether the token is unknown or visibility is off.
CREATE OR REPLACE FUNCTION public.get_public_warranty_board(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_community_id uuid;
  v_enabled boolean;
  v_name text;
  v_issues jsonb;
BEGIN
  IF p_token IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_available');
  END IF;

  SELECT s.community_id, s.resident_visibility_enabled, c.name
  INTO v_community_id, v_enabled, v_name
  FROM public.community_warranty_settings s
  JOIN public.communities c ON c.id = s.community_id
  WHERE s.public_view_token = p_token;

  IF v_community_id IS NULL OR NOT COALESCE(v_enabled, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_available');
  END IF;

  SELECT coalesce(jsonb_agg(issue_row ORDER BY sort_reported DESC NULLS LAST, sort_created DESC), '[]'::jsonb)
  INTO v_issues
  FROM (
    SELECT
      dwi.reported_at AS sort_reported,
      dwi.created_at AS sort_created,
      jsonb_build_object(
        'id', dwi.id,
        'title', dwi.title,
        'description', coalesce(dwi.description, ''),
        'category', coalesce(dwi.category, ''),
        'status', dwi.status,
        'location_description', coalesce(dwi.location_detail, ''),
        'photos', coalesce(to_jsonb(dwi.photos_reported), '[]'::jsonb),
        'photos_completion', coalesce(to_jsonb(dwi.photos_completion), '[]'::jsonb),
        'rejection_reason', dwi.rejection_reason,
        'reported_at', dwi.reported_at,
        'created_at', dwi.created_at,
        'updated_at', dwi.updated_at,
        'comments', (
          SELECT coalesce(jsonb_agg(
            jsonb_build_object(
              'id', dwic.id,
              'author_type', dwic.author_type,
              'author_name', dwic.author_name,
              'content', dwic.comment_text,
              'created_at', dwic.created_at
            )
            ORDER BY dwic.created_at ASC
          ), '[]'::jsonb)
          FROM public.developer_warranty_issue_comments dwic
          WHERE dwic.issue_id = dwi.id
        )
      ) AS issue_row
    FROM public.developer_warranty_issues dwi
    WHERE dwi.community_id = v_community_id
      AND dwi.status <> 'draft'
    ORDER BY dwi.reported_at DESC NULLS LAST, dwi.created_at DESC
    LIMIT 200
  ) listed;

  RETURN jsonb_build_object(
    'ok', true,
    'community_name', v_name,
    'issues', v_issues
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_resident_warranty_link(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_warranty_board(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_resident_warranty_issues() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_resident_warranty_issue_details(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_resident_warranty_link(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_warranty_board(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_warranty_board(uuid) IS
  'Read-only developer warranty register for a public token. No login, no drafts, no writes.';

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT community_id, resident_visibility_enabled
    FROM public.community_warranty_settings
  LOOP
    PERFORM public.sync_warranty_visibility_to_resident_configs(
      r.community_id,
      r.resident_visibility_enabled
    );
  END LOOP;
END $$;

COMMIT;
