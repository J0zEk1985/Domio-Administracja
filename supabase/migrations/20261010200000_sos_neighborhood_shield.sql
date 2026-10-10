-- Sąsiedzka Tarcza SOS.
-- Estate-scoped opt-in, alerts, a one-to-one coordination room, and a push outbox.
-- Authenticated clients read through RLS and mutate only through the RPCs below.
-- Push delivery itself is a later worker over sos_push_jobs (no service key in the trigger).

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;
GRANT USAGE ON SCHEMA private TO postgres, service_role;

-- ---------------------------------------------------------------------------
-- Estate geofence. The network stays off until both coordinates are set.
-- ---------------------------------------------------------------------------

ALTER TABLE public.estates
  ADD COLUMN IF NOT EXISTS sos_latitude double precision,
  ADD COLUMN IF NOT EXISTS sos_longitude double precision,
  ADD COLUMN IF NOT EXISTS sos_radius_meters integer NOT NULL DEFAULT 300;

ALTER TABLE public.estates
  DROP CONSTRAINT IF EXISTS estates_sos_radius_chk;

ALTER TABLE public.estates
  ADD CONSTRAINT estates_sos_radius_chk
  CHECK (sos_radius_meters BETWEEN 50 AND 2000);

ALTER TABLE public.estates
  DROP CONSTRAINT IF EXISTS estates_sos_coords_chk;

ALTER TABLE public.estates
  ADD CONSTRAINT estates_sos_coords_chk
  CHECK (
    (sos_latitude IS NULL AND sos_longitude IS NULL)
    OR (
      sos_latitude IS NOT NULL
      AND sos_longitude IS NOT NULL
      AND sos_latitude BETWEEN -90 AND 90
      AND sos_longitude BETWEEN -180 AND 180
    )
  );

COMMENT ON COLUMN public.estates.sos_latitude IS
  'WGS84 center of the estate SOS geofence. Null disables the network.';

COMMENT ON COLUMN public.estates.sos_longitude IS
  'WGS84 center of the estate SOS geofence. Null disables the network.';

COMMENT ON COLUMN public.estates.sos_radius_meters IS
  'Geofence radius in meters. An alert is accepted only inside this distance.';

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.sos_memberships (
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  estate_id uuid NOT NULL REFERENCES public.estates (id) ON DELETE CASCADE,
  opted_in_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, estate_id)
);

COMMENT ON TABLE public.sos_memberships IS
  'Per-estate SOS opt-in. No row means the resident is outside the helper network.';

CREATE INDEX idx_sos_memberships_estate
  ON public.sos_memberships (estate_id);

CREATE TABLE public.sos_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estate_id uuid NOT NULL REFERENCES public.estates (id) ON DELETE CASCADE,
  caller_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  caller_display_name text NOT NULL,
  category text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  close_reason text,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  accuracy_meters numeric,
  location_id uuid NOT NULL REFERENCES public.cleaning_locations (id) ON DELETE RESTRICT,
  building_address text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  closed_at timestamptz,
  CONSTRAINT sos_alerts_category_chk CHECK (
    category IN ('burglary', 'medical', 'fire', 'other')
  ),
  CONSTRAINT sos_alerts_status_chk CHECK (
    status IN ('active', 'cancelled', 'resolved')
  ),
  CONSTRAINT sos_alerts_close_reason_chk CHECK (
    close_reason IS NULL
    OR close_reason IN ('false_alarm', 'resolved_by_caller', 'expired')
  ),
  CONSTRAINT sos_alerts_lifecycle_chk CHECK (
    (
      status = 'active'
      AND closed_at IS NULL
      AND close_reason IS NULL
    )
    OR (
      status = 'cancelled'
      AND closed_at IS NOT NULL
      AND close_reason = 'false_alarm'
    )
    OR (
      status = 'resolved'
      AND closed_at IS NOT NULL
      AND close_reason IN ('resolved_by_caller', 'expired')
    )
  ),
  CONSTRAINT sos_alerts_coords_chk CHECK (
    latitude BETWEEN -90 AND 90
    AND longitude BETWEEN -180 AND 180
  ),
  CONSTRAINT sos_alerts_accuracy_chk CHECK (
    accuracy_meters IS NULL
    OR (accuracy_meters >= 0 AND accuracy_meters <= 10000)
  ),
  CONSTRAINT sos_alerts_note_chk CHECK (
    note IS NULL
    OR (
      category = 'other'
      AND char_length(note) BETWEEN 1 AND 280
    )
  ),
  CONSTRAINT sos_alerts_names_not_blank_chk CHECK (
    char_length(btrim(caller_display_name)) > 0
    AND char_length(btrim(building_address)) > 0
  ),
  CONSTRAINT sos_alerts_expires_after_created_chk CHECK (expires_at > created_at)
);

