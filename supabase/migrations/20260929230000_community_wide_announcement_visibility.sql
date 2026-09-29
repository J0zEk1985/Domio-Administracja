-- Resident announcements (community_board): visible across the whole community,
-- and across an estate when communities are linked.
-- Official e-board: visible to every resident of the community (all buildings).

CREATE OR REPLACE FUNCTION public.has_community_location_access(p_community_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p_community_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.cleaning_locations cl
      WHERE cl.community_id = p_community_id
        AND public.has_active_location_access(cl.id)
    );
$$;

REVOKE ALL ON FUNCTION public.has_community_location_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_community_location_access(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_read_community_board_row(p_location_id uuid, p_estate_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.has_active_location_access(p_location_id)
    OR (p_estate_id IS NOT NULL AND public.has_estate_social_access(p_estate_id))
    OR EXISTS (
      SELECT 1
      FROM public.cleaning_locations post_cl
      WHERE post_cl.id = p_location_id
        AND public.has_community_location_access(post_cl.community_id)
    );
$$;

DROP POLICY IF EXISTS e_board_select_resident_published ON public.e_board_messages;

CREATE POLICY e_board_select_resident_published
  ON public.e_board_messages
  FOR SELECT
  TO authenticated
  USING (
    status = 'published'
    AND (
      public.is_org_member(org_id)
      OR public.has_community_location_access(community_id)
      OR (location_id IS NOT NULL AND public.has_active_location_access(location_id))
      OR (
        location_id IS NULL
        AND community_id IS NULL
        AND EXISTS (
          SELECT 1
          FROM public.location_access la
          JOIN public.cleaning_locations cl ON cl.id = la.location_id
          WHERE la.user_id = auth.uid()
            AND cl.org_id = e_board_messages.org_id
            AND (la.expires_at IS NULL OR la.expires_at > now())
        )
      )
    )
  );
