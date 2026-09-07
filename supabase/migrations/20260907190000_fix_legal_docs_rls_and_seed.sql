-- ========================================================================
-- Fix legal_documents RLS for anon role + seed missing documents
-- ========================================================================
-- 
-- Context: Wave B/C migration revoked EXECUTE on is_platform_admin() from anon.
-- Admin_all_access_documents policy tries to evaluate is_platform_admin() for all roles.
-- This causes anon SELECT to fail → signup shows red error.
--
-- Fix: Restrict Admin policy TO authenticated only; keep Public_read for anon+authenticated.
-- Seed: Add missing terms+marketing (privacy already exists from manual publish).
-- ========================================================================

-- A. RLS — restrict Admin policy to authenticated, so anon never calls is_platform_admin()
DROP POLICY IF EXISTS "Admin_all_access_documents" ON public.legal_documents;
CREATE POLICY "Admin_all_access_documents"
  ON public.legal_documents
  FOR ALL
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Public_read_active_documents" ON public.legal_documents;
CREATE POLICY "Public_read_active_documents"
  ON public.legal_documents
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- B. Seed missing documents (terms + marketing)
-- Insert only if document_type does not exist yet (privacy already published manually)

-- Terms (required)
INSERT INTO public.legal_documents (
  document_type,
  version,
  content,
  is_active,
  is_required,
  published_at
)
SELECT 
  'terms',
  '1.0',
  E'# Regulamin świadczenia usług drogą elektroniczną\n\nOstatnia aktualizacja: 13.01.2026 (Wersja 1.0)\n\n## 1. Postanowienia ogólne\n\nWłaścicielem serwisu DOMIO jest spółka DOMIO Sp. z o.o. z siedzibą w Polsce. Serwis działa w modelu SaaS (Software as a Service) i służy do zarządzania organizacjami, personelem oraz lokalizacjami.\n\n## 2. Rodzaje i zakres usług\n\nDOMIO świadczy usługi w zakresie udostępniania platformy DOMIO do autentykacji, zarządzania subskrypcjami aplikacji dedykowanych (np. sprzątanie, technika) oraz prowadzenia centralnego rejestru lokalizacji.\n\n## 3. Rejestracja i Bezpieczeństwo\n\nUżytkownik zobowiązany jest do podania prawdziwych danych podczas rejestracji. System odnotowuje adres IP oraz wersję zaakceptowanego regulaminu w celu audytu bezpieczeństwa.\n\n**Izolacja danych:**\nKażda organizacja posiada osobną strukturę danych, co gwarantuje poufność informacji między różnymi subskrybentami serwisu.\n\n## 4. Odpowiedzialność\n\nDOMIO Sp. z o.o. dokłada wszelkich starań w celu zapewnienia ciągłości działania serwisu i monitorowania zasobów. Firma nie odpowiada za treść danych wprowadzanych przez użytkowników końcowych.',
  true,
  true,
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.legal_documents WHERE document_type = 'terms'
);

-- Marketing (optional)
INSERT INTO public.legal_documents (
  document_type,
  version,
  content,
  is_active,
  is_required,
  published_at
)
SELECT 
  'marketing',
  '1.0',
  E'# Zgody marketingowe\n\nWersja: 1.0 (13.01.2026)\n\nWyrażam zgodę na otrzymywanie informacji handlowych i marketingowych od DOMIO Sp. z o.o. drogą elektroniczną (e-mail) oraz telefoniczną.\n\nZgoda jest dobrowolna i może zostać wycofana w dowolnym momencie poprzez kontakt z administratorem lub zmianę ustawień w profilu użytkownika.\n\nDane kontaktowe będą przetwarzane wyłącznie w celu przesyłania materiałów marketingowych dotyczących usług i produktów DOMIO.',
  true,
  false,
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.legal_documents WHERE document_type = 'marketing'
);

-- C. Verification comment (for manual test after apply)
-- Expected: SELECT as anon should return 3 active rows (terms, privacy, marketing)
-- Test: curl -H "apikey: YOUR_ANON_KEY" "https://PROJECT.supabase.co/rest/v1/legal_documents?select=id,document_type&is_active=eq.true"