COMMENT ON TABLE public.sos_alerts IS
  'One SOS incident. Coordinates are the device fix; building_address is a snapshot, never a unit number.';

CREATE UNIQUE INDEX sos_alerts_one_active_caller_uidx
  ON public.sos_alerts (caller_user_id)
  WHERE status = 'active';

CREATE INDEX idx_sos_alerts_caller_closed
  ON public.sos_alerts (caller_user_id, closed_at DESC)
  WHERE status IN ('cancelled', 'resolved');

CREATE INDEX idx_sos_alerts_estate_created
  ON public.sos_alerts (estate_id, caller_user_id, created_at DESC);

CREATE INDEX idx_sos_alerts_active_expires
  ON public.sos_alerts (expires_at)
  WHERE status = 'active';

CREATE TABLE public.sos_alert_participants (
  alert_id uuid NOT NULL REFERENCES public.sos_alerts (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  role text NOT NULL,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (alert_id, user_id),
  CONSTRAINT sos_alert_participants_role_chk CHECK (role IN ('caller', 'neighbor')),
  CONSTRAINT sos_alert_participants_name_chk CHECK (char_length(btrim(display_name)) > 0)
);

COMMENT ON TABLE public.sos_alert_participants IS
  'Snapshot of opted-in neighbors on the estate when the alert was created, plus the caller.';

CREATE UNIQUE INDEX sos_participants_one_caller_uidx
  ON public.sos_alert_participants (alert_id)
  WHERE role = 'caller';

CREATE INDEX idx_sos_alert_participants_user
  ON public.sos_alert_participants (user_id);

CREATE TABLE public.sos_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL UNIQUE REFERENCES public.sos_alerts (id) ON DELETE CASCADE,
  estate_id uuid NOT NULL REFERENCES public.estates (id) ON DELETE CASCADE,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

COMMENT ON TABLE public.sos_rooms IS
  'Temporary coordination room. One room per SOS alert.';

CREATE INDEX idx_sos_rooms_estate
  ON public.sos_rooms (estate_id);

CREATE TABLE public.sos_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.sos_rooms (id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  author_display_name text,
  kind text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sos_messages_kind_chk CHECK (kind IN ('user', 'system')),
  CONSTRAINT sos_messages_body_chk CHECK (
    char_length(body) <= 500
    AND char_length(btrim(body)) >= 1
  ),
  CONSTRAINT sos_messages_author_chk CHECK (
    (
      kind = 'system'
      AND author_user_id IS NULL
      AND author_display_name IS NULL
    )
    OR (
      kind = 'user'
      AND author_display_name IS NOT NULL
      AND char_length(btrim(author_display_name)) > 0
    )
  )
);

COMMENT ON TABLE public.sos_messages IS
  'SOS room messages. User rows keep a display-name snapshot so neighbors do not need profiles access.';

CREATE INDEX idx_sos_messages_room_created
  ON public.sos_messages (room_id, created_at);

CREATE TABLE public.sos_push_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL REFERENCES public.sos_alerts (id) ON DELETE CASCADE,
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sos_push_jobs_alert_kind_uidx UNIQUE (alert_id, kind),
  CONSTRAINT sos_push_jobs_kind_chk CHECK (kind IN ('alert', 'cancelled', 'resolved')),
  CONSTRAINT sos_push_jobs_status_chk CHECK (status IN ('pending', 'sent', 'failed')),
  CONSTRAINT sos_push_jobs_attempts_chk CHECK (attempts >= 0)
);

