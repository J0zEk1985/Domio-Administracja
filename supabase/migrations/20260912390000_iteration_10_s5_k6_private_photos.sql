-- =====================================================================
-- ITERACJA 10 - S5 (expires_at w has_location_access) + K6 (prywatne zdjecia)
--
-- S5: has_location_access ignorowalo location_access.expires_at.
--     NIE zastepujemy jej przez has_active_location_access - tamta NIE
--     uwzglednia zadan i sekcji, a sprzataczka z aktywna zmiana musi
--     widziec magazyn. Wygasniecie dotyczy tylko wiersza location_access.
--     Na produkcji 0 wierszy z expires_at.
--
-- K6: buckety zdjec byly publiczne - /object/public/ czytal ktokolwiek
--     ze znajomym URL. Flaga public=false. SELECT tylko authenticated
--     (wczesniej czesc polityk byla PUBLIC/anon). Anon nadal wgrywa
--     QR do issue_photos/public_qr/*. Front podpisuje URL przy podgladzie;
--     w bazie zostaja dotychczasowe napisy getPublicUrl (parsowane do sciezki).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.has_location_access(target_location_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.location_access
    WHERE user_id = (SELECT auth.uid())
      AND location_id = target_location_id
      AND (expires_at IS NULL OR expires_at > now())
    UNION ALL
    SELECT 1 FROM public.cleaning_tasks
    WHERE assigned_staff_id = (SELECT auth.uid())
      AND location_id = target_location_id
    UNION ALL
    SELECT 1 FROM public.property_sections
    WHERE assigned_staff_id = (SELECT auth.uid())
      AND location_id = target_location_id
  );
$fn$;

UPDATE storage.buckets
SET public = false
WHERE id IN (
  'cleaning-photos',
  'issue_photos',
  'photos',
  'property-issues',
  'resident-order-photos'
);

DROP POLICY IF EXISTS "Zezwol_na_odczyt_zdjec_serwis" ON storage.objects;
DROP POLICY IF EXISTS issue_photos_select_authenticated ON storage.objects;
CREATE POLICY issue_photos_select_authenticated
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'issue_photos');

DROP POLICY IF EXISTS "DOMIO Cleaning 10b10vm_1" ON storage.objects;
DROP POLICY IF EXISTS property_issues_select_authenticated ON storage.objects;
CREATE POLICY property_issues_select_authenticated
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'property-issues');

DROP POLICY IF EXISTS "zadania 1kp2d3p_0" ON storage.objects;
DROP POLICY IF EXISTS cleaning_photos_select_authenticated ON storage.objects;
CREATE POLICY cleaning_photos_select_authenticated
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'cleaning-photos');
