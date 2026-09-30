-- Edit occupant name/email. Changing email revokes Home access for the previous user.

BEGIN;

CREATE OR REPLACE FUNCTION public.update_unit_occupant(
  p_occupant_id uuid,
  p_full_name text,
  p_email text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_location_id uuid;
  v_normalized text;
  v_unit_number text;
  v_master uuid;
  v_old_user uuid;
  v_old_email text;
  v_name text := btrim(COALESCE(p_full_name, ''));
  v_email text := lower(btrim(COALESCE(p_email, '')));
  v_new_user uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Wymagane logowanie.' USING ERRCODE = '42501';
  END IF;

  IF v_name = '' OR length(v_name) > 200 THEN
    RAISE EXCEPTION 'Podaj imię i nazwisko (do 200 znaków).';
  END IF;

  IF v_email = '' OR v_email !~ '^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$' THEN
    RAISE EXCEPTION 'Podaj poprawny adres e-mail.';
  END IF;

  SELECT u.location_id, u.normalized_unit_number, u.unit_number, cl.location_master_id, o.user_id, o.email
    INTO v_location_id, v_normalized, v_unit_number, v_master, v_old_user, v_old_email
  FROM public.community_unit_occupants o
  JOIN public.community_units u ON u.id = o.unit_id
  JOIN public.cleaning_locations cl ON cl.id = u.location_id
  WHERE o.id = p_occupant_id;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono mieszkańca.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.can_manage_location(v_location_id) THEN
    RAISE EXCEPTION 'Brak uprawnień do tego budynku.' USING ERRCODE = '42501';
  END IF;

  IF v_email IS DISTINCT FROM v_old_email THEN
    IF v_old_user IS NOT NULL THEN
      DELETE FROM public.location_access la
      WHERE la.location_id = v_location_id
        AND la.user_id = v_old_user
        AND la.unit_number IS NOT NULL
        AND public.normalize_unit_number(la.unit_number) IS NOT DISTINCT FROM v_normalized;
    END IF;

    SELECT p.id
      INTO v_new_user
    FROM public.profiles p
    WHERE lower(btrim(COALESCE(p.email, ''))) = v_email
    ORDER BY p.created_at NULLS LAST
    LIMIT 1;

    UPDATE public.community_unit_occupants
    SET full_name = v_name,
        email = v_email,
        user_id = v_new_user
    WHERE id = p_occupant_id;

    IF v_new_user IS NOT NULL THEN
      INSERT INTO public.location_access (
        location_id,
        user_id,
        access_type,
        unit_number,
        location_master_id
      )
      SELECT
        v_location_id,
        v_new_user,
        'permanent',
        v_unit_number,
        v_master
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.location_access la
        WHERE la.location_id = v_location_id
          AND la.user_id = v_new_user
          AND public.normalize_unit_number(la.unit_number) IS NOT DISTINCT FROM v_normalized
      );
    END IF;
  ELSE
    UPDATE public.community_unit_occupants
    SET full_name = v_name
    WHERE id = p_occupant_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.update_unit_occupant(uuid, text, text) IS
  'Updates occupant name. Changing email revokes previous Home access and re-links if the new email already has a profile.';

REVOKE ALL ON FUNCTION public.update_unit_occupant(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_unit_occupant(uuid, text, text) TO authenticated;

COMMIT;