COMMENT ON TABLE public.sos_push_jobs IS
  'Outbox for SOS push. One row per alert and kind so a cancel can be delivered after the opening alert.';

CREATE INDEX idx_sos_push_jobs_pending
  ON public.sos_push_jobs (created_at)
  WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- Private helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.sos_set_rpc_flag()
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM set_config('app.sos_rpc', '1', true);
END;
$$;

CREATE OR REPLACE FUNCTION private.sos_distance_meters(
  p_lat1 double precision,
  p_lng1 double precision,
  p_lat2 double precision,
  p_lng2 double precision
)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog'
AS $$
  SELECT 6371000 * acos(
    LEAST(
      1::double precision,
      GREATEST(
        -1::double precision,
        cos(radians(p_lat1)) * cos(radians(p_lat2)) * cos(radians(p_lng2) - radians(p_lng1))
        + sin(radians(p_lat1)) * sin(radians(p_lat2))
      )
    )
  );
$$;

CREATE OR REPLACE FUNCTION private.sos_user_on_estate(p_user_id uuid, p_estate_id uuid)
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
    JOIN public.estates e
      ON e.id = em.estate_id
     AND e.status = 'active'
    WHERE la.user_id = p_user_id
      AND (la.expires_at IS NULL OR la.expires_at > now())
  );
$$;

