-- =====================================================================
-- ITERACJA 3 — Storage: limity rozmiaru i własność przy zapisie
--
-- Zakres ograniczony do zmian, które nie wymagają modyfikacji kodu.
--
-- CELOWO NIE ZAWARTE — prywatyzacja bucketów (public = false):
-- property_issues.photos_before / photos_after / photo_url przechowują
-- pełne adresy w formacie
--   https://<projekt>.supabase.co/storage/v1/object/public/issue_photos/...
-- Zmiana flagi public unieważniłaby wszystkie historyczne zdjęcia.
-- Wymaga oddzielnej iteracji: migracji danych (URL -> ścieżka) oraz
-- przejścia z getPublicUrl na createSignedUrl w 9 miejscach w kodzie.
-- Wzorzec docelowy już istnieje: bucket equipment-protocols jest
-- prywatny, equipment_protocols.photo_urls trzyma same ścieżki,
-- a Domio-Cleaning/src/lib/equipmentStorage.ts:91 podpisuje adresy.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Limit rozmiaru pliku dla bucketów, które go nie miały.
--
--    Klienci kompresują zdjęcia do ~1 MB (ISSUE_PHOTO_COMPRESSION
--    maxSizeMB: 1 w Domio-Serwis/src/lib/compressIssuePhoto.ts),
--    największy istniejący obiekt ma 882 KB, więc 10 MB jest limitem
--    wyłącznie przeciw nadużyciom. Bez limitu każdy zalogowany
--    użytkownik mógł wgrać plik dowolnej wielkości.
--
--    resident-order-photos i equipment-protocols miały już 10 MB.
--
--    ŚWIADOMIE BEZ allowed_mime_types: funkcja issuePhotoExtension()
--    w Domio-Serwis jawnie obsługuje przypadek 'octet-stream', co
--    oznacza, że przeglądarki zgłaszają pusty typ pliku. Whitelist
--    typów MIME mogłaby zablokować publiczne zgłoszenie przez QR
--    wysłane z telefonu (HEIC / brak typu).
-- ---------------------------------------------------------------------
UPDATE storage.buckets
SET file_size_limit = 10485760
WHERE id IN ('cleaning-photos', 'issue_photos', 'photos', 'property-issues')
  AND file_size_limit IS NULL;

-- ---------------------------------------------------------------------
-- 2. Polityka DELETE na buckecie 'photos' nie sprawdzała właściciela,
--    wbrew swojej nazwie — warunek to było wyłącznie
--    bucket_id = 'photos'. Każdy zalogowany użytkownik mógł usunąć
--    dowolny plik dowolnego innego użytkownika.
--
--    Zaostrzenie jest bezkosztowe: żadne z sześciu repozytoriów nie
--    wywołuje storage.remove(), a wszystkie istniejące obiekty mają
--    ustawioną kolumnę owner.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow users to delete own photos" ON storage.objects;
CREATE POLICY "Allow users to delete own photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'photos' AND owner = auth.uid());

-- ---------------------------------------------------------------------
-- 3. Polityki UPDATE pozwalały każdemu zalogowanemu użytkownikowi
--    nadpisać dowolne zdjęcie w bucketach dowodowych. W systemie,
--    w którym zdjęcia są załącznikiem do protokołów odbioru i napraw,
--    to możliwość manipulacji dowodami.
--
--    Uploady używają upsert: true, ale ścieżki zawierają znacznik czasu
--    (Date.now()), więc kolizja z plikiem innego użytkownika nie
--    występuje. Nadpisanie własnego pliku nadal działa.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "cleaning_photos_update_authenticated" ON storage.objects;
CREATE POLICY "cleaning_photos_update_authenticated"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'cleaning-photos' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'cleaning-photos' AND owner = auth.uid());

DROP POLICY IF EXISTS "property_issues_bucket_update_authenticated" ON storage.objects;
CREATE POLICY "property_issues_bucket_update_authenticated"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'property-issues' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'property-issues' AND owner = auth.uid());
