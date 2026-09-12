-- RLS + RPC zgody osiedla (cross-org). Zapis tylko przez RPC.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;
GRANT USAGE ON SCHEMA private TO postgres, service_role;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.has_estate_social_access(p_estate_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.estate_members em
    JOIN public.estates e ON e.id = em.estate_id
    JOIN public.cleaning_locations cl ON cl.community_id = em.community_id
    JOIN public.location_access la ON la.location_id = cl.id
    WHERE em.estate_id = p_estate_id
      AND em.status = 'accepted'
      AND e.status = 'active'
      AND la.user_id = (SELECT auth.uid())
      AND (la.expires_at IS NULL OR la.expires_at > now())
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_see_estate(p_estate_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p_estate_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.estates e
        WHERE e.id = p_estate_id
          AND public.is_org_member(e.created_by_org_id)
      )
      OR EXISTS (
        SELECT 1
        FROM public.estate_members em
        WHERE em.estate_id = p_estate_id
          AND public.is_org_member(em.org_id)
      )
      OR public.has_estate_social_access(p_estate_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.can_read_community_board_row(p_location_id uuid, p_estate_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.has_active_location_access(p_location_id)
    OR (p_estate_id IS NOT NULL AND public.has_estate_social_access(p_estate_id));
$$;

REVOKE ALL ON FUNCTION public.has_estate_social_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_see_estate(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_community_board_row(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_estate_social_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_see_estate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_community_board_row(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.estate_require_actor()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Brak sesji.';
  END IF;
  RETURN v_actor;
END;
$$;

CREATE OR REPLACE FUNCTION private.estate_require_community_management(p_community_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
BEGIN
  PERFORM private.estate_require_actor();

  SELECT c.org_id INTO v_org
  FROM public.communities c
  WHERE c.id = p_community_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono wspólnoty.';
  END IF;

  IF NOT public.is_org_management(v_org) THEN
    RAISE EXCEPTION 'Brak uprawnień do zarządzania tą wspólnotą.';
  END IF;

  RETURN v_org;
END;
$$;

-- ---------------------------------------------------------------------------
-- Table grants + RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.estates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estate_members ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.estates FROM anon, authenticated;
REVOKE ALL ON TABLE public.estate_members FROM anon, authenticated;
GRANT SELECT ON TABLE public.estates TO authenticated;
GRANT SELECT ON TABLE public.estate_members TO authenticated;
GRANT ALL ON TABLE public.estates TO service_role;
GRANT ALL ON TABLE public.estate_members TO service_role;

DROP POLICY IF EXISTS estates_select_visible ON public.estates;
CREATE POLICY estates_select_visible
  ON public.estates
  FOR SELECT
  TO authenticated
  USING (public.user_can_see_estate(id));

DROP POLICY IF EXISTS estate_members_select_visible ON public.estate_members;
CREATE POLICY estate_members_select_visible
  ON public.estate_members
  FOR SELECT
  TO authenticated
  USING (public.user_can_see_estate(estate_id));

DROP POLICY IF EXISTS community_board_select_resident ON public.community_board;
CREATE POLICY community_board_select_resident
  ON public.community_board
  FOR SELECT
  TO authenticated
  USING (public.can_read_community_board_row(location_id, estate_id));

DROP POLICY IF EXISTS "Residents read comments for location posts" ON public.community_comments;
DROP POLICY IF EXISTS community_comments_select_resident ON public.community_comments;
CREATE POLICY community_comments_select_resident
  ON public.community_comments
  FOR SELECT
  TO authenticated
  USING (
    is_deleted = false
    AND EXISTS (
      SELECT 1
      FROM public.community_board p
      WHERE p.id = community_comments.post_id
        AND public.can_read_community_board_row(p.location_id, p.estate_id)
    )
  );

DROP POLICY IF EXISTS "Residents insert comments" ON public.community_comments;
DROP POLICY IF EXISTS community_comments_insert_resident ON public.community_comments;
CREATE POLICY community_comments_insert_resident
  ON public.community_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.community_board p
      WHERE p.id = community_comments.post_id
        AND public.can_read_community_board_row(p.location_id, p.estate_id)
    )
  );

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_estate(p_name text, p_community_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid := private.estate_require_community_management(p_community_id);
  v_actor uuid := (SELECT auth.uid());
  v_estate uuid;
  v_name text := btrim(COALESCE(p_name, ''));
BEGIN

  IF length(v_name) < 2 THEN
    RAISE EXCEPTION 'Podaj nazwę osiedla (min. 2 znaki).';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.estate_members em
    WHERE em.community_id = p_community_id
      AND em.status IN ('invited', 'accepted')
  ) THEN
    RAISE EXCEPTION 'Ta wspólnota ma już zaproszenie lub należy do osiedla.';
  END IF;

  INSERT INTO public.estates (name, created_by_org_id, created_by_user_id, status)
  VALUES (v_name, v_org, v_actor, 'active')
  RETURNING id INTO v_estate;

  INSERT INTO public.estate_members (
    estate_id, community_id, org_id, status, invited_by_org_id, consented_at, consented_by
  )
  VALUES (
    v_estate, p_community_id, v_org, 'accepted', v_org, now(), v_actor
  );

  RETURN v_estate;
END;
$$;

CREATE OR REPLACE FUNCTION public.invite_estate_community(p_estate_id uuid, p_community_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_org uuid;
  v_estate public.estates%ROWTYPE;
  v_target_org uuid;
  v_member uuid;
BEGIN
  PERFORM private.estate_require_actor();

  SELECT * INTO v_estate
  FROM public.estates
  WHERE id = p_estate_id;

  IF v_estate.id IS NULL OR v_estate.status <> 'active' THEN
    RAISE EXCEPTION 'Nie znaleziono aktywnego osiedla.';
  END IF;

  SELECT c.org_id INTO v_target_org
  FROM public.communities c
  WHERE c.id = p_community_id;

  IF v_target_org IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono wspólnoty.';
  END IF;

  SELECT em.org_id INTO v_caller_org
  FROM public.estate_members em
  WHERE em.estate_id = p_estate_id
    AND em.status = 'accepted'
    AND public.is_org_management(em.org_id)
  LIMIT 1;

  IF v_caller_org IS NULL AND public.is_org_management(v_estate.created_by_org_id) THEN
    v_caller_org := v_estate.created_by_org_id;
  END IF;

  IF v_caller_org IS NULL THEN
    RAISE EXCEPTION 'Brak uprawnień do zapraszania wspólnot do tego osiedla.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.estate_members em
    WHERE em.community_id = p_community_id
      AND em.status IN ('invited', 'accepted')
      AND em.estate_id <> p_estate_id
  ) THEN
    RAISE EXCEPTION 'Ta wspólnota należy już do innego osiedla lub ma oczekujące zaproszenie.';
  END IF;

  INSERT INTO public.estate_members (
    estate_id, community_id, org_id, status, invited_by_org_id
  )
  VALUES (p_estate_id, p_community_id, v_target_org, 'invited', v_caller_org)
  ON CONFLICT (estate_id, community_id) DO UPDATE
    SET status = 'invited',
        invited_by_org_id = EXCLUDED.invited_by_org_id,
        consented_at = NULL,
        consented_by = NULL,
        updated_at = now()
    WHERE public.estate_members.status IN ('rejected', 'withdrawn')
  RETURNING id INTO v_member;

  IF v_member IS NULL THEN
    SELECT em.id INTO v_member
    FROM public.estate_members em
    WHERE em.estate_id = p_estate_id
      AND em.community_id = p_community_id;

    IF v_member IS NULL THEN
      RAISE EXCEPTION 'Nie udało się zapisać zaproszenia.';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.estate_members em
      WHERE em.id = v_member AND em.status IN ('invited', 'accepted')
    ) THEN
      RAISE EXCEPTION 'Ta wspólnota jest już zaproszona lub należy do osiedla.';
    END IF;
  END IF;

  RETURN v_member;
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_estate_invite(p_member_id uuid, p_accept boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := private.estate_require_actor();
  v_row public.estate_members%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM public.estate_members
  WHERE id = p_member_id;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono zaproszenia.';
  END IF;

  PERFORM private.estate_require_community_management(v_row.community_id);

  IF v_row.status <> 'invited' THEN
    RAISE EXCEPTION 'To zaproszenie nie oczekuje na decyzję.';
  END IF;

  IF p_accept THEN
    UPDATE public.estate_members
    SET status = 'accepted',
        consented_at = now(),
        consented_by = v_actor
    WHERE id = p_member_id;
  ELSE
    UPDATE public.estate_members
    SET status = 'rejected',
        consented_at = now(),
        consented_by = v_actor
    WHERE id = p_member_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_estate_membership(p_member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.estate_members%ROWTYPE;
  v_estate public.estates%ROWTYPE;
BEGIN
  PERFORM private.estate_require_actor();

  SELECT * INTO v_row
  FROM public.estate_members
  WHERE id = p_member_id;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono członkostwa osiedla.';
  END IF;

  SELECT * INTO v_estate FROM public.estates WHERE id = v_row.estate_id;

  IF v_row.status = 'invited' THEN
    IF NOT (
      public.is_org_management(v_row.org_id)
      OR public.is_org_management(v_row.invited_by_org_id)
      OR (v_estate.id IS NOT NULL AND public.is_org_management(v_estate.created_by_org_id))
    ) THEN
      RAISE EXCEPTION 'Brak uprawnień do anulowania zaproszenia.';
    END IF;
  ELSIF v_row.status = 'accepted' THEN
    PERFORM private.estate_require_community_management(v_row.community_id);
  ELSE
    RAISE EXCEPTION 'Tego członkostwa nie można wypisać.';
  END IF;

  UPDATE public.estate_members
  SET status = 'withdrawn',
      consented_at = CASE WHEN v_row.status = 'accepted' THEN now() ELSE consented_at END,
      consented_by = CASE WHEN v_row.status = 'accepted' THEN (SELECT auth.uid()) ELSE consented_by END
  WHERE id = p_member_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.search_communities_for_estate_invite(
  p_query text,
  p_estate_id uuid DEFAULT NULL
)
RETURNS TABLE (
  community_id uuid,
  display_name text,
  nip text,
  is_own boolean,
  link_status public.estate_member_status
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
  v_q text := btrim(COALESCE(p_query, ''));
  v_nip text;
BEGIN
  PERFORM private.estate_require_actor();

  SELECT public.get_my_org_id_safe() INTO v_org;
  IF v_org IS NULL OR NOT public.is_org_management(v_org) THEN
    RAISE EXCEPTION 'Brak uprawnień do wyszukiwania wspólnot.';
  END IF;

  IF length(v_q) < 3 THEN
    RAISE EXCEPTION 'Wpisz co najmniej 3 znaki (NIP lub nazwa).';
  END IF;

  v_nip := regexp_replace(v_q, '[^0-9]', '', 'g');

  RETURN QUERY
  SELECT
    c.id,
    COALESCE(NULLIF(btrim(c.legal_name), ''), NULLIF(btrim(c.name), ''), 'Wspólnota') AS display_name,
    c.nip,
    (c.org_id = v_org) AS is_own,
    (
      SELECT em.status
      FROM public.estate_members em
      WHERE em.community_id = c.id
        AND (p_estate_id IS NULL OR em.estate_id = p_estate_id)
        AND em.status IN ('invited', 'accepted')
      ORDER BY CASE WHEN p_estate_id IS NOT NULL AND em.estate_id = p_estate_id THEN 0 ELSE 1 END
      LIMIT 1
    ) AS link_status
  FROM public.communities c
  WHERE (c.status IS NULL OR c.status = 'active')
    AND (
      (length(v_nip) >= 6 AND regexp_replace(COALESCE(c.nip, ''), '[^0-9]', '', 'g') = v_nip)
      OR (
        length(v_nip) < 6
        AND (
          c.name ILIKE '%' || v_q || '%'
          OR c.legal_name ILIKE '%' || v_q || '%'
        )
      )
    )
  ORDER BY (c.org_id = v_org) DESC, display_name
  LIMIT 10;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_community_estate(p_community_id uuid)
RETURNS TABLE (
  estate_id uuid,
  estate_name text,
  estate_status text,
  created_by_org_id uuid,
  member_id uuid,
  member_status public.estate_member_status,
  invited_by_org_id uuid,
  consented_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
BEGIN
  PERFORM private.estate_require_actor();

  SELECT c.org_id INTO v_org
  FROM public.communities c
  WHERE c.id = p_community_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono wspólnoty.';
  END IF;

  IF NOT public.is_org_member(v_org) THEN
    RAISE EXCEPTION 'Brak dostępu do tej wspólnoty.';
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.name,
    e.status,
    e.created_by_org_id,
    em.id,
    em.status,
    em.invited_by_org_id,
    em.consented_at
  FROM public.estate_members em
  JOIN public.estates e ON e.id = em.estate_id
  WHERE em.community_id = p_community_id
    AND em.status IN ('invited', 'accepted')
  ORDER BY CASE WHEN em.status = 'accepted' THEN 0 ELSE 1 END, em.created_at DESC
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_estate_members(p_estate_id uuid)
RETURNS TABLE (
  member_id uuid,
  community_id uuid,
  org_id uuid,
  status public.estate_member_status,
  community_name text,
  nip text,
  invited_by_org_id uuid,
  consented_at timestamptz,
  is_own boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
BEGIN
  PERFORM private.estate_require_actor();

  IF NOT public.user_can_see_estate(p_estate_id) THEN
    RAISE EXCEPTION 'Brak dostępu do tego osiedla.';
  END IF;

  SELECT public.get_my_org_id_safe() INTO v_org;

  RETURN QUERY
  SELECT
    em.id,
    em.community_id,
    em.org_id,
    em.status,
    COALESCE(NULLIF(btrim(c.legal_name), ''), NULLIF(btrim(c.name), ''), 'Wspólnota'),
    c.nip,
    em.invited_by_org_id,
    em.consented_at,
    (em.org_id = v_org)
  FROM public.estate_members em
  JOIN public.communities c ON c.id = em.community_id
  WHERE em.estate_id = p_estate_id
  ORDER BY
    CASE em.status
      WHEN 'accepted' THEN 0
      WHEN 'invited' THEN 1
      ELSE 2
    END,
    5;
END;
$$;

REVOKE ALL ON FUNCTION public.create_estate(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invite_estate_community(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.respond_estate_invite(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.withdraw_estate_membership(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_communities_for_estate_invite(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_community_estate(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_estate_members(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.create_estate(text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.invite_estate_community(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.respond_estate_invite(uuid, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.withdraw_estate_membership(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.search_communities_for_estate_invite(text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_community_estate(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.list_estate_members(uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.create_estate(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_estate_community(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_estate_invite(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_estate_membership(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_communities_for_estate_invite(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_community_estate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_estate_members(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.estate_attach_community_board()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'accepted' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'accepted') THEN
    UPDATE public.community_board cb
    SET estate_id = NEW.estate_id,
        origin_label = COALESCE(
          cb.origin_label,
          (
            SELECT COALESCE(
              NULLIF(btrim(cl.address), ''),
              NULLIF(btrim(cl.name), ''),
              'Budynek'
            )
            FROM public.cleaning_locations cl
            WHERE cl.id = cb.location_id
          )
        )
    FROM public.cleaning_locations cl
    WHERE cl.community_id = NEW.community_id
      AND cb.location_id = cl.id
      AND cb.estate_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_estate_attach_community_board ON public.estate_members;
CREATE TRIGGER trg_estate_attach_community_board
  AFTER INSERT OR UPDATE OF status
  ON public.estate_members
  FOR EACH ROW
  EXECUTE FUNCTION private.estate_attach_community_board();

UPDATE public.community_board cb
SET origin_label = COALESCE(
  NULLIF(btrim(cl.address), ''),
  NULLIF(btrim(cl.name), ''),
  'Budynek'
)
FROM public.cleaning_locations cl
WHERE cb.location_id = cl.id
  AND cb.origin_label IS NULL;

COMMENT ON FUNCTION public.create_estate(text, uuid) IS
  'Creates a social estate and accepts the caller community as the first member.';
COMMENT ON FUNCTION public.search_communities_for_estate_invite(text, uuid) IS
  'Looks up communities by NIP or name for estate invites. Does not list the full catalog.';