CREATE OR REPLACE FUNCTION private.sos_display_name(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    NULLIF(btrim(p.full_name), ''),
    'Sąsiad'
  )
  FROM public.profiles p
  WHERE p.id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION private.sos_alert_is_visible(p_alert_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sos_alerts a
    JOIN public.sos_alert_participants p
      ON p.alert_id = a.id
     AND p.user_id = (SELECT auth.uid())
    WHERE a.id = p_alert_id
      AND (
        a.status = 'active'
        OR (
          a.closed_at IS NOT NULL
          AND a.closed_at > now() - interval '24 hours'
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION private.sos_room_is_writable(p_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sos_rooms r
    JOIN public.sos_alerts a ON a.id = r.alert_id
    JOIN public.sos_alert_participants p
      ON p.alert_id = a.id
     AND p.user_id = (SELECT auth.uid())
    WHERE r.id = p_room_id
      AND a.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION private.sos_close_alert(
  p_alert_id uuid,
  p_status text,
  p_reason text,
  p_system_body text,
  p_push_kind text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_room uuid;
BEGIN
  IF current_setting('app.sos_rpc', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'Alarm SOS można zmienić tylko przez funkcje SOS.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.sos_alerts
  SET
    status = p_status,
    close_reason = p_reason,
    closed_at = now()
  WHERE id = p_alert_id
    AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ten alarm nie jest już aktywny.'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.sos_rooms
  SET closed_at = now()
  WHERE alert_id = p_alert_id
    AND closed_at IS NULL
  RETURNING id INTO v_room;

  IF v_room IS NULL THEN
    RAISE EXCEPTION 'Brak pokoju koordynacji dla tego alarmu.'
      USING ERRCODE = '23514';
  END IF;

  PERFORM set_config('app.sos_system_message', '1', true);

  INSERT INTO public.sos_messages (room_id, author_user_id, kind, body)
  VALUES (v_room, NULL, 'system', p_system_body);

  INSERT INTO public.sos_push_jobs (alert_id, kind, status)
  VALUES (p_alert_id, p_push_kind, 'pending')
  ON CONFLICT (alert_id, kind) DO NOTHING;
END;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.tg_estates_sos_geofence_via_rpc()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF current_setting('app.sos_rpc', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'Strefę SOS osiedla ustawia się funkcją set_estate_sos_geofence.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_estates_sos_geofence_via_rpc ON public.estates;
CREATE TRIGGER trg_estates_sos_geofence_via_rpc
  BEFORE UPDATE OF sos_latitude, sos_longitude, sos_radius_meters
  ON public.estates
  FOR EACH ROW
  EXECUTE FUNCTION private.tg_estates_sos_geofence_via_rpc();

CREATE OR REPLACE FUNCTION private.tg_sos_memberships_via_rpc()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF current_setting('app.sos_rpc', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'Zgodę SOS zmienia się funkcjami join_sos_network i leave_sos_network.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sos_memberships_via_rpc ON public.sos_memberships;
CREATE TRIGGER trg_sos_memberships_via_rpc
  BEFORE INSERT OR UPDATE
  ON public.sos_memberships
  FOR EACH ROW
  EXECUTE FUNCTION private.tg_sos_memberships_via_rpc();

CREATE OR REPLACE FUNCTION private.tg_sos_alerts_via_rpc()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF current_setting('app.sos_rpc', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'Alarm SOS można zmienić tylko przez funkcje SOS.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE'
     AND (
       NEW.caller_user_id IS DISTINCT FROM OLD.caller_user_id
       OR NEW.estate_id IS DISTINCT FROM OLD.estate_id
       OR NEW.caller_display_name IS DISTINCT FROM OLD.caller_display_name
       OR NEW.category IS DISTINCT FROM OLD.category
       OR NEW.latitude IS DISTINCT FROM OLD.latitude
       OR NEW.longitude IS DISTINCT FROM OLD.longitude
       OR NEW.accuracy_meters IS DISTINCT FROM OLD.accuracy_meters
       OR NEW.location_id IS DISTINCT FROM OLD.location_id
       OR NEW.building_address IS DISTINCT FROM OLD.building_address
       OR NEW.note IS DISTINCT FROM OLD.note
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
       OR NEW.id IS DISTINCT FROM OLD.id
     )
  THEN
    RAISE EXCEPTION 'Nie można zmienić treści alarmu SOS.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sos_alerts_via_rpc ON public.sos_alerts;
CREATE TRIGGER trg_sos_alerts_via_rpc
  BEFORE INSERT OR UPDATE
  ON public.sos_alerts
  FOR EACH ROW
  EXECUTE FUNCTION private.tg_sos_alerts_via_rpc();

CREATE OR REPLACE FUNCTION private.tg_sos_enqueue_alert_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Alert insert is already gated by app.sos_rpc. Restate it so this
  -- follow-up insert satisfies trg_sos_push_jobs_via_rpc in the same transaction.
  PERFORM private.sos_set_rpc_flag();

  INSERT INTO public.sos_push_jobs (alert_id, kind, status)
  VALUES (NEW.id, 'alert', 'pending')
  ON CONFLICT (alert_id, kind) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sos_enqueue_alert_push ON public.sos_alerts;
CREATE TRIGGER trg_sos_enqueue_alert_push
  AFTER INSERT ON public.sos_alerts
  FOR EACH ROW
  EXECUTE FUNCTION private.tg_sos_enqueue_alert_push();

CREATE OR REPLACE FUNCTION private.tg_sos_participants_via_rpc()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND current_setting('app.sos_rpc', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'Uczestników alarmu SOS dopisuje wyłącznie create_sos_alert.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Listy uczestników alarmu SOS nie można zmieniać.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sos_participants_via_rpc ON public.sos_alert_participants;
CREATE TRIGGER trg_sos_participants_via_rpc
  BEFORE INSERT OR UPDATE
  ON public.sos_alert_participants
  FOR EACH ROW
  EXECUTE FUNCTION private.tg_sos_participants_via_rpc();

CREATE OR REPLACE FUNCTION private.tg_sos_rooms_via_rpc()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF current_setting('app.sos_rpc', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'Pokój SOS można zmienić tylko przez funkcje SOS.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE'
     AND (
       NEW.id IS DISTINCT FROM OLD.id
       OR NEW.alert_id IS DISTINCT FROM OLD.alert_id
       OR NEW.estate_id IS DISTINCT FROM OLD.estate_id
       OR NEW.opened_at IS DISTINCT FROM OLD.opened_at
     )
  THEN
    RAISE EXCEPTION 'Nie można zmienić pokoju SOS.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sos_rooms_via_rpc ON public.sos_rooms;
CREATE TRIGGER trg_sos_rooms_via_rpc
  BEFORE INSERT OR UPDATE
  ON public.sos_rooms
  FOR EACH ROW
  EXECUTE FUNCTION private.tg_sos_rooms_via_rpc();

CREATE OR REPLACE FUNCTION private.tg_sos_messages_stamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_name text;
BEGIN
  NEW.created_at := now();

  IF current_setting('app.sos_system_message', true) = '1' THEN
    IF NEW.kind IS DISTINCT FROM 'system' OR NEW.author_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'Nieprawidłowa wiadomość systemowa.'
        USING ERRCODE = '23514';
    END IF;
    NEW.author_display_name := NULL;
    NEW.body := btrim(NEW.body);
    RETURN NEW;
  END IF;

  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Brak sesji.'
      USING ERRCODE = '42501';
  END IF;

  NEW.kind := 'user';
  NEW.author_user_id := (SELECT auth.uid());
  NEW.body := btrim(COALESCE(NEW.body, ''));
  v_name := private.sos_display_name(NEW.author_user_id);
  NEW.author_display_name := COALESCE(v_name, 'Sąsiad');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sos_messages_stamp ON public.sos_messages;
CREATE TRIGGER trg_sos_messages_stamp
  BEFORE INSERT ON public.sos_messages
  FOR EACH ROW
  EXECUTE FUNCTION private.tg_sos_messages_stamp();

CREATE OR REPLACE FUNCTION private.tg_sos_messages_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.author_user_id IS NULL
     AND OLD.author_user_id IS NOT NULL
     AND NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.room_id IS NOT DISTINCT FROM OLD.room_id
     AND NEW.kind IS NOT DISTINCT FROM OLD.kind
     AND NEW.body IS NOT DISTINCT FROM OLD.body
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
     AND NEW.author_display_name IS NOT DISTINCT FROM OLD.author_display_name
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Wiadomości SOS są niezmienne.'
    USING ERRCODE = '23514';
END;
$$;

DROP TRIGGER IF EXISTS trg_sos_messages_immutable ON public.sos_messages;
CREATE TRIGGER trg_sos_messages_immutable
  BEFORE UPDATE ON public.sos_messages
  FOR EACH ROW
  EXECUTE FUNCTION private.tg_sos_messages_immutable();

CREATE OR REPLACE FUNCTION private.tg_sos_push_jobs_via_rpc()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF current_setting('app.sos_rpc', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'Kolejkę push SOS zapisują wyłącznie funkcje SOS.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sos_push_jobs_via_rpc ON public.sos_push_jobs;
CREATE TRIGGER trg_sos_push_jobs_via_rpc
  BEFORE INSERT ON public.sos_push_jobs
  FOR EACH ROW
  EXECUTE FUNCTION private.tg_sos_push_jobs_via_rpc();

DROP TRIGGER IF EXISTS trg_sos_push_jobs_updated_at ON public.sos_push_jobs;
CREATE TRIGGER trg_sos_push_jobs_updated_at
  BEFORE UPDATE ON public.sos_push_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- RLS helpers exposed to policies (boolean only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sos_can_read_alert(p_alert_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT private.sos_alert_is_visible(p_alert_id);
$$;

COMMENT ON FUNCTION public.sos_can_read_alert(uuid) IS
  'True when the caller is a snapshotted participant and the alert is active or closed within 24 hours.';

CREATE OR REPLACE FUNCTION public.sos_can_write_room(p_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT private.sos_room_is_writable(p_room_id);
$$;

COMMENT ON FUNCTION public.sos_can_write_room(uuid) IS
  'True when the caller is a participant and the related alert is still active.';

REVOKE ALL ON FUNCTION public.sos_can_read_alert(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sos_can_write_room(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sos_can_read_alert(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.sos_can_write_room(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.sos_can_read_alert(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sos_can_write_room(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.sos_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sos_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sos_alert_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sos_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sos_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sos_push_jobs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.sos_memberships FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.sos_alerts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.sos_alert_participants FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.sos_rooms FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.sos_messages FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.sos_push_jobs FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.sos_memberships TO authenticated;
GRANT SELECT ON TABLE public.sos_alerts TO authenticated;
GRANT SELECT ON TABLE public.sos_alert_participants TO authenticated;
GRANT SELECT ON TABLE public.sos_rooms TO authenticated;
GRANT SELECT, INSERT ON TABLE public.sos_messages TO authenticated;

GRANT ALL ON TABLE public.sos_memberships TO service_role;
GRANT ALL ON TABLE public.sos_alerts TO service_role;
GRANT ALL ON TABLE public.sos_alert_participants TO service_role;
GRANT ALL ON TABLE public.sos_rooms TO service_role;
GRANT ALL ON TABLE public.sos_messages TO service_role;
GRANT ALL ON TABLE public.sos_push_jobs TO service_role;

DROP POLICY IF EXISTS sos_memberships_select_own ON public.sos_memberships;
CREATE POLICY sos_memberships_select_own
  ON public.sos_memberships
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS sos_alerts_select_participant ON public.sos_alerts;
CREATE POLICY sos_alerts_select_participant
  ON public.sos_alerts
  FOR SELECT
  TO authenticated
  USING ((SELECT public.sos_can_read_alert(id)));

DROP POLICY IF EXISTS sos_alert_participants_select_participant ON public.sos_alert_participants;
CREATE POLICY sos_alert_participants_select_participant
  ON public.sos_alert_participants
  FOR SELECT
  TO authenticated
  USING ((SELECT public.sos_can_read_alert(alert_id)));

DROP POLICY IF EXISTS sos_rooms_select_participant ON public.sos_rooms;
CREATE POLICY sos_rooms_select_participant
  ON public.sos_rooms
  FOR SELECT
  TO authenticated
  USING ((SELECT public.sos_can_read_alert(alert_id)));

DROP POLICY IF EXISTS sos_messages_select_participant ON public.sos_messages;
CREATE POLICY sos_messages_select_participant
  ON public.sos_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.sos_rooms r
      WHERE r.id = room_id
        AND (SELECT public.sos_can_read_alert(r.alert_id))
    )
  );

DROP POLICY IF EXISTS sos_messages_insert_participant ON public.sos_messages;
CREATE POLICY sos_messages_insert_participant
  ON public.sos_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    kind = 'user'
    AND author_user_id = (SELECT auth.uid())
    AND author_display_name IS NOT NULL
    AND (SELECT public.sos_can_write_room(room_id))
  );

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

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

  PERFORM private.sos_set_rpc_flag();

  INSERT INTO public.sos_memberships (user_id, estate_id)
  VALUES (v_actor, p_estate_id)
  ON CONFLICT (user_id, estate_id) DO UPDATE
  SET opted_in_at = now();
END;
$$;

COMMENT ON FUNCTION public.join_sos_network(uuid) IS
  'Opts the signed-in resident into SOS for an estate they can already access.';

CREATE OR REPLACE FUNCTION public.leave_sos_network(p_estate_id uuid)
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

  IF p_estate_id IS NULL THEN
    RAISE EXCEPTION 'Nie możesz opuścić sieci SOS tego osiedla.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM private.sos_set_rpc_flag();

  DELETE FROM public.sos_memberships
  WHERE user_id = v_actor
    AND estate_id = p_estate_id;
END;
$$;

COMMENT ON FUNCTION public.leave_sos_network(uuid) IS
  'Removes the signed-in resident from one estate SOS network. Existing alerts stay visible to them.';

CREATE OR REPLACE FUNCTION public.set_estate_sos_geofence(
  p_estate_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_radius_meters integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
  v_status text;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Brak sesji.'
      USING ERRCODE = '42501';
  END IF;

  SELECT e.created_by_org_id, e.status
  INTO v_org, v_status
  FROM public.estates e
  WHERE e.id = p_estate_id;

  IF v_org IS NULL OR v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Nie znaleziono aktywnego osiedla.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_org_management(v_org) THEN
    RAISE EXCEPTION 'Brak uprawnień do ustawienia strefy SOS tego osiedla.'
      USING ERRCODE = '42501';
  END IF;

  IF p_radius_meters IS NULL OR p_radius_meters < 50 OR p_radius_meters > 2000 THEN
    RAISE EXCEPTION 'Promień strefy SOS musi mieć od 50 do 2000 metrów.'
      USING ERRCODE = '23514';
  END IF;

  IF (p_latitude IS NULL) IS DISTINCT FROM (p_longitude IS NULL)
     OR (p_latitude IS NOT NULL AND (p_latitude <> p_latitude OR p_longitude <> p_longitude))
     OR (p_latitude IS NOT NULL AND (p_latitude < -90 OR p_latitude > 90 OR p_longitude < -180 OR p_longitude > 180))
  THEN
    RAISE EXCEPTION 'Podaj obie współrzędne strefy SOS albo żadnej.'
      USING ERRCODE = '23514';
  END IF;

  PERFORM private.sos_set_rpc_flag();

  UPDATE public.estates
  SET
    sos_latitude = p_latitude,
    sos_longitude = p_longitude,
    sos_radius_meters = p_radius_meters
  WHERE id = p_estate_id;
END;
$$;

COMMENT ON FUNCTION public.set_estate_sos_geofence(uuid, double precision, double precision, integer) IS
  'Sets or clears the SOS geofence. Caller must manage the organization that created the estate.';

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
    AND private.sos_user_on_estate(m.user_id, v_estate);

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
  'Opens an SOS alert for the signed-in resident after opt-in, building access, geofence, and rate limits.';

CREATE OR REPLACE FUNCTION public.cancel_sos_alert(p_alert_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_caller uuid;
  v_status text;
BEGIN
  PERFORM set_config('app.sos_system_message', '0', true);

  IF v_actor IS NULL OR p_alert_id IS NULL THEN
    RAISE EXCEPTION 'Nie możesz odwołać tego alarmu.'
      USING ERRCODE = '42501';
  END IF;

  SELECT a.caller_user_id, a.status
  INTO v_caller, v_status
  FROM public.sos_alerts a
  WHERE a.id = p_alert_id;

  IF v_caller IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'Nie możesz odwołać tego alarmu.'
      USING ERRCODE = '42501';
  END IF;

  IF v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Ten alarm nie jest już aktywny.'
      USING ERRCODE = '23514';
  END IF;

  PERFORM private.sos_set_rpc_flag();
  PERFORM private.sos_close_alert(
    p_alert_id,
    'cancelled',
    'false_alarm',
    'Alarm odwołany — fałszywy alarm.',
    'cancelled'
  );
END;
$$;

COMMENT ON FUNCTION public.cancel_sos_alert(uuid) IS
  'Caller marks their active alert as a false alarm and closes the room.';

CREATE OR REPLACE FUNCTION public.resolve_sos_alert(p_alert_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_caller uuid;
  v_status text;
BEGIN
  PERFORM set_config('app.sos_system_message', '0', true);

  IF v_actor IS NULL OR p_alert_id IS NULL THEN
    RAISE EXCEPTION 'Nie możesz zakończyć tego alarmu.'
      USING ERRCODE = '42501';
  END IF;

  SELECT a.caller_user_id, a.status
  INTO v_caller, v_status
  FROM public.sos_alerts a
  WHERE a.id = p_alert_id;

  IF v_caller IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'Nie możesz zakończyć tego alarmu.'
      USING ERRCODE = '42501';
  END IF;

  IF v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Ten alarm nie jest już aktywny.'
      USING ERRCODE = '23514';
  END IF;

  PERFORM private.sos_set_rpc_flag();
  PERFORM private.sos_close_alert(
    p_alert_id,
    'resolved',
    'resolved_by_caller',
    'Alarm zakończony.',
    'resolved'
  );
END;
$$;

COMMENT ON FUNCTION public.resolve_sos_alert(uuid) IS
  'Caller closes an active alert as handled.';

CREATE OR REPLACE FUNCTION public.post_sos_message(p_room_id uuid, p_body text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_body text := btrim(COALESCE(p_body, ''));
  v_id uuid;
BEGIN
  PERFORM set_config('app.sos_system_message', '0', true);

  IF v_actor IS NULL OR p_room_id IS NULL THEN
    RAISE EXCEPTION 'Nie możesz pisać w tym czacie.'
      USING ERRCODE = '42501';
  END IF;

  IF char_length(v_body) < 1 OR char_length(v_body) > 500 THEN
    RAISE EXCEPTION 'Wiadomość musi mieć od 1 do 500 znaków.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT private.sos_room_is_writable(p_room_id) THEN
    RAISE EXCEPTION 'Czat tego alarmu jest zamknięty albo nie masz do niego dostępu.'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.sos_messages (room_id, body, kind)
  VALUES (p_room_id, v_body, 'user')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.post_sos_message(uuid, text) IS
  'Posts a resident message into an active SOS room the caller already belongs to.';

CREATE OR REPLACE FUNCTION public.expire_sos_alerts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_count integer := 0;
BEGIN
  PERFORM private.sos_set_rpc_flag();

  FOR v_id IN
    SELECT a.id
    FROM public.sos_alerts a
    WHERE a.status = 'active'
      AND a.expires_at <= now()
    ORDER BY a.expires_at
    FOR UPDATE
  LOOP
    PERFORM private.sos_close_alert(
      v_id,
      'resolved',
      'expired',
      'Alarm wygasł.',
      'resolved'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.expire_sos_alerts() IS
  'Closes active SOS alerts whose two-hour window has elapsed. Intended for service_role or cron.';

REVOKE ALL ON FUNCTION public.join_sos_network(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leave_sos_network(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_estate_sos_geofence(uuid, double precision, double precision, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_sos_alert(uuid, text, double precision, double precision, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_sos_alert(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_sos_alert(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.post_sos_message(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.expire_sos_alerts() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.join_sos_network(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_sos_network(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_estate_sos_geofence(uuid, double precision, double precision, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_sos_alert(uuid, text, double precision, double precision, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_sos_alert(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_sos_alert(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_sos_message(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_sos_alerts() TO service_role;

REVOKE ALL ON FUNCTION private.sos_set_rpc_flag() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.sos_distance_meters(double precision, double precision, double precision, double precision) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.sos_user_on_estate(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.sos_display_name(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.sos_alert_is_visible(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.sos_room_is_writable(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.sos_close_alert(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.tg_estates_sos_geofence_via_rpc() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.tg_sos_memberships_via_rpc() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.tg_sos_alerts_via_rpc() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.tg_sos_enqueue_alert_push() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.tg_sos_participants_via_rpc() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.tg_sos_rooms_via_rpc() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.tg_sos_messages_stamp() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.tg_sos_messages_immutable() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.tg_sos_push_jobs_via_rpc() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
