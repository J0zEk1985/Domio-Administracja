-- =====================================================================
-- ITERACJA 2 — odcięcie roli anon od funkcji SECURITY DEFINER
--
-- Stan przed: 103 z 182 własnych funkcji SECURITY DEFINER w schemacie
-- public były wykonywalne przez rolę anon, czyli przez każdego, kto zna
-- publiczny klucz anon (a ten jest w każdym zbudowanym bundle).
--
-- Lista dozwolona — zweryfikowane jako celowo publiczne przepływy:
--   insert_public_qr_issue             -> Domio-Serwis, trasa /zgloszenie
--                                         poza ServiceAccessGate (App.tsx:58,67)
--   lookup_location_by_public_qr_token -> ta sama strona, rozwiązanie
--                                         tokenu QR (PublicIssueReport.tsx:91)
--   get_published_eboard_messages      -> Domio-Administracja, kiosk
--                                         /display/:communityId poza
--                                         RequireAuth (App.tsx:52-53)
--
-- Weryfikacja braku regresji przed wykonaniem:
--   * żadna z odbieranych funkcji nie występuje w politykach RLS
--     dotyczących anon ani PUBLIC (funkcja wołana wewnątrz polityki jest
--     sprawdzana pod kątem uprawnień pytającego, więc taki przypadek
--     zamieniłby brak wyników w twardy błąd uprawnień),
--   * n8n uwierzytelnia się kluczem service_role — dowód: przepływ
--     inbound-email-ingest woła apply_vendor_email_event
--     i claim_inbound_reject_notice, dostępne wyłącznie dla service_role,
--   * Edge Function lookup-legal-entity przekazuje nagłówek Authorization,
--     więc działa jako authenticated, nie anon,
--   * checkout w Domio-Panel-Logowania jest już zabezpieczony w bazie
--     (preview_promo_code, redeem_promo_code, ensure_my_billing_organization
--     rzucają 'Wymagane logowanie' przy braku auth.uid()).
--
-- REVOKE obejmuje także PUBLIC, bo 10 funkcji miało grant właśnie przez
-- PUBLIC, a REVOKE ... FROM anon by ich nie zdjął. Uprawnienia
-- authenticated i service_role są odtwarzane w stanie sprzed migracji.
-- =====================================================================

DO $mig$
DECLARE
  r record;
  v_allow text[] := ARRAY[
    'insert_public_qr_issue',
    'lookup_location_by_public_qr_token',
    'get_published_eboard_messages'
  ];
  v_n integer := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sygnatura,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_ok,
           has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc_ok
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e'
      )
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND p.proname <> ALL (v_allow)
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sygnatura);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sygnatura);

    IF r.auth_ok THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sygnatura);
    END IF;

    IF r.svc_ok THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sygnatura);
    END IF;

    v_n := v_n + 1;
  END LOOP;

  RAISE NOTICE 'Odebrano EXECUTE roli anon na % funkcjach SECURITY DEFINER', v_n;
END $mig$;

-- ---------------------------------------------------------------------
-- K4 — link_billing_org_legal_entity_enrollment
--
-- Funkcja nie sprawdzała niczego: ani auth.uid(), ani nie rzucała
-- wyjątku. Wstawiała dowolny wpis do org_legal_entity_enrollments ze
-- statusem 'active', pozwalając przypisać dowolny podmiot prawny do
-- dowolnej organizacji.
--
-- Jest wołana wyłącznie wewnętrznie przez upsert_billing_org_legal_entity
-- (SECURITY DEFINER, sprawdza auth.uid()). Wywołanie wewnętrzne działa
-- w kontekście właściciela, więc odebranie uprawnień go nie psuje.
--
-- Migracja 20260912200107 już odbierała tę funkcję od PUBLIC, ale
-- uprawnienie wróciło przez domyślne przywileje schematu — naprawione
-- w migracji 20260912230851.
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.link_billing_org_legal_entity_enrollment(uuid, uuid) FROM authenticated;
