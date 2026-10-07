-- Panel wspólnoty woła public.create_community_resource przy dodawaniu zasobu.
-- Tabela shared_resources już istnieje; brakowało samego RPC, stąd 404 PostgREST.

BEGIN;

CREATE OR REPLACE FUNCTION public.create_community_resource(
  p_community_id uuid,
  p_location_id uuid,
  p_name text,
  p_description text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_billing_unit public.billing_unit_type DEFAULT 'hourly',
  p_min_booking_duration integer DEFAULT NULL,
  p_max_booking_duration integer DEFAULT NULL,
  p_max_advance_booking_days integer DEFAULT 30,
  p_max_bookings_per_unit_monthly integer DEFAULT NULL,
  p_max_hours_per_unit_monthly integer DEFAULT NULL,
  p_requires_manager_approval boolean DEFAULT false,
  p_requires_check_in boolean DEFAULT false,
  p_requires_check_out boolean DEFAULT false,
  p_requires_check_out_photo boolean DEFAULT false,
  p_requires_deposit boolean DEFAULT false,
  p_deposit_amount numeric DEFAULT NULL,
  p_price_per_hour numeric DEFAULT 0,
  p_price_per_day numeric DEFAULT 0,
  p_is_free boolean DEFAULT true,
  p_access_code_enabled boolean DEFAULT false,
  p_access_code_type public.access_code_type DEFAULT NULL,
  p_static_access_code text DEFAULT NULL,
  p_images jsonb DEFAULT '[]'::jsonb,
  p_rules jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_resource_id uuid;
BEGIN
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Nazwa zasobu jest wymagana';
  END IF;

  IF p_community_id IS NOT NULL THEN
    SELECT org_id INTO v_org_id
    FROM public.communities
    WHERE id = p_community_id;
  ELSIF p_location_id IS NOT NULL THEN
    SELECT org_id INTO v_org_id
    FROM public.cleaning_locations
    WHERE id = p_location_id;
  ELSE
    RAISE EXCEPTION 'Musisz podać wspólnotę albo lokalizację';
  END IF;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono organizacji dla podanej wspólnoty albo lokalizacji';
  END IF;

  IF NOT public.is_org_management(v_org_id) THEN
    RAISE EXCEPTION 'Brak uprawnień do tworzenia zasobów wspólnych';
  END IF;

  IF p_location_id IS NOT NULL AND p_community_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.cleaning_locations
      WHERE id = p_location_id
        AND community_id = p_community_id
    ) THEN
      RAISE EXCEPTION 'Lokalizacja nie należy do tej wspólnoty';
    END IF;
  END IF;

  IF p_requires_deposit AND (p_deposit_amount IS NULL OR p_deposit_amount <= 0) THEN
    RAISE EXCEPTION 'Kaucja wymaga kwoty większej od zera';
  END IF;

  IF NOT p_is_free THEN
    IF p_billing_unit = 'hourly' AND (p_price_per_hour IS NULL OR p_price_per_hour <= 0) THEN
      RAISE EXCEPTION 'Płatny zasób rozliczany godzinowo wymaga ceny za godzinę';
    END IF;
    IF p_billing_unit = 'daily' AND (p_price_per_day IS NULL OR p_price_per_day <= 0) THEN
      RAISE EXCEPTION 'Płatny zasób rozliczany dobowo wymaga ceny za dobę';
    END IF;
  END IF;

  INSERT INTO public.shared_resources (
    org_id,
    community_id,
    location_id,
    resource_type,
    name,
    description,
    category,
    status,
    billing_unit,
    min_booking_duration,
    max_booking_duration,
    max_advance_booking_days,
    max_bookings_per_unit_monthly,
    max_hours_per_unit_monthly,
    requires_manager_approval,
    requires_check_in,
    requires_check_out,
    requires_check_out_photo,
    requires_deposit,
    deposit_amount,
    price_per_hour,
    price_per_day,
    is_free,
    access_code_enabled,
    access_code_type,
    static_access_code,
    images,
    rules,
    created_by
  ) VALUES (
    v_org_id,
    p_community_id,
    p_location_id,
    'community_managed',
    btrim(p_name),
    NULLIF(btrim(COALESCE(p_description, '')), ''),
    NULLIF(btrim(COALESCE(p_category, '')), ''),
    'active',
    p_billing_unit,
    p_min_booking_duration,
    p_max_booking_duration,
    p_max_advance_booking_days,
    p_max_bookings_per_unit_monthly,
    p_max_hours_per_unit_monthly,
    COALESCE(p_requires_manager_approval, false),
    COALESCE(p_requires_check_in, false),
    COALESCE(p_requires_check_out, false),
    COALESCE(p_requires_check_out_photo, false),
    COALESCE(p_requires_deposit, false),
    p_deposit_amount,
    COALESCE(p_price_per_hour, 0),
    COALESCE(p_price_per_day, 0),
    COALESCE(p_is_free, true),
    COALESCE(p_access_code_enabled, false),
    p_access_code_type,
    NULLIF(btrim(COALESCE(p_static_access_code, '')), ''),
    COALESCE(p_images, '[]'::jsonb),
    COALESCE(p_rules, '{}'::jsonb),
    auth.uid()
  )
  RETURNING id INTO v_resource_id;

  RETURN v_resource_id;
END;
$$;

COMMENT ON FUNCTION public.create_community_resource(
  uuid, uuid, text, text, text, public.billing_unit_type,
  integer, integer, integer, integer, integer,
  boolean, boolean, boolean, boolean, boolean, numeric,
  numeric, numeric, boolean, boolean, public.access_code_type,
  text, jsonb, jsonb
) IS 'Tworzy zasób wspólnoty do rezerwacji. Wymaga uprawnień zarządczych organizacji.';

REVOKE ALL ON FUNCTION public.create_community_resource(
  uuid, uuid, text, text, text, public.billing_unit_type,
  integer, integer, integer, integer, integer,
  boolean, boolean, boolean, boolean, boolean, numeric,
  numeric, numeric, boolean, boolean, public.access_code_type,
  text, jsonb, jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_community_resource(
  uuid, uuid, text, text, text, public.billing_unit_type,
  integer, integer, integer, integer, integer,
  boolean, boolean, boolean, boolean, boolean, numeric,
  numeric, numeric, boolean, boolean, public.access_code_type,
  text, jsonb, jsonb
) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
