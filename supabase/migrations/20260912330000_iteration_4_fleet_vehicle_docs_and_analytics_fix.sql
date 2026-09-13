-- =====================================================================
-- ITERACJA 4 - naprawa dwoch bledow w aplikacji floty
--   A) bucket vehicle-docs nie istnial - uploady dokumentow pojazdow
--      zwracaly "Bucket not found"
--   B) get_fleet_analytics liczyl bledne koszty (iloczyn kartezjanski)
--      oraz bledne spalanie (dzielenie przez licznik, nie przez dystans)
-- =====================================================================

-- ---------------------------------------------------------------------
-- A1. Bucket vehicle-docs. PRYWATNY, bo polisy ubezpieczeniowe
--     i dowody rejestracyjne zawieraja dane osobowe i VIN.
--     W buckecie nie ma zadnych plikow (funkcja nigdy nie dzialala),
--     wiec nie ma kosztu migracji danych - wzorzec od razu poprawny,
--     jak w equipment-protocols.
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'vehicle-docs',
  'vehicle-docs',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'application/octet-stream'
  ]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------------------------------------------------------------------
-- A2. Helper dostepu. Konwencja sciezki: {vehicleId}/{typ}_{ts}_{nazwa}
--     Odczyt: dowolny aktywny czlonek organizacji pojazdu lub kierowca
--             przypisany do pojazdu (DriverDashboard pokazuje dokumenty).
--     Zapis:  wylacznie kadra zarzadzajaca - zgodnie z polityka
--             vehicles_write_management na tabeli vehicles.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_access_vehicle_doc(object_name text, need_write boolean)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_folder text;
  v_vehicle_id uuid;
  v_org_id uuid;
  v_driver_id uuid;
BEGIN
  v_folder := (storage.foldername(object_name))[1];

  IF v_folder IS NULL OR v_folder !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    RETURN false;
  END IF;

  v_vehicle_id := v_folder::uuid;

  SELECT v.org_id, v.assigned_driver_id
    INTO v_org_id, v_driver_id
  FROM public.vehicles v
  WHERE v.id = v_vehicle_id;

  IF v_org_id IS NULL THEN
    RETURN false;
  END IF;

  IF need_write THEN
    RETURN EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.org_id = v_org_id
        AND m.user_id = (SELECT auth.uid())
        AND COALESCE(m.is_active, true) = true
        AND lower(COALESCE(m.role, '')) IN ('owner', 'admin', 'coordinator', 'manager')
    );
  END IF;

  RETURN v_driver_id = (SELECT auth.uid())
     OR EXISTS (
       SELECT 1 FROM public.memberships m
       WHERE m.org_id = v_org_id
         AND m.user_id = (SELECT auth.uid())
         AND COALESCE(m.is_active, true) = true
     );
END;
$fn$;

REVOKE ALL ON FUNCTION public.can_access_vehicle_doc(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_vehicle_doc(text, boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- A3. Polityki storage. Prefiks 'temp/' obsluguje formularz nowego
--     pojazdu, ktory wgrywa dokumenty przed zapisaniem rekordu -
--     zapis dla zalogowanych, odczyt tylko dla wlasciciela pliku.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "vehicle_docs_select" ON storage.objects;
CREATE POLICY "vehicle_docs_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'vehicle-docs'
    AND (
      (SELECT public.can_access_vehicle_doc(objects.name, false))
      OR ((storage.foldername(name))[1] = 'temp' AND owner = auth.uid())
    )
  );

DROP POLICY IF EXISTS "vehicle_docs_insert" ON storage.objects;
CREATE POLICY "vehicle_docs_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'vehicle-docs'
    AND (
      (SELECT public.can_access_vehicle_doc(objects.name, true))
      OR (storage.foldername(name))[1] = 'temp'
    )
  );

DROP POLICY IF EXISTS "vehicle_docs_update" ON storage.objects;
CREATE POLICY "vehicle_docs_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'vehicle-docs'
    AND (
      (SELECT public.can_access_vehicle_doc(objects.name, true))
      OR ((storage.foldername(name))[1] = 'temp' AND owner = auth.uid())
    )
  )
  WITH CHECK (
    bucket_id = 'vehicle-docs'
    AND (
      (SELECT public.can_access_vehicle_doc(objects.name, true))
      OR ((storage.foldername(name))[1] = 'temp' AND owner = auth.uid())
    )
  );

