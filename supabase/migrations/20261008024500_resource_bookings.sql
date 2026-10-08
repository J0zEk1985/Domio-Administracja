-- Rezerwacje zasobów wspólnoty: tabele, RLS i RPC dla Home oraz panelu zarządcy.
-- Tabela shared_resources już istnieje. Ta migracja jej nie przebudowuje.

BEGIN;

CREATE TYPE public.booking_status AS ENUM (
  'pending',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
  'rejected',
  'no_show'
);

CREATE TABLE public.resource_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid NOT NULL REFERENCES public.shared_resources(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  booked_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  booked_by_unit_id uuid REFERENCES public.community_units(id) ON DELETE SET NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status public.booking_status NOT NULL DEFAULT 'pending',
  calculated_price numeric(10,2) NOT NULL DEFAULT 0,
  deposit_paid numeric(10,2) NOT NULL DEFAULT 0,
  temporary_access_code text,
  access_code_valid_from timestamptz,
  access_code_valid_until timestamptz,
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  check_out_photo_url text,
  check_out_notes text,
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rejected_at timestamptz,
  rejection_reason text,
  cancelled_at timestamptz,
  cancellation_reason text,
  booking_notes text,
  internal_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resource_bookings_time_check CHECK (ends_at > starts_at),
  CONSTRAINT resource_bookings_confirmed_has_approval CHECK (
    status <> 'confirmed' OR approved_at IS NOT NULL
  )
);

CREATE INDEX idx_resource_bookings_resource_range
  ON public.resource_bookings (resource_id, starts_at, ends_at);

CREATE INDEX idx_resource_bookings_active_range
  ON public.resource_bookings (resource_id, starts_at, ends_at)
  WHERE status IN ('pending', 'confirmed', 'in_progress');

CREATE INDEX idx_resource_bookings_user_ends
  ON public.resource_bookings (booked_by_user_id, ends_at);

CREATE INDEX idx_resource_bookings_org_status
  ON public.resource_bookings (org_id, status);

CREATE TABLE public.resource_booking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.resource_bookings(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_resource_booking_events_booking
  ON public.resource_booking_events (booking_id, created_at DESC);

CREATE TABLE public.resource_availability_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid NOT NULL REFERENCES public.shared_resources(id) ON DELETE CASCADE,
  day_of_week integer,
  available_from time,
  available_until time,
  specific_date date,
  is_available boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resource_availability_rules_day_check CHECK (
    day_of_week IS NULL OR day_of_week BETWEEN 0 AND 6
  ),
  CONSTRAINT resource_availability_rules_time_check CHECK (
    (available_from IS NULL AND available_until IS NULL)
    OR (available_from IS NOT NULL AND available_until IS NOT NULL AND available_until > available_from)
  )
);

CREATE INDEX idx_resource_availability_resource
  ON public.resource_availability_rules (resource_id);

