-- =====================================================================
-- ITERACJA 1 — eskalacja uprawnień i izolacja tenantów
--
-- Zastosowane decyzje:
--   K7  = do is_management_role dodany wyłącznie warunek is_active,
--         lista ról bez zmian (rozdział manager/coordinator zachowany)
--   K1  = platform_role odebrany aplikacji, fleet_role chroniony triggerem
--         (BEZ revoke, bo Domio-Flota aktualizuje go z przeglądarki)
--   K8  = get_profile_by_email przestaje zwracać full_name,
--         fallback do auth.users zachowany
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. K3 — historia stawek: usunięcie polityki bez warunku tenanta.
--    Polityka sprawdzała profiles.fleet_role IN (admin, owner, manager)
--    bez żadnego powiązania z organizacją, więc administrator floty
--    jednej organizacji widział stawki pracowników innej.
--    Poprawna, org-scoped polityka staff_rate_history_select_cleaning_mgmt
--    już istnieje (migracja 20260908214710), więc odczyt dla kadry działa.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can view rate history" ON public.staff_rate_history;

-- ---------------------------------------------------------------------
-- 2. K2 — locations: usunięcie polityki FOR ALL bez warunku org_id.
--    Wave A (20260905231246) celowo usunęła z tej tabeli globalne
--    polityki odczytu, ale Locations_Master_Write_Manager przetrwała.
--    Zostają: Manager_Full_Access_Master_Locations (org-scoped, FOR ALL)
--    oraz Secure Location View (org-scoped, SELECT).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Locations_Master_Write_Manager" ON public.locations;

-- Brakujący indeks na kluczu tenanta — locations miała indeksy tylko na
-- kluczu głównym, google_place_id i legal_entity_id.
CREATE INDEX IF NOT EXISTS idx_locations_org_id ON public.locations (org_id);

-- ---------------------------------------------------------------------
-- 3. K7 — dezaktywacja członkostwa odbiera uprawnienia kierownicze.
--    Wcześniej funkcja ignorowała is_active, więc były pracownik
--    z rolą owner/admin/coordinator zachowywał pełne uprawnienia.
--    Lista ról pozostaje bez zmian — świadoma decyzja, aby nie zmieniać
--    semantyki uprawnień (is_org_management ma szerszą listę).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_management_role(target_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.org_id = target_org_id
      AND m.user_id = (SELECT auth.uid())
      AND COALESCE(m.is_active, true) = true
      AND m.role IN ('owner', 'admin', 'coordinator')
  );
$fn$;

-- ---------------------------------------------------------------------
-- 4. K1 — kolumny rolowe w profiles.
--
--    platform_role: żadne z sześciu repozytoriów go nie zapisuje
--    (wyłącznie odczyty), więc odebranie uprawnień jest bezpieczne.
--
--    fleet_role: BEZ revoke. Domio-Flota (src/pages/admin/Drivers.tsx)
--    aktualizuje go z przeglądarki razem z full_name/phone/license_no
--    w jednym UPDATE, a PostgreSQL odrzuca całe polecenie, gdy choć
--    jedna kolumna nie ma uprawnienia. Ochronę zapewnia trigger.
--
--    Uwaga: poniższe REVOKE na kolumnie nie ma efektu, dopóki role mają
--    uprawnienie UPDATE na całej tabeli (a mają, przez domyślne
--    przywileje Supabase). Pozostaje jako deklaracja intencji —
--    faktyczną ochronę realizuje trigger niżej.
-- ---------------------------------------------------------------------
REVOKE UPDATE (platform_role) ON public.profiles FROM authenticated, anon;
REVOKE INSERT (platform_role) ON public.profiles FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.tg_profiles_guard_role_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_actor uuid := (SELECT auth.uid());
BEGIN
  -- Kontekst serwerowy (service_role, edytor SQL, migracje) nie ma JWT
  -- użytkownika. RLS nie pozwala anon aktualizować profiles, więc brak
  -- auth.uid() jest tu bezpiecznym wyznacznikiem zaufanego kontekstu.
  -- Bez tego nie dałoby się nadać pierwszej roli platformy z SQL.
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.platform_role IS DISTINCT FROM OLD.platform_role THEN
    IF NOT public.is_platform_admin() THEN
      RAISE EXCEPTION 'Brak uprawnień do zmiany roli platformy'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- fleet_role decyduje o dostępie do Edge Functions create-user
  -- i delete-user, które autoryzują wyłącznie na fleet_role = admin
  -- i działają z service_role. Samopromocja kierowcy dawałaby więc
  -- możliwość tworzenia i usuwania kont.
  IF NEW.fleet_role IS DISTINCT FROM OLD.fleet_role THEN
    IF NOT (
      public.is_platform_admin()
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = v_actor AND p.fleet_role = 'admin'
      )
    ) THEN
      RAISE EXCEPTION 'Brak uprawnień do zmiany roli we flocie'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_profiles_guard_role_columns ON public.profiles;