DROP POLICY IF EXISTS "vehicle_docs_delete" ON storage.objects;
CREATE POLICY "vehicle_docs_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'vehicle-docs'
    AND (
      (SELECT public.can_access_vehicle_doc(objects.name, true))
      OR ((storage.foldername(name))[1] = 'temp' AND owner = auth.uid())
    )
  );

-- ---------------------------------------------------------------------
-- B. get_fleet_analytics - dwa bledy w jednym zapytaniu.
--
--    1) LEFT JOIN fuel_logs ORAZ repair_logs w jednym zapytaniu z
--       GROUP BY tworzyl iloczyn kartezjanski: pojazd z 5 tankowaniami
--       i 4 naprawami dawal 20 wierszy, wiec SUM(fl.cost) liczyl kazde
--       tankowanie 4 razy, a SUM(rl.cost) kazda naprawe 5 razy.
--       Oba koszty byly zawyzone.
--
--    2) AVG(liters / current_mileage) * 100 dzielilo litry przez stan
--       licznika (np. 150000 km), a nie przez dystans przejechany
--       miedzy tankowaniami. Dla 50 l przy liczniku 150000 dawalo
--       0,03 l/100km zamiast realnej wartosci.
--
--    Nowa formula: (suma litrow bez pierwszego tankowania) / (dystans
--    miedzy najnizszym i najwyzszym stanem licznika) * 100.
--    Pierwsze tankowanie jest wylaczone, bo napelnia bak na starcie
--    pomiaru. Wymaga min. 2 wpisow, inaczej zwraca 0.
--
--    Sygnatura i atrybuty (SECURITY INVOKER) bez zmian, wiec frontend
--    nie wymaga modyfikacji.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_fleet_analytics(p_org_id uuid)
RETURNS TABLE (
  vehicle_id uuid,
  total_fuel_cost numeric,
  total_repair_cost numeric,
  avg_consumption numeric,
  last_mileage integer
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
BEGIN
  RETURN QUERY
  WITH koszt_paliwa AS (
    SELECT fl.vehicle_id, SUM(fl.cost) AS koszt
    FROM public.fuel_logs fl
    GROUP BY fl.vehicle_id
  ),
  koszt_napraw AS (
    SELECT rl.vehicle_id, SUM(rl.cost) AS koszt
    FROM public.repair_logs rl
    GROUP BY rl.vehicle_id
  ),
  przebieg AS (
    SELECT fl.vehicle_id,
           SUM(fl.liters) AS litry_razem,
           MIN(fl.current_mileage) AS km_min,
           MAX(fl.current_mileage) AS km_max,
           COUNT(*) AS wpisy,
           (ARRAY_AGG(fl.liters ORDER BY fl.current_mileage, fl.date, fl.created_at))[1] AS litry_pierwszego
    FROM public.fuel_logs fl
    WHERE fl.current_mileage IS NOT NULL
      AND fl.current_mileage > 0
      AND fl.liters IS NOT NULL
    GROUP BY fl.vehicle_id
  )
  SELECT v.id,
         COALESCE(kp.koszt, 0)::numeric,
         COALESCE(kn.koszt, 0)::numeric,
         CASE
           WHEN p.wpisy >= 2 AND p.km_max > p.km_min
           THEN ROUND(
                  (p.litry_razem - COALESCE(p.litry_pierwszego, 0))
                  / (p.km_max - p.km_min)::numeric * 100,
                  2
                )
           ELSE 0
         END::numeric,
         p.km_max
  FROM public.vehicles v
  LEFT JOIN koszt_paliwa kp ON kp.vehicle_id = v.id
  LEFT JOIN koszt_napraw kn ON kn.vehicle_id = v.id
  LEFT JOIN przebieg     p  ON p.vehicle_id  = v.id
  WHERE v.org_id = p_org_id;
END;
$fn$;
