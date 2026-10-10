-- Per-building SOS module. Home shows the button and "Gotowi pomóc" only when this is on.
-- Missing row means the module is off.

BEGIN;

ALTER TABLE public.resident_configs
  ADD COLUMN IF NOT EXISTS enable_sos boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.resident_configs.enable_sos IS
  'When true, residents of this building see the SOS button and the helper opt-in in DOMIO Home.';

CREATE OR REPLACE FUNCTION private.sos_location_module_enabled(p_location_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.resident_configs rc
    WHERE rc.location_id = p_location_id
      AND rc.enable_sos IS TRUE
  );
$$;

CREATE OR REPLACE FUNCTION private.sos_user_has_enabled_building(p_user_id uuid, p_estate_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.location_access la
    JOIN public.cleaning_locations cl ON cl.id = la.location_id
    JOIN public.estate_members em
      ON em.community_id = cl.community_id
     AND em.estate_id = p_estate_id
     AND em.status = 'accepted'
    JOIN public.resident_configs rc
      ON rc.location_id = cl.id
     AND rc.enable_sos IS TRUE
    WHERE la.user_id = p_user_id
      AND (la.expires_at IS NULL OR la.expires_at > now())
  );
$$;

REVOKE ALL ON FUNCTION private.sos_location_module_enabled(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.sos_user_has_enabled_building(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.join_sos_network(p_estate_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Brak sesji.'
      USING ERRCODE = '42501';
  END IF;

  IF p_estate_id IS NULL OR NOT private.sos_user_on_estate(v_actor, p_estate_id) THEN
    RAISE EXCEPTION 'Nie możesz dołączyć do sieci SOS tego osiedla.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT private.sos_user_has_enabled_building(v_actor, p_estate_id) THEN
    RAISE EXCEPTION 'Moduł SOS jest wyłączony na tym budynku.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM private.sos_set_rpc_flag();

  INSERT INTO public.sos_memberships (user_id, estate_id)
  VALUES (v_actor, p_estate_id)
  ON CONFLICT (user_id, estate_id) DO UPDATE
  SET opted_in_at = now();
END;
$$;

COMMENT ON FUNCTION public.join_sos_network(uuid) IS
  'Opts the signed-in resident into SOS when at least one of their buildings on the estate has the module on.';

CREATE OR REPLACE FUNCTION public.create_sos_alert(
  p_location_id uuid,
  p_category text,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_meters numeric DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_estate uuid;
  v_estate_lat double precision;
  v_estate_lng double precision;
  v_radius integer;
  v_address text;
  v_note text;
  v_name text;
  v_alert uuid;
  v_room uuid;
  v_recent bigint;
BEGIN
  PERFORM set_config('app.sos_system_message', '0', true);

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Brak sesji.'
      USING ERRCODE = '42501';
  END IF;

  IF p_category NOT IN ('burglary', 'medical', 'fire', 'other') THEN
    RAISE EXCEPTION 'Nieznana kategoria alarmu.'
      USING ERRCODE = '23514';
  END IF;

  IF p_latitude IS NULL
     OR p_longitude IS NULL
     OR p_latitude <> p_latitude
     OR p_longitude <> p_longitude
     OR p_latitude < -90
     OR p_latitude > 90
     OR p_longitude < -180
     OR p_longitude > 180
  THEN
    RAISE EXCEPTION 'Podaj prawidłową lokalizację GPS.'
      USING ERRCODE = '23514';
  END IF;

  IF p_accuracy_meters IS NOT NULL
     AND (p_accuracy_meters < 0 OR p_accuracy_meters > 10000)
  THEN
    RAISE EXCEPTION 'Nieprawidłowa dokładność GPS.'
      USING ERRCODE = '23514';
  END IF;

  v_note := NULLIF(btrim(COALESCE(p_note, '')), '');
  IF p_category IS DISTINCT FROM 'other' THEN
    v_note := NULL;
  ELSIF v_note IS NOT NULL AND char_length(v_note) > 280 THEN
    RAISE EXCEPTION 'Notatka może mieć najwyżej 280 znaków.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT public.has_active_location_access(p_location_id) THEN
    RAISE EXCEPTION 'Brak dostępu do tego budynku.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT private.sos_location_module_enabled(p_location_id) THEN
    RAISE EXCEPTION 'Moduł SOS jest wyłączony na tym budynku.'
      USING ERRCODE = '42501';
  END IF;

  SELECT
    em.estate_id,
    e.sos_latitude,
    e.sos_longitude,
    e.sos_radius_meters,
    COALESCE(NULLIF(btrim(cl.address), ''), NULLIF(btrim(cl.name), ''), 'Budynek')
  INTO v_estate, v_estate_lat, v_estate_lng, v_radius, v_address
  FROM public.cleaning_locations cl
  JOIN public.estate_members em
    ON em.community_id = cl.community_id
   AND em.status = 'accepted'
  JOIN public.estates e
    ON e.id = em.estate_id
   AND e.status = 'active'
  WHERE cl.id = p_location_id;

  IF v_estate IS NULL THEN
    RAISE EXCEPTION 'Ten budynek nie należy do osiedla z siecią SOS.'
      USING ERRCODE = '42501';
  END IF;

  IF v_estate_lat IS NULL OR v_estate_lng IS NULL THEN
    RAISE EXCEPTION 'Osiedle nie ma ustawionej strefy SOS.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.sos_memberships m
    WHERE m.user_id = v_actor
      AND m.estate_id = v_estate
  ) THEN
    RAISE EXCEPTION 'Dołącz do sieci Gotowych pomóc, aby wezwać SOS.'
      USING ERRCODE = '42501';
  END IF;

  IF private.sos_distance_meters(p_latitude, p_longitude, v_estate_lat, v_estate_lng) > v_radius THEN
    RAISE EXCEPTION 'Jesteś poza strefą osiedla. Alarm SOS jest niedostępny.'
      USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('sos-alert:' || v_actor::text));

  IF EXISTS (
    SELECT 1
    FROM public.sos_alerts a
    WHERE a.caller_user_id = v_actor
      AND a.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Masz już aktywny alarm SOS.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.sos_alerts a
    WHERE a.caller_user_id = v_actor
      AND a.status IN ('cancelled', 'resolved')
      AND a.closed_at > now() - interval '10 minutes'
  ) THEN
    RAISE EXCEPTION 'Odczekaj 10 minut od poprzedniego alarmu.'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)
  INTO v_recent
  FROM public.sos_alerts a
  WHERE a.caller_user_id = v_actor
    AND a.estate_id = v_estate
    AND a.created_at > now() - interval '24 hours';

  IF v_recent >= 3 THEN
    RAISE EXCEPTION 'Osiągnięto limit 3 alarmów na dobę na tym osiedlu.'
      USING ERRCODE = '23514';
  END IF;

  v_name := COALESCE(private.sos_display_name(v_actor), 'Sąsiad');
  PERFORM private.sos_set_rpc_flag();

  BEGIN
    INSERT INTO public.sos_alerts (
      estate_id,
      caller_user_id,
      caller_display_name,
      category,
      status,
      latitude,
      longitude,
      accuracy_meters,
      location_id,
      building_address,
      note,
      created_at,
      expires_at
    ) VALUES (
      v_estate,
      v_actor,
      v_name,
      p_category,
      'active',
      p_latitude,
      p_longitude,
      p_accuracy_meters,
      p_location_id,
      v_address,
      v_note,
      now(),
      now() + interval '2 hours'
    )
    RETURNING id INTO v_alert;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'Masz już aktywny alarm SOS.'
        USING ERRCODE = '23514';
  END;

  INSERT INTO public.sos_alert_participants (alert_id, user_id, role, display_name)
  VALUES (v_alert, v_actor, 'caller', v_name);

  INSERT INTO public.sos_alert_participants (alert_id, user_id, role, display_name)
  SELECT
    v_alert,
    m.user_id,
    'neighbor',
    COALESCE(private.sos_display_name(m.user_id), 'Sąsiad')
  FROM public.sos_memberships m
  WHERE m.estate_id = v_estate
    AND m.user_id <> v_actor
    AND private.sos_user_on_estate(m.user_id, v_estate)
    AND private.sos_user_has_enabled_building(m.user_id, v_estate);

  INSERT INTO public.sos_rooms (alert_id, estate_id)
  VALUES (v_alert, v_estate)
  RETURNING id INTO v_room;

  PERFORM set_config('app.sos_system_message', '1', true);

  INSERT INTO public.sos_messages (room_id, author_user_id, kind, body)
  VALUES (v_room, NULL, 'system', 'Alarm SOS został wyzwolony.');

  RETURN v_alert;
END;
$$;

COMMENT ON FUNCTION public.create_sos_alert(uuid, text, double precision, double precision, numeric, text) IS
  'Opens an SOS alert when the building module is on, after opt-in, access, geofence, and rate limits.';

NOTIFY pgrst, 'reload schema';

COMMIT;
