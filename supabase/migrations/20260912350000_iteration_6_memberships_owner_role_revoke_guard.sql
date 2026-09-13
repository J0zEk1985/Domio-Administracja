-- =====================================================================
-- ITERACJA 6 - symetryczna blokada ODEBRANIA roli wlascicielskiej
--
-- Iteracja 5 blokowala nadanie (technik → wlasciciel) przez koordynatora.
-- Funkcja wracala wczesnie, gdy NOWA rola nie byla wlascicielska, wiec
-- zmiana owner → technik nadal przechodzila.
--
-- Ta migracja podmienia cialo tej samej funkcji. Trigger pozostaje
-- bez zmian (BEFORE INSERT OR UPDATE). DELETE i UPDATE is_active
-- nie sa ruszane: DELETE nie odpala tego triggera, a UPDATE bez
-- zmiany kolumny role wychodzi na poczatku.
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
  v_new_is_owner boolean := v_new_role = ANY (v_owner_class);
  v_old_is_owner boolean := TG_OP = 'UPDATE' AND v_old_role = ANY (v_owner_class);
BEGIN
  -- Kontekst serwerowy: service_role, edytor SQL, migracje. Bez zmian,
  -- dlatego blokada w create-worker jest nadal potrzebna.
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  -- UPDATE nietykajacy roli (is_active, specializations, GPS) przechodzi.
  -- DELETE nie ma BEFORE UPDATE/INSERT - dezaktywacja i usuniecie czlonka
  -- pozostaja bez zmian.
  IF TG_OP = 'UPDATE' AND v_new_role = v_old_role THEN
    RETURN NEW;
  END IF;

  -- Ani nadanie, ani odebranie roli wlascicielskiej.
  IF NOT v_new_is_owner AND NOT v_old_is_owner THEN
    RETURN NEW;
  END IF;

  IF public.is_platform_admin() THEN
    RETURN NEW;
  END IF;

  -- Dzialajacy sam ma role wlascicielska w tej organizacji -
  -- moze zarowno nadac, jak i odebrac.
  IF EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = NEW.org_id
      AND m.user_id = v_actor
      AND COALESCE(m.is_active, true) = true
      AND lower(btrim(COALESCE(m.role, ''))) = ANY (v_owner_class)
  ) THEN
    RETURN NEW;
  END IF;

  -- Bootstrap zakladania firmy: tylko NADANIE owner samemu sobie,
  -- gdy organizacja nie ma jeszcze wlasciciela. Nie dotyczy odebrania.
  IF v_new_is_owner AND NEW.user_id = v_actor AND NOT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = NEW.org_id
      AND lower(btrim(COALESCE(m.role, ''))) = ANY (v_owner_class)
      AND (TG_OP = 'INSERT' OR m.id <> NEW.id)
  ) THEN
    RETURN NEW;
  END IF;

  IF v_old_is_owner AND NOT v_new_is_owner THEN
    RAISE EXCEPTION 'Brak uprawnień do odebrania roli właścicielskiej w tej organizacji'
      USING ERRCODE = '42501';
  END IF;

  RAISE EXCEPTION 'Brak uprawnień do nadania roli właścicielskiej w tej organizacji'
    USING ERRCODE = '42501';
END;
$fn$;