CREATE TRIGGER trg_profiles_guard_role_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_profiles_guard_role_columns();

-- ---------------------------------------------------------------------
-- 5. K8 — get_profile_by_email przestaje ujawniać imię i nazwisko.
--
--    Globalne wyszukiwanie po e-mailu jest nieodłączne od funkcji
--    "dodaj pracownika z Huba": szukany użytkownik z definicji nie jest
--    jeszcze w organizacji wywołującego, więc zawężenie do własnej
--    organizacji zablokowałoby cały przepływ. Zamiast tego ograniczamy
--    to, co wycieka — full_name nie jest już zwracane.
--
--    Fallback do auth.users zachowany: pozwala dodać osobę, która ma
--    konto w Supabase Auth, ale nie ma jeszcze wiersza w profiles.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_profile_by_email(target_email text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $fn$
DECLARE
  result json;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND COALESCE(m.is_active, true) = true
      AND lower(COALESCE(m.role, '')) IN ('owner', 'admin', 'coordinator', 'manager')
  ) THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  SELECT json_build_object('id', p.id, 'email', p.email, 'source', 'profile')
  INTO result
  FROM public.profiles p
  WHERE LOWER(TRIM(p.email)) = LOWER(TRIM(target_email))
  LIMIT 1;

  IF result IS NULL THEN
    SELECT json_build_object('id', u.id, 'email', u.email, 'source', 'auth')
    INTO result
    FROM auth.users u
    WHERE LOWER(TRIM(u.email)) = LOWER(TRIM(target_email))
    LIMIT 1;
  END IF;

  RETURN result;
END;
$fn$;

-- ---------------------------------------------------------------------
-- 6. W10 — link_user_to_org: zakaz nadawania roli wyższej niż własna.
--
--    Świadomie BEZ whitelisty wartości target_role: w produkcji istnieje
--    rola 'technik', a Domio-Administracja używa 'assistant'
--    i 'accountant'. Lista dozwolonych nazw zablokowałaby zapraszanie
--    techników, asystentów i księgowych.
--
--    Kontrola wywołującego pozostaje bez zmian względem Wave A.
--    Dodatkowo COALESCE na cleaning_staff.full_name — bez tego
--    usunięcie full_name z get_profile_by_email degradowałoby imiona
--    do lokalnej części e-maila (Domio-Administracja/src/lib/
--    linkTeamMember.ts wylicza displayName z odpowiedzi RPC).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.link_user_to_org(
  target_user_id uuid,
  target_org_id uuid,
  target_role text,
  target_full_name text,
  target_email text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF target_role IS NULL OR btrim(target_role) = '' THEN
    RAISE EXCEPTION 'invalid_role' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND m.org_id = target_org_id
      AND COALESCE(m.is_active, true) = true
      AND lower(COALESCE(m.role, '')) IN ('owner', 'admin', 'coordinator', 'manager')
  ) THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  -- Rolę właścicielską może nadać wyłącznie owner/admin tej organizacji.
  -- Blokuje koordynatora, który omija UI i woła RPC bezpośrednio.
  IF lower(btrim(target_role)) IN ('owner', 'admin', 'administrator', 'wlasciciel') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id = auth.uid()
        AND m.org_id = target_org_id
        AND COALESCE(m.is_active, true) = true
        AND lower(COALESCE(m.role, '')) IN ('owner', 'admin')
    ) THEN
      RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Profil tylko dla realnie istniejącego konta auth.
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = target_user_id) THEN
    RAISE EXCEPTION 'unknown_user' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.profiles (id, full_name, email, updated_at, accepted_terms_at, account_type)
  VALUES (target_user_id, target_full_name, target_email, now(), now(), 'hub')
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = COALESCE(NULLIF(public.profiles.full_name, ''), EXCLUDED.full_name),
      account_type = 'hub';

  IF NOT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE user_id = target_user_id AND org_id = target_org_id
  ) THEN
    INSERT INTO public.memberships (user_id, org_id, role)
    VALUES (target_user_id, target_org_id, target_role);
  END IF;

  INSERT INTO public.cleaning_staff (id, org_id, full_name, contact_email, status, employment_type)
  VALUES (target_user_id, target_org_id, target_full_name, target_email, 'active', 'b2b')
  ON CONFLICT (id) DO UPDATE
  SET org_id = EXCLUDED.org_id,
      contact_email = EXCLUDED.contact_email,
      full_name = COALESCE(NULLIF(public.cleaning_staff.full_name, ''), EXCLUDED.full_name);
END;
$fn$;
