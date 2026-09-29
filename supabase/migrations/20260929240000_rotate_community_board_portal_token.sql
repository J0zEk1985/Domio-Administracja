-- Rotate Portal Zarządu token for a whole community (admin team only).

CREATE OR REPLACE FUNCTION public.rotate_community_board_portal_token(p_community_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
  v_token uuid;
BEGIN
  IF p_community_id IS NULL THEN
    RAISE EXCEPTION 'invalid_community' USING ERRCODE = '22023';
  END IF;

  SELECT c.org_id INTO v_org
  FROM public.communities c
  WHERE c.id = p_community_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_org_admin_team(v_org) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  v_token := gen_random_uuid();

  UPDATE public.communities
  SET board_portal_token = v_token
  WHERE id = p_community_id;

  RETURN v_token;
END;
$$;

COMMENT ON FUNCTION public.rotate_community_board_portal_token(uuid) IS
  'Admin-team rotation of communities.board_portal_token for Portal Zarządu.';

REVOKE ALL ON FUNCTION public.rotate_community_board_portal_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rotate_community_board_portal_token(uuid) TO authenticated;
