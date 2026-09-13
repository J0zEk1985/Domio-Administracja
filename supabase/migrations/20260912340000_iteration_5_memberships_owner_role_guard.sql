-- =====================================================================
-- ITERACJA 5 - domkniecie eskalacji uprawnien na memberships
--
-- Polityka memberships_manage_update opiera sie o is_management_role(),
-- ktora dopuszcza koordynatora. Koordynator mogl wiec zwyklym UPDATE
-- z przegladarki podniesc dowolnego czlonka do roli wlascicielskiej -
-- potwierdzone testem na zywej bazie (transakcja wycofana): zapis
-- kolumny role przez koordynatora przechodzi, wiec bez triggera nic
-- nie stalo na drodze wartosci 'wlasciciel'.
--
-- Blokada w Edge Function create-worker tego nie zamykala, bo Serwis
-- po odmowie robi fallback na drugi format i ustawia docelowa role
-- bezposrednim UPDATE z przegladarki.
--
-- Rozwiazanie analogiczne do trg_profiles_guard_role_columns
-- z iteracji 1: regula w bazie, nie tylko w kodzie aplikacji.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.tg_memberships_guard_owner_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_owner_class text[] := ARRAY['owner', 'admin', 'administrator', 'wlasciciel', 'właściciel'];
  v_new_role text := lower(btrim(COALESCE(NEW.role, '')));
  v_old_role text := CASE WHEN TG_OP = 'UPDATE' THEN lower(btrim(COALESCE(OLD.role, ''))) ELSE NULL END;
BEGIN
  -- Kontekst serwerowy: service_role, edytor SQL, migracje. Bez zmian,
  -- dlatego blokada w create-worker jest nadal potrzebna - ta funkcja
  -- dziala wlasnie na service_role i tutaj by nie zostala zatrzymana.
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  -- Interesuje nas tylko nadanie roli wlascicielskiej.
  IF NOT (v_new_role = ANY (v_owner_class)) THEN
    RETURN NEW;
  END IF;

  -- UPDATE nietykajacy roli (is_active, specializations, GPS) przechodzi.
  IF TG_OP = 'UPDATE' AND v_new_role = v_old_role THEN
    RETURN NEW;
  END IF;

  IF public.is_platform_admin() THEN
    RETURN NEW;
  END IF;

  -- Dzialajacy sam ma role wlascicielska w tej organizacji.
  IF EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = NEW.org_id
      AND m.user_id = v_actor
      AND COALESCE(m.is_active, true) = true
      AND lower(btrim(COALESCE(m.role, ''))) = ANY (v_owner_class)
  ) THEN
    RETURN NEW;
  END IF;

  -- Bootstrap zakladania firmy: ensure_my_billing_organization tworzy
  -- organizacje i nadaje owner samemu sobie. Wyjatek jest samoograniczajacy,
  -- bo dziala tylko gdy organizacja nie ma jeszcze wlasciciela.
  IF NEW.user_id = v_actor AND NOT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = NEW.org_id
      AND lower(btrim(COALESCE(m.role, ''))) = ANY (v_owner_class)
      AND (TG_OP = 'INSERT' OR m.id <> NEW.id)
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Brak uprawnień do nadania roli właścicielskiej w tej organizacji'
    USING ERRCODE = '42501';
END;
$fn$;

DROP TRIGGER IF EXISTS trg_memberships_guard_owner_role ON public.memberships;
CREATE TRIGGER trg_memberships_guard_owner_role
  BEFORE INSERT OR UPDATE ON public.memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_memberships_guard_owner_role();
