-- =====================================================================
-- ITERACJA 2b — przyczyna źródłowa nadmiernych uprawnień roli anon
--
-- ALTER DEFAULT PRIVILEGES w schemacie public nadawał EXECUTE roli anon
-- każdej nowo tworzonej funkcji. To dlatego REVOKE z migracji
-- 20260912200107 na link_billing_org_legal_entity_enrollment nie miał
-- trwałego efektu — uprawnienie wracało przy kolejnym CREATE OR REPLACE.
--
-- KONSEKWENCJA DLA DALSZEGO ROZWOJU:
-- każda nowa funkcja przeznaczona do użytku publicznego wymaga teraz
-- jawnego GRANT w migracji:
--
--     GRANT EXECUTE ON FUNCTION public.moja_funkcja(...) TO anon;
--
-- Bez tego wywołanie z niezalogowanej strony zwróci "permission denied
-- for function".
--
-- ZAKRES: zmieniony jest wpis należący do roli postgres. Wszystkie 219
-- funkcji aplikacyjnych w schemacie public należy do postgres, a
-- migracje i edytor SQL działają jako postgres, więc to pokrywa całą
-- realną ścieżkę rozwoju. Drugi wpis (supabase_admin) pozostaje bez
-- zmian, bo postgres nie jest członkiem tej roli — jest bezprzedmiotowy,
-- bo żadna funkcja aplikacyjna nie należy do supabase_admin.
--
-- NIE OBJĘTE tą migracją (świadomie): domyślne przywileje dla TABEL
-- i SEKWENCJI w schemacie public nadal nadają roli anon pełne prawa
-- (arwdDxtm, włącznie z TRUNCATE). Ochronę zapewnia RLS, ale postawa
-- domyślna jest odwrotna od bezpiecznej. Wymaga oddzielnej analizy,
-- bo authenticated musi zachować uprawnienia tabelowe, żeby PostgREST
-- działał.
-- =====================================================================

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- Próba warunkowa dla drugiego wpisu — jeśli połączenie nie ma
-- uprawnień do domyślnych przywilejów innej roli, migracja przechodzi
-- dalej bez błędu.
DO $mig$
BEGIN
  BEGIN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon';
    RAISE NOTICE 'supabase_admin: domyślne uprawnienia zmienione';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'supabase_admin: brak uprawnień (%), wpis pozostaje bez zmian', sqlerrm;
  END;
END $mig$;