CREATE TABLE public.resource_usage_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.community_units(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES public.shared_resources(id) ON DELETE CASCADE,
  year integer NOT NULL,
  month integer NOT NULL,
  total_bookings integer NOT NULL DEFAULT 0,
  total_hours numeric(10,2) NOT NULL DEFAULT 0,
  total_cost numeric(10,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resource_usage_stats_month_check CHECK (month BETWEEN 1 AND 12),
  CONSTRAINT resource_usage_stats_unique UNIQUE (unit_id, resource_id, year, month)
);

CREATE INDEX idx_resource_usage_stats_resource_period
  ON public.resource_usage_stats (resource_id, year, month);

CREATE TRIGGER trg_resource_bookings_updated_at
  BEFORE UPDATE ON public.resource_bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.log_booking_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.resource_booking_events (
    booking_id,
    event_type,
    event_data,
    performed_by
  ) VALUES (
    NEW.id,
    CASE
      WHEN TG_OP = 'INSERT' THEN 'created'
      WHEN OLD.status IS DISTINCT FROM NEW.status THEN 'status_changed'
      WHEN NEW.checked_in_at IS NOT NULL AND OLD.checked_in_at IS NULL THEN 'checked_in'
      WHEN NEW.checked_out_at IS NOT NULL AND OLD.checked_out_at IS NULL THEN 'checked_out'
      ELSE 'modified'
    END,
    jsonb_build_object(
      'status', NEW.status,
      'previous_status', CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD.status) ELSE NULL END
    ),
    auth.uid()
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_resource_bookings_log_events
  AFTER INSERT OR UPDATE ON public.resource_bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.log_booking_event();

CREATE OR REPLACE FUNCTION public.apply_resource_usage_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hours numeric;
  v_delta integer := 0;
  v_now_counted boolean;
  v_was_counted boolean;
BEGIN
  IF NEW.booked_by_unit_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_now_counted := NEW.status IN ('confirmed', 'in_progress', 'completed');
  v_was_counted := TG_OP = 'UPDATE' AND OLD.status IN ('confirmed', 'in_progress', 'completed');

  IF TG_OP = 'INSERT' AND v_now_counted THEN
    v_delta := 1;
  ELSIF TG_OP = 'UPDATE' AND v_now_counted AND NOT v_was_counted THEN
    v_delta := 1;
  ELSIF TG_OP = 'UPDATE' AND v_was_counted AND NOT v_now_counted THEN
    v_delta := -1;
  ELSE
    RETURN NEW;
  END IF;

  v_hours := EXTRACT(EPOCH FROM (NEW.ends_at - NEW.starts_at)) / 3600;

  IF v_delta > 0 THEN
    INSERT INTO public.resource_usage_stats (
      org_id, unit_id, resource_id, year, month, total_bookings, total_hours, total_cost
    ) VALUES (
      NEW.org_id,
      NEW.booked_by_unit_id,
      NEW.resource_id,
      EXTRACT(YEAR FROM NEW.starts_at)::integer,
      EXTRACT(MONTH FROM NEW.starts_at)::integer,
      1,
      v_hours,
      COALESCE(NEW.calculated_price, 0)
    )
    ON CONFLICT (unit_id, resource_id, year, month)
    DO UPDATE SET
      total_bookings = public.resource_usage_stats.total_bookings + 1,
      total_hours = public.resource_usage_stats.total_hours + EXCLUDED.total_hours,
      total_cost = public.resource_usage_stats.total_cost + EXCLUDED.total_cost,
      updated_at = now();
  ELSE
    UPDATE public.resource_usage_stats
    SET
      total_bookings = GREATEST(0, total_bookings - 1),
      total_hours = GREATEST(0, total_hours - v_hours),
      total_cost = GREATEST(0, total_cost - COALESCE(NEW.calculated_price, 0)),
      updated_at = now()
    WHERE unit_id = NEW.booked_by_unit_id
      AND resource_id = NEW.resource_id
      AND year = EXTRACT(YEAR FROM NEW.starts_at)::integer
      AND month = EXTRACT(MONTH FROM NEW.starts_at)::integer;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_resource_bookings_usage_stats
  AFTER INSERT OR UPDATE OF status ON public.resource_bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_resource_usage_stats();

CREATE OR REPLACE FUNCTION public.resident_community_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT cu.community_id
  FROM public.location_access la
  JOIN public.community_units cu
    ON cu.location_id = la.location_id
   AND public.normalize_unit_number(la.unit_number) = cu.normalized_unit_number
  WHERE la.user_id = auth.uid()
    AND cu.community_id IS NOT NULL
    AND (la.expires_at IS NULL OR la.expires_at > now());
$$;

CREATE OR REPLACE FUNCTION public.has_unit_access_for_booking(p_unit_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.location_access la
    JOIN public.community_units cu
      ON cu.location_id = la.location_id
     AND public.normalize_unit_number(la.unit_number) = cu.normalized_unit_number
    WHERE cu.id = p_unit_id
      AND la.user_id = auth.uid()
      AND (la.expires_at IS NULL OR la.expires_at > now())
  );
$$;

CREATE OR REPLACE FUNCTION public.check_booking_overlap(
  p_resource_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_exclude_booking_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.resource_bookings
    WHERE resource_id = p_resource_id
      AND status IN ('pending', 'confirmed', 'in_progress')
      AND (p_exclude_booking_id IS NULL OR id <> p_exclude_booking_id)
      AND starts_at < p_ends_at
      AND ends_at > p_starts_at
  );
$$;

CREATE OR REPLACE FUNCTION public.check_unit_booking_limits(
  p_unit_id uuid,
  p_resource_id uuid,
  p_duration_hours numeric
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_bookings integer;
  v_max_hours numeric;
  v_bookings integer := 0;
  v_hours numeric := 0;
BEGIN
  SELECT max_bookings_per_unit_monthly, max_hours_per_unit_monthly
  INTO v_max_bookings, v_max_hours
  FROM public.shared_resources
  WHERE id = p_resource_id;

  SELECT COALESCE(total_bookings, 0), COALESCE(total_hours, 0)
  INTO v_bookings, v_hours
  FROM public.resource_usage_stats
  WHERE unit_id = p_unit_id
    AND resource_id = p_resource_id
    AND year = EXTRACT(YEAR FROM now())::integer
    AND month = EXTRACT(MONTH FROM now())::integer;

  IF v_max_bookings IS NOT NULL AND v_bookings >= v_max_bookings THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'exceeded_monthly_booking_limit',
      'current', v_bookings,
      'limit', v_max_bookings
    );
  END IF;

  IF v_max_hours IS NOT NULL AND (v_hours + COALESCE(p_duration_hours, 0)) > v_max_hours THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'exceeded_monthly_hours_limit',
      'current', v_hours,
      'limit', v_max_hours
    );
  END IF;

  RETURN jsonb_build_object('allowed', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_booking_unit(p_location_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cu.id
  FROM public.location_access la
  JOIN public.community_units cu
    ON cu.location_id = la.location_id
   AND public.normalize_unit_number(la.unit_number) = cu.normalized_unit_number
  WHERE la.user_id = auth.uid()
    AND la.location_id = p_location_id
    AND (la.expires_at IS NULL OR la.expires_at > now())
  ORDER BY cu.created_at
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.create_booking(
  p_resource_id uuid,
  p_unit_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_booking_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resource public.shared_resources%ROWTYPE;
  v_unit public.community_units%ROWTYPE;
  v_duration_hours numeric;
  v_duration_days numeric;
  v_price numeric := 0;
  v_status public.booking_status;
  v_booking_id uuid;
  v_advance_days integer;
  v_limits jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied', 'message', 'Brak sesji');
  END IF;

  SELECT * INTO v_resource
  FROM public.shared_resources
  WHERE id = p_resource_id AND status = 'active';

  IF v_resource.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'resource_not_found', 'message', 'Zasób nie istnieje albo nie jest aktywny');
  END IF;

  SELECT * INTO v_unit FROM public.community_units WHERE id = p_unit_id;
  IF v_unit.id IS NULL OR NOT public.has_unit_access_for_booking(p_unit_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied', 'message', 'Brak dostępu do tego lokalu');
  END IF;

  IF v_resource.community_id IS NOT NULL AND v_unit.community_id IS DISTINCT FROM v_resource.community_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied', 'message', 'Ten zasób nie należy do Twojej wspólnoty');
  END IF;

  IF p_ends_at <= p_starts_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_time_range', 'message', 'Koniec rezerwacji musi być późniejszy niż początek');
  END IF;

  IF p_starts_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'booking_in_past', 'message', 'Nie można rezerwować terminu z przeszłości');
  END IF;

  v_advance_days := FLOOR(EXTRACT(EPOCH FROM (p_starts_at - now())) / 86400)::integer;
  IF v_resource.max_advance_booking_days IS NOT NULL AND v_advance_days > v_resource.max_advance_booking_days THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'too_far_in_advance',
      'message', format('Można rezerwować maksymalnie %s dni naprzód', v_resource.max_advance_booking_days)
    );
  END IF;

  v_duration_hours := EXTRACT(EPOCH FROM (p_ends_at - p_starts_at)) / 3600;
  v_duration_days := v_duration_hours / 24;

  IF v_resource.min_booking_duration IS NOT NULL THEN
    IF v_resource.billing_unit = 'hourly' AND v_duration_hours < v_resource.min_booking_duration THEN
      RETURN jsonb_build_object('success', false, 'error', 'duration_too_short', 'message', format('Minimalna długość rezerwacji: %s godz.', v_resource.min_booking_duration));
    END IF;
    IF v_resource.billing_unit = 'daily' AND v_duration_days < v_resource.min_booking_duration THEN
      RETURN jsonb_build_object('success', false, 'error', 'duration_too_short', 'message', format('Minimalna długość rezerwacji: %s dni', v_resource.min_booking_duration));
    END IF;
  END IF;

  IF v_resource.max_booking_duration IS NOT NULL THEN
    IF v_resource.billing_unit = 'hourly' AND v_duration_hours > v_resource.max_booking_duration THEN
      RETURN jsonb_build_object('success', false, 'error', 'duration_too_long', 'message', format('Maksymalna długość rezerwacji: %s godz.', v_resource.max_booking_duration));
    END IF;
    IF v_resource.billing_unit = 'daily' AND v_duration_days > v_resource.max_booking_duration THEN
      RETURN jsonb_build_object('success', false, 'error', 'duration_too_long', 'message', format('Maksymalna długość rezerwacji: %s dni', v_resource.max_booking_duration));
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_resource_id::text, 0));

  IF public.check_booking_overlap(p_resource_id, p_starts_at, p_ends_at, NULL) THEN
    RETURN jsonb_build_object('success', false, 'error', 'time_slot_unavailable', 'message', 'Ten termin jest już zajęty');
  END IF;

  v_limits := public.check_unit_booking_limits(p_unit_id, p_resource_id, v_duration_hours);
  IF NOT COALESCE((v_limits->>'allowed')::boolean, false) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'fair_play_limit_exceeded',
      'message', 'Przekroczony miesięczny limit tego zasobu',
      'details', v_limits
    );
  END IF;

  IF COALESCE(v_resource.is_free, true) THEN
    v_price := 0;
  ELSIF v_resource.billing_unit = 'hourly' THEN
    v_price := COALESCE(v_resource.price_per_hour, 0) * v_duration_hours;
  ELSE
    v_price := COALESCE(v_resource.price_per_day, 0) * CEIL(v_duration_days);
  END IF;

  IF COALESCE(v_resource.requires_manager_approval, false) OR COALESCE(v_resource.requires_owner_approval, false) THEN
    v_status := 'pending';
  ELSE
    v_status := 'confirmed';
  END IF;

  INSERT INTO public.resource_bookings (
    resource_id,
    org_id,
    booked_by_user_id,
    booked_by_unit_id,
    starts_at,
    ends_at,
    status,
    calculated_price,
    booking_notes,
    approved_at,
    approved_by
  ) VALUES (
    p_resource_id,
    v_resource.org_id,
    auth.uid(),
    p_unit_id,
    p_starts_at,
    p_ends_at,
    v_status,
    v_price,
    NULLIF(left(btrim(COALESCE(p_booking_notes, '')), 1000), ''),
    CASE WHEN v_status = 'confirmed' THEN now() ELSE NULL END,
    CASE WHEN v_status = 'confirmed' THEN auth.uid() ELSE NULL END
  )
  RETURNING id INTO v_booking_id;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', v_booking_id,
    'status', v_status,
    'calculated_price', v_price,
    'message', CASE WHEN v_status = 'pending' THEN 'Rezerwacja czeka na zatwierdzenie' ELSE 'Rezerwacja potwierdzona' END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_booking(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.resource_bookings%ROWTYPE;
  v_resource public.shared_resources%ROWTYPE;
BEGIN
  SELECT * INTO v_booking FROM public.resource_bookings WHERE id = p_booking_id;
  IF v_booking.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'booking_not_found', 'message', 'Nie znaleziono rezerwacji');
  END IF;
  IF v_booking.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_status', 'message', 'Można zatwierdzić tylko rezerwację oczekującą');
  END IF;

  SELECT * INTO v_resource FROM public.shared_resources WHERE id = v_booking.resource_id;
  IF NOT (
    (v_resource.resource_type = 'community_managed' AND public.is_org_management(v_booking.org_id))
    OR (v_resource.resource_type = 'private_peer' AND v_resource.owner_user_id = auth.uid())
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied', 'message', 'Brak uprawnień do zatwierdzenia');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_booking.resource_id::text, 0));

  IF public.check_booking_overlap(v_booking.resource_id, v_booking.starts_at, v_booking.ends_at, p_booking_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'time_slot_now_unavailable', 'message', 'Ten termin został już zajęty');
  END IF;

  UPDATE public.resource_bookings
  SET status = 'confirmed', approved_at = now(), approved_by = auth.uid()
  WHERE id = p_booking_id;

  RETURN jsonb_build_object('success', true, 'message', 'Rezerwacja zatwierdzona');
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_booking(
  p_booking_id uuid,
  p_rejection_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.resource_bookings%ROWTYPE;
  v_resource public.shared_resources%ROWTYPE;
BEGIN
  SELECT * INTO v_booking FROM public.resource_bookings WHERE id = p_booking_id;
  IF v_booking.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'booking_not_found', 'message', 'Nie znaleziono rezerwacji');
  END IF;
  IF v_booking.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_status', 'message', 'Można odrzucić tylko rezerwację oczekującą');
  END IF;

  SELECT * INTO v_resource FROM public.shared_resources WHERE id = v_booking.resource_id;
  IF NOT (
    (v_resource.resource_type = 'community_managed' AND public.is_org_management(v_booking.org_id))
    OR (v_resource.resource_type = 'private_peer' AND v_resource.owner_user_id = auth.uid())
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied', 'message', 'Brak uprawnień do odrzucenia');
  END IF;

  UPDATE public.resource_bookings
  SET
    status = 'rejected',
    rejected_at = now(),
    rejection_reason = NULLIF(left(btrim(COALESCE(p_rejection_reason, '')), 500), '')
  WHERE id = p_booking_id;

  RETURN jsonb_build_object('success', true, 'message', 'Rezerwacja odrzucona');
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_booking(
  p_booking_id uuid,
  p_cancellation_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.resource_bookings%ROWTYPE;
BEGIN
  SELECT * INTO v_booking FROM public.resource_bookings WHERE id = p_booking_id;
  IF v_booking.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'booking_not_found', 'message', 'Nie znaleziono rezerwacji');
  END IF;
  IF v_booking.booked_by_user_id <> auth.uid() AND NOT public.is_org_management(v_booking.org_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied', 'message', 'Brak uprawnień do anulowania');
  END IF;
  IF v_booking.status NOT IN ('pending', 'confirmed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_status', 'message', 'Tej rezerwacji nie można już anulować');
  END IF;
  IF v_booking.starts_at <= now() AND v_booking.booked_by_user_id = auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'booking_already_started', 'message', 'Nie można anulować rezerwacji, która już się zaczęła');
  END IF;

  UPDATE public.resource_bookings
  SET
    status = 'cancelled',
    cancelled_at = now(),
    cancellation_reason = NULLIF(left(btrim(COALESCE(p_cancellation_reason, '')), 500), '')
  WHERE id = p_booking_id;

  RETURN jsonb_build_object('success', true, 'message', 'Rezerwacja anulowana');
END;
$$;

CREATE OR REPLACE FUNCTION public.check_in_booking(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.resource_bookings%ROWTYPE;
BEGIN
  SELECT * INTO v_booking FROM public.resource_bookings WHERE id = p_booking_id;
  IF v_booking.id IS NULL OR v_booking.booked_by_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied', 'message', 'Brak dostępu do tej rezerwacji');
  END IF;
  IF v_booking.status <> 'confirmed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'booking_not_confirmed', 'message', 'Check-in jest możliwy tylko dla potwierdzonej rezerwacji');
  END IF;
  IF v_booking.starts_at > now() + interval '15 minutes' THEN
    RETURN jsonb_build_object('success', false, 'error', 'too_early', 'message', 'Check-in można zrobić najwcześniej 15 minut przed początkiem');
  END IF;

  UPDATE public.resource_bookings
  SET status = 'in_progress', checked_in_at = now()
  WHERE id = p_booking_id;

  RETURN jsonb_build_object('success', true, 'message', 'Check-in zapisany');
END;
$$;

CREATE OR REPLACE FUNCTION public.check_out_booking(
  p_booking_id uuid,
  p_check_out_photo_url text DEFAULT NULL,
  p_check_out_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.resource_bookings%ROWTYPE;
  v_resource public.shared_resources%ROWTYPE;
BEGIN
  SELECT * INTO v_booking FROM public.resource_bookings WHERE id = p_booking_id;
  IF v_booking.id IS NULL OR v_booking.booked_by_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied', 'message', 'Brak dostępu do tej rezerwacji');
  END IF;
  IF v_booking.status <> 'in_progress' THEN
    RETURN jsonb_build_object('success', false, 'error', 'booking_not_in_progress', 'message', 'Najpierw zrób check-in');
  END IF;

  SELECT * INTO v_resource FROM public.shared_resources WHERE id = v_booking.resource_id;
  IF COALESCE(v_resource.requires_check_out_photo, false) AND NULLIF(btrim(COALESCE(p_check_out_photo_url, '')), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'photo_required', 'message', 'Ten zasób wymaga zdjęcia przy check-out');
  END IF;

  UPDATE public.resource_bookings
  SET
    status = 'completed',
    checked_out_at = now(),
    check_out_photo_url = NULLIF(btrim(COALESCE(p_check_out_photo_url, '')), ''),
    check_out_notes = NULLIF(left(btrim(COALESCE(p_check_out_notes, '')), 1000), '')
  WHERE id = p_booking_id;

  RETURN jsonb_build_object('success', true, 'message', 'Check-out zapisany');
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_bookings(
  p_status public.booking_status DEFAULT NULL,
  p_include_past boolean DEFAULT false
)
RETURNS TABLE (
  booking jsonb,
  resource jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(rb.*), to_jsonb(sr.*)
  FROM public.resource_bookings rb
  JOIN public.shared_resources sr ON sr.id = rb.resource_id
  WHERE rb.booked_by_user_id = auth.uid()
    AND (p_status IS NULL OR rb.status = p_status)
    AND (p_include_past OR rb.ends_at >= now())
  ORDER BY rb.starts_at;
$$;

CREATE OR REPLACE FUNCTION public.generate_access_code(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.resource_bookings%ROWTYPE;
  v_resource public.shared_resources%ROWTYPE;
  v_code text;
BEGIN
  SELECT * INTO v_booking FROM public.resource_bookings WHERE id = p_booking_id;
  IF v_booking.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'booking_not_found', 'message', 'Nie znaleziono rezerwacji');
  END IF;
  IF v_booking.booked_by_user_id <> auth.uid() AND NOT public.is_org_management(v_booking.org_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied', 'message', 'Brak uprawnień do kodu');
  END IF;
  IF v_booking.status NOT IN ('confirmed', 'in_progress') THEN
    RETURN jsonb_build_object('success', false, 'error', 'booking_not_confirmed', 'message', 'Kod jest dostępny po potwierdzeniu rezerwacji');
  END IF;

  SELECT * INTO v_resource FROM public.shared_resources WHERE id = v_booking.resource_id;
  IF NOT COALESCE(v_resource.access_code_enabled, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_code_not_enabled', 'message', 'Ten zasób nie ma kodu dostępu');
  END IF;

  IF v_resource.static_access_code IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'access_code', v_resource.static_access_code,
      'code_type', v_resource.access_code_type,
      'is_temporary', false,
      'valid_from', v_booking.starts_at,
      'valid_until', v_booking.ends_at
    );
  END IF;

  v_code := lpad((floor(random() * 10000))::int::text, 4, '0');
  UPDATE public.resource_bookings
  SET
    temporary_access_code = v_code,
    access_code_valid_from = v_booking.starts_at - interval '30 minutes',
    access_code_valid_until = v_booking.ends_at
  WHERE id = p_booking_id;

  RETURN jsonb_build_object(
    'success', true,
    'access_code', v_code,
    'code_type', v_resource.access_code_type,
    'is_temporary', true,
    'valid_from', v_booking.starts_at - interval '30 minutes',
    'valid_until', v_booking.ends_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_private_resource(
  p_unit_id uuid,
  p_name text,
  p_description text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_billing_unit public.billing_unit_type DEFAULT 'hourly',
  p_max_advance_booking_days integer DEFAULT 14,
  p_requires_owner_approval boolean DEFAULT true,
  p_price_per_hour numeric DEFAULT 0,
  p_price_per_day numeric DEFAULT 0,
  p_is_free boolean DEFAULT true,
  p_images jsonb DEFAULT '[]'::jsonb,
  p_rules jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit public.community_units%ROWTYPE;
  v_resource_id uuid;
BEGIN
  IF auth.uid() IS NULL OR p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Nazwa i zalogowany mieszkaniec są wymagane';
  END IF;

  SELECT * INTO v_unit FROM public.community_units WHERE id = p_unit_id;
  IF v_unit.id IS NULL OR NOT public.has_unit_access_for_booking(p_unit_id) THEN
    RAISE EXCEPTION 'Brak dostępu do tego lokalu';
  END IF;

  IF NOT COALESCE(p_is_free, true) THEN
    IF p_billing_unit = 'hourly' AND COALESCE(p_price_per_hour, 0) <= 0 THEN
      RAISE EXCEPTION 'Płatny zasób godzinowy wymaga ceny';
    END IF;
    IF p_billing_unit = 'daily' AND COALESCE(p_price_per_day, 0) <= 0 THEN
      RAISE EXCEPTION 'Płatny zasób dobowy wymaga ceny';
    END IF;
  END IF;

  INSERT INTO public.shared_resources (
    org_id,
    community_id,
    location_id,
    resource_type,
    owner_unit_id,
    owner_user_id,
    name,
    description,
    category,
    status,
    billing_unit,
    max_advance_booking_days,
    requires_owner_approval,
    price_per_hour,
    price_per_day,
    is_free,
    images,
    rules,
    created_by
  ) VALUES (
    v_unit.org_id,
    v_unit.community_id,
    v_unit.location_id,
    'private_peer',
    p_unit_id,
    auth.uid(),
    btrim(p_name),
    NULLIF(btrim(COALESCE(p_description, '')), ''),
    NULLIF(btrim(COALESCE(p_category, '')), ''),
    'active',
    p_billing_unit,
    COALESCE(p_max_advance_booking_days, 14),
    COALESCE(p_requires_owner_approval, true),
    COALESCE(p_price_per_hour, 0),
    COALESCE(p_price_per_day, 0),
    COALESCE(p_is_free, true),
    COALESCE(p_images, '[]'::jsonb),
    COALESCE(p_rules, '{}'::jsonb),
    auth.uid()
  )
  RETURNING id INTO v_resource_id;

  RETURN v_resource_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_resource_slot(
  p_resource_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed boolean;
  v_conflicts jsonb;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.shared_resources sr
    WHERE sr.id = p_resource_id
      AND (
        public.is_org_management(sr.org_id)
        OR sr.owner_user_id = auth.uid()
        OR sr.community_id IN (SELECT public.resident_community_ids())
      )
  ) INTO v_allowed;

  IF NOT COALESCE(v_allowed, false) THEN
    RETURN jsonb_build_object('available', false, 'reason', 'access_denied');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('startsAt', b.starts_at, 'endsAt', b.ends_at)), '[]'::jsonb)
  INTO v_conflicts
  FROM public.resource_bookings b
  WHERE b.resource_id = p_resource_id
    AND b.status IN ('pending', 'confirmed', 'in_progress')
    AND b.starts_at < p_ends_at
    AND b.ends_at > p_starts_at;

  RETURN jsonb_build_object(
    'available', jsonb_array_length(v_conflicts) = 0,
    'conflictingBookings', v_conflicts
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_community_pending_bookings(p_community_id uuid)
RETURNS TABLE (
  id uuid,
  resource_name text,
  unit_number text,
  starts_at timestamptz,
  ends_at timestamptz,
  calculated_price numeric,
  booking_notes text,
  status public.booking_status
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT c.org_id INTO v_org_id FROM public.communities c WHERE c.id = p_community_id;
  IF v_org_id IS NULL OR NOT public.is_org_management(v_org_id) THEN
    RAISE EXCEPTION 'Brak uprawnień do rezerwacji tej wspólnoty';
  END IF;

  RETURN QUERY
  SELECT
    rb.id,
    sr.name,
    cu.unit_number,
    rb.starts_at,
    rb.ends_at,
    rb.calculated_price,
    rb.booking_notes,
    rb.status
  FROM public.resource_bookings rb
  JOIN public.shared_resources sr ON sr.id = rb.resource_id
  LEFT JOIN public.community_units cu ON cu.id = rb.booked_by_unit_id
  WHERE sr.community_id = p_community_id
    AND rb.status = 'pending'
  ORDER BY rb.starts_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_resource_usage_report(
  p_resource_id uuid,
  p_year integer,
  p_month integer
)
RETURNS TABLE (
  unit_id uuid,
  unit_number text,
  total_bookings integer,
  total_hours numeric,
  total_cost numeric,
  limit_bookings integer,
  limit_hours numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT sr.org_id INTO v_org_id FROM public.shared_resources sr WHERE sr.id = p_resource_id;
  IF v_org_id IS NULL OR NOT public.is_org_management(v_org_id) THEN
    RAISE EXCEPTION 'Brak uprawnień do raportu tego zasobu';
  END IF;

  RETURN QUERY
  SELECT
    s.unit_id,
    cu.unit_number,
    s.total_bookings,
    s.total_hours,
    s.total_cost,
    sr.max_bookings_per_unit_monthly,
    sr.max_hours_per_unit_monthly::numeric
  FROM public.resource_usage_stats s
  JOIN public.shared_resources sr ON sr.id = s.resource_id
  LEFT JOIN public.community_units cu ON cu.id = s.unit_id
  WHERE s.resource_id = p_resource_id
    AND s.year = p_year
    AND s.month = p_month
  ORDER BY cu.unit_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_available_resources(
  p_resource_type public.resource_type DEFAULT NULL,
  p_category text DEFAULT NULL
)
RETURNS SETOF public.shared_resources
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sr.*
  FROM public.shared_resources sr
  WHERE (p_resource_type IS NULL OR sr.resource_type = p_resource_type)
    AND (p_category IS NULL OR sr.category = p_category)
    AND (
      public.is_org_management(sr.org_id)
      OR (
        sr.status = 'active'
        AND (
          sr.owner_user_id = auth.uid()
          OR sr.community_id IN (SELECT public.resident_community_ids())
        )
        AND sr.resource_type IN ('community_managed', 'private_peer')
      )
    )
  ORDER BY sr.created_at DESC;
$$;

ALTER TABLE public.resource_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_booking_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_availability_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_usage_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY resource_bookings_select_own
  ON public.resource_bookings
  FOR SELECT
  TO authenticated
  USING (booked_by_user_id = (SELECT auth.uid()));

CREATE POLICY resource_bookings_select_management
  ON public.resource_bookings
  FOR SELECT
  TO authenticated
  USING (public.is_org_management(org_id));

CREATE POLICY resource_booking_events_select
  ON public.resource_booking_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.resource_bookings rb
      WHERE rb.id = booking_id
        AND (
          rb.booked_by_user_id = (SELECT auth.uid())
          OR public.is_org_management(rb.org_id)
        )
    )
  );

CREATE POLICY resource_availability_select
  ON public.resource_availability_rules
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.shared_resources sr
      WHERE sr.id = resource_id
        AND (
          public.is_org_management(sr.org_id)
          OR sr.community_id IN (SELECT public.resident_community_ids())
        )
    )
  );

CREATE POLICY resource_usage_stats_select_own
  ON public.resource_usage_stats
  FOR SELECT
  TO authenticated
  USING (
    public.is_org_management(org_id)
    OR public.has_unit_access_for_booking(unit_id)
  );

DROP POLICY IF EXISTS shared_resources_select_resident ON public.shared_resources;

CREATE POLICY shared_resources_select_resident
  ON public.shared_resources
  FOR SELECT
  TO authenticated
  USING (
    status = 'active'
    AND (
      owner_user_id = (SELECT auth.uid())
      OR community_id IN (SELECT public.resident_community_ids())
    )
  );

REVOKE ALL ON TABLE public.resource_bookings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.resource_booking_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.resource_availability_rules FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.resource_usage_stats FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.resource_bookings TO authenticated;
GRANT SELECT ON TABLE public.resource_booking_events TO authenticated;
GRANT SELECT ON TABLE public.resource_availability_rules TO authenticated;
GRANT SELECT ON TABLE public.resource_usage_stats TO authenticated;

REVOKE ALL ON FUNCTION public.resident_community_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_unit_access_for_booking(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_booking_overlap(uuid, timestamptz, timestamptz, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_unit_booking_limits(uuid, uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_booking_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_resource_usage_stats() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.get_my_booking_unit(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_booking(uuid, uuid, timestamptz, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_booking(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_booking(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_booking(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_in_booking(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_out_booking(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_bookings(public.booking_status, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_access_code(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_private_resource(uuid, text, text, text, public.billing_unit_type, integer, boolean, numeric, numeric, boolean, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_resource_slot(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_community_pending_bookings(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_resource_usage_report(uuid, integer, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.resident_community_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_unit_access_for_booking(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_booking_unit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking(uuid, uuid, timestamptz, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_booking(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_booking(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_booking(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_in_booking(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_out_booking(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_bookings(public.booking_status, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_access_code(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_private_resource(uuid, text, text, text, public.billing_unit_type, integer, boolean, numeric, numeric, boolean, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_resource_slot(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_community_pending_bookings(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_resource_usage_report(uuid, integer, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
