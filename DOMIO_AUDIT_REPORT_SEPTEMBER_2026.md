# DOMIO — audyt bezpieczeństwa, izolacji RLS, sesji i generowania zadań (wrzesień 2026)

**Tryb:** READ-ONLY. Zero zmian w kodzie, migracjach i konfiguracji produkcji.  
**Data:** 6 września 2026.  
**Źródło prawdy (baza):** projekt Supabase `Domio` (`bmozhsbcwpufovwnmjeb`, `eu-west-1`, Postgres 17).  
**Zakres aplikacji:** Panel Logowania, Cleaning, Serwis, Administracja, Flota (`Obsluga-floty-samochodow`), Home.  
**Punkt odniesienia:** [DOMIO_AUDIT_REPORT_APRIL_2026.md](./DOMIO_AUDIT_REPORT_APRIL_2026.md).

**Poza zakresem tej fazy:** poprawki, deploy, rotacja sekretów, testy E2E w przeglądarce.

Skala priorytetów:

| Priorytet | Znaczenie |
|-----------|-----------|
| **P0** | Wyciek danych, eskalacja uprawnień, publiczny endpoint z service role / bez auth |
| **P1** | Złamana izolacja tenantów albo martwy moduł (RLS blokuje / puste dane) |
| **P2** | Znikające dane w UI, błędy logiki biznesowej, drift kodu |
| **P3** | Higiena (logi, typy, SSO key mismatch) |

Sekrety (JWT w `cron.job`, tokeny MCP, klucze) **nie są cytowane**. Wymagają rotacji operacyjnej.

---

## Streszczenie wykonawcze

Jedna wspólna baza obsługuje sześć aplikacji. Izolacja tenantów **nie jest spójna**. Część tabel nie ma RLS albo nie ma polityk, część polityk wpuszcza każdego zalogowanego (albo `anon`) do danych wszystkich organizacji.

Najważniejsze ustalenia:

1. **`admin_contracts` — RLS wyłączone**, a `anon` i `authenticated` mają pełne GRANT-y (w tym `TRUNCATE`). To otwarty wyciek umów.
2. **RPC `link_user_to_org` i `get_profile_by_email`** są `SECURITY DEFINER`, bez sprawdzenia wołającego, z `EXECUTE` dla `anon`. Można dopisać dowolnego użytkownika do dowolnej org i enumerować e-maile z `auth.users`.
3. Widoki floty **`v_upcoming_deadlines`** i **`v_active_notifications`** nie mają `security_invoker` i są czytelne dla `anon` — omijają RLS na `vehicles` / `profiles`.
4. **`generate-sop-tasks`** działa w cronie (`200` o 00:05 UTC 5.09.2026), ale: `verify_jwt: false`, weekday off-by-one (`Mycie szyb` / „Śr” wpada we wtorek), zadania kwartalne nie powstają jako `long_term` w oknie, lokalny kod jest inny niż v13 i padnie na nieistniejącej kolumnie `task_name`.
5. **10 tabel z RLS włączonym i 0 politykami** — klient Data API dostaje puste zbiory. To tłumaczy „znikające” pojazdy, oferty, tablicę ogłoszeń i subskrypcje niezależnie od focusa karty.
6. Znikające dane po minimalizacji karty to **wyścig sesji / React Query**, nie utrata wierszy w Postgresie. Najgorzej: Cleaning, potem Administracja i Home.

---

## 1. Filar RLS i izolacja tenantów

### 1.1 Macierz tabel `public`

| Tabela | RLS | Polityki | Ocena |
|--------|-----|----------|--------|
| `admin_contracts` | **OFF** | 0 | **P0 wyciek** — pełne GRANT-y dla `anon`/`authenticated` |
| `spatial_ref_sys` | OFF | 0 | P3 (PostGIS); GRANT-y do zapisu dla `anon` niepotrzebne |
| `vehicles` | ON | 0 | **P1** pusta Flota + wyciek przez widoki (1.3) |
| `vendor_partners` | ON | 0 | **P1** martwi partnerzy / delegacje |
| `partner_offers` | ON | 0 | **P1** puste oferty w Home |
| `resident_configs` | ON | 0 | **P1** pusta konfiguracja rezydenta |
| `org_subscriptions` | ON | 0 | **P1** Panel nie widzi subskrypcji przez RLS |
| `community_board` | ON | 0 | **P1** pusta tablica w Home |
| `internal_tasks` | ON | 0 | **P1** puste zadania Administracji |
| `material_requests` | ON | 0 | **P1** |
| `inspections` | ON | 0 | **P1** |
| `inspections_hybrid` | ON | 0 | **P1** |
| `cleaning_locations` | ON | 1 (tylko SELECT) | **P1** brak INSERT/UPDATE; brak polityki `anon` + `issue_qr_token` |
| `memberships` | ON | 1 (tylko SELECT) | P2 — brak zapisu przez klienta (invite tylko RPC) |
| `profiles` | ON | 2 (own select/update) | OK dla własnego profilu; brak odczytu współpracowników |
| `locations` | ON | 6 | **P0/P1** dwie polityki „czytaj wszystko” |
| `e_board_messages` | ON | 2 | **P1** anon widzi wszystkie opublikowane |
| `property_issues` | ON | 7 | P1 — brak INSERT dla `anon` (QR Serwis) |
| `cleaning_tasks` | ON | 2 | P2 — `ALL` dla każdego członka org |
| `property_sections` | ON | 1 | P2 — SELECT przez całą `cleaning_locations` (zależne od RLS lokacji) |
| `task_step_logs` | ON | 3 | P2 — `logs_final` ALL po widocznych `cleaning_tasks` |
| `companies` | ON | 1 | **Naprawione vs kwiecień** — filtr `org_id` + membership |
| pozostałe tabele z politykami org | ON | 1–4 | Izolacja org w większości trzyma się `memberships` |

GRANT-y na tabelach bez polityk: `anon` i `authenticated` mają SELECT/INSERT/UPDATE/DELETE/**TRUNCATE**. Przy RLS ON i 0 politykach Postgres **odmawia wierszy** (puste listy). Przy RLS OFF (`admin_contracts`) GRANT-y są realnym dostępem.

### 1.2 Znaleziska P0 / P1 — polityki i GRANT-y

**P0 — `admin_contracts` bez RLS**  
Dowód: `relrowsecurity = false`, 0 polityk, GRANT-y CRUD+TRUNCATE dla `anon`.  
Wpływ: każdy z kluczem `anon` czyta i kasuje umowy (wartość, daty, vendor).  
Rekomendacja: włączyć RLS + polityki po `org_id` / membership; odebrać `anon` i `TRUNCATE`.

**P0 — `locations`: odczyt wszystkich adresów**  
Polityki `Locations_Master_Read_All` i `Read_All_Locations_Authenticated`: `USING (auth.role() = 'authenticated')`.  
Wpływ: każdy zalogowany (sprzątacz, mieszkaniec, kierowca) widzi adresy, GPS i `google_place_id` wszystkich tenantów.  
Rekomendacja: usunąć obie polityki; zostawić `Secure Location View` / org membership.

**P1 — `e_board_messages` dla `anon`**  
`Publiczna widoczność aktywnych ogłoszeń`: `status = published` AND (`valid_until` null lub przyszły) — **bez `community_id`**.  
Kiosk w [useEBoardMessages.ts](src/hooks/useEBoardMessages.ts) filtruje po `community_id` tylko w kliencie. RLS tego nie wymusza → IDOR (odgadnięcie UUID albo prosty `select *`).  
Rekomendacja: `USING` z tokenem kiosku albo twarde powiązanie z znanym urządzeniem; nie polegać na filtrze frontu.

**P1 — brak polityk = puste moduły**  
`vehicles`, `vendor_partners`, `partner_offers`, `resident_configs`, `org_subscriptions`, `community_board`, `internal_tasks`, `material_requests`, `inspections`, `inspections_hybrid`.  
Wpływ: aplikacja wygląda na „znikające dane”, choć wiersze są w bazie. Flota + Home + część Administracji i Panelu.  
Rekomendacja: polityki org (`memberships.org_id`) + dla mieszkańców `location_access`; osobno SELECT/INSERT/UPDATE/DELETE.

**P1 — `cleaning_locations` tylko SELECT**  
`locations_final`: manager (`is_manager_safe` + `get_my_org_id_safe`) albo lokalizacje z zadań pracownika.  
Brak INSERT/UPDATE/DELETE. Brak polityki `anon` po `issue_qr_token`.  
Wpływ: zapis budynku z UI pada po cichu; [PublicIssueReport.tsx](../Domio-Serwis/src/pages/PublicIssueReport.tsx) nie wczyta budynku (zapytanie jako `anon`).  
Rekomendacja: polityki zapisu dla ról management; SELECT `anon` wyłącznie `issue_qr_token = request` (lub RPC).

**P1 — `property_issues` bez INSERT dla `anon`**  
Są polityki management / cleaner / resident / vendor. Publiczny QR insert (`priority: "medium"` — enum jest poprawny) nie ma polityki. Upload do `issue_photos` jest możliwy (storage), insert zgłoszenia nie.

**P2 — `cleaning_tasks` `ALL` dla całej org**  
Worker z membership może zmieniać cudze zadania w tej samej org.  
Rekomendacja: SELECT szerzej, UPDATE/DELETE tylko `assigned_staff_id = auth.uid()` albo rola management.

**P2 — `get_my_org_id_safe()` = `LIMIT 1` bez `is_active`**  
Wielu membership → losowa org. Polityki oparte o tę funkcję (`cleaning_locations`, `memberships`) zawężają źle konto wielo-org.

**P2 — `staff_rate_history`**  
SELECT po `profiles.fleet_role IN (admin, owner, manager)` — bez `org_id`. Admin floty org A widzi historię stawek org B (jeśli wiersze istnieją).

### 1.3 Widoki

| Widok | `security_invoker` | GRANT `anon` | Ryzyko |
|-------|--------------------|--------------|--------|
| `cleaner_recent_activity` | tak | pełne | Niskie — filtr `user_id = auth.uid()` |
| `user_app_access` | tak | pełne | Puste, bo `org_subscriptions` ma 0 polityk |
| `v_upcoming_deadlines` | **nie** | SELECT | **P0** — omija RLS `vehicles` |
| `v_active_notifications` | **nie** | SELECT | **P0** — pojazdy + e-mail kierowcy z `profiles` |

Rekomendacja: `WITH (security_invoker = true)` + odebrać `anon`; dodać polityki na `vehicles`.

### 1.4 Funkcje `SECURITY DEFINER` w `public`

Wszystkie poniżej mają `EXECUTE` dla **`anon` i `authenticated`**.

| Funkcja | Auth wewnątrz | Ocena |
|---------|---------------|--------|
| `link_user_to_org(user, org, role, name, email)` | **brak** | **P0** — dopisuje `profiles`, `memberships`, `cleaning_staff` |
| `get_profile_by_email(email)` | **brak** | **P0** — enumeracja `profiles` + `auth.users` |
| `get_ckob_api_key(org_id)` | service_role JWT **lub** membership admin/manager | P2 — zwraca `api_key_encrypted`; `anon` dostanie exception |
| `complete_task` | `assigned_staff_id = auth.uid()` | OK |
| `get_my_org_id_safe` | `auth.uid()` | P2 — `LIMIT 1` |
| `is_platform_admin` | `profiles.platform_role` (nie `user_metadata`) | OK wzorzec |
| `start_task_with_validation`, `upsert_company_by_tax_id` | do weryfikacji przy poprawkach | P2 — `anon` EXECUTE zbędne |

Funkcje z **brakiem `search_path`**: `is_platform_admin`, `is_management_role`, `is_manager`, `is_admin_safe`, `check_org_access`, `get_user_highest_role`, `get_auth_org_ids`, `check_location_proximity`, `log_rate_changes`. To klasyczny wektor search-path (Supabase advisor).

Rekomendacja: `REVOKE EXECUTE FROM anon, public`; authz w ciele; przenieść definer do schematu nieeksponowanego w Data API.

### 1.5 Storage

Buckety **publiczne** (odczyt po URL bez sesji): `cleaning-photos`, `issue_photos`, `photos`, `property-issues`.

INSERT bez ograniczenia `bucket_id` (można wgrać do dowolnego bucketa):

- `Allow anon upload for QR issue photos` (`anon`)
- `Allow authenticated uploads`
- `DOMIO Cleaning 10b10vm_0` (`anon`+`authenticated`)
- `Zezwol_na_wgrywanie_zdjec_serwis`
- `zadania 1kp2d3p_1` (`public`)

**P1:** anon może zaśmiecać storage; pliki w publicznych bucketach są czytelne dla każdego, kto zna/zgadnie ścieżkę.  
Rekomendacja: `WITH CHECK (bucket_id = '…' AND …)`; limity MIME/rozmiaru; prywatne buckety + signed URLs dla zdjęć serwisowych.

### 1.6 Porównanie z kwietniem 2026

| Kwiecień 2026 | Wrzesień 2026 |
|---------------|----------------|
| `companies` `USING (true)` — High | **Naprawione** — `companies_org_membership_all` po `org_id` |
| E-board IDOR dla `anon` — High | **Nadal otwarte**, potwierdzone na produkcji |
| Publiczny QR + RLS nieznane | **Potwierdzone zepsute:** brak SELECT lokacji i INSERT issue dla `anon` |
| `priority: "standard"` w QR | **Naprawione w kodzie** (`medium`); enum DB: `low/medium/high/critical` |
| Typy drift Cleaning vs Administracja | **Nadal** (`task_name` w typach Cleaning, w DB jest `name`) |
| Sekrety w `.env` w drzewie | Nadal higiena Git — nie weryfikowano historii w tej fazie |
| N+1 RPC Flota | Nadal w kodzie (`useFleetAnalytics`) — P3 przy pustym `vehicles` i tak niewidoczne |

---

## 2. Filar — znikające dane po minimalizacji karty

**Werdykt:** Postgres nie gubi wierszy przy `visibilitychange`. UI gubi stan, bo refetch wraca `[]`, `orgId` pada na `null`, albo tabela dostaje puste `data` na czas `isLoading`.

Część „pustych list” (Flota, Home ogłoszenia/oferty) to **RLS z 0 politykami** — widać to też bez ukrywania karty.

### 2.1 Macierz React Query / auth

| Aplikacja | `refetchOnWindowFocus` | `visibilitychange` | Auth na focus | Ryzyko UI |
|-----------|------------------------|--------------------|---------------|-----------|
| Cleaning | `false` | tak — invalidacja listy + refresh sekcji | RoleContext czyści org przy `TOKEN_REFRESHED` bez sesji | **Najwyższe** |
| Administracja | **default `true`** | nie | brak mostka SSO | Wysokie (tabele → `[]`) |
| Home | **default `true`** | nie | prosty `setSession` | Wysokie (pełnoekranowy loader) |
| Serwis | `false` | nie | `OrgContext.fetchOrg()` na `TOKEN_REFRESHED` | Średnie |
| Flota | `false` | nie | cichy focus | Niskie UI; puste `vehicles` przez RLS |
| Panel | brak RQ | `getSession()` | sync sesji | Niskie (auth gate) |

### 2.2 Cleaning — P2 (główny trop „znikania”)

1. [CleanerDashboard.tsx](../Domio-Cleaning/src/components/cleaner/CleanerDashboard.tsx) po powrocie na kartę (lista pusta **albo** tło > 5 min) woła `invalidateQueries`.  
2. [fetchCleanerDashboardProperties.ts](../Domio-Cleaning/src/lib/fetchCleanerDashboardProperties.ts) przy `locations == null` (sesja jeszcze śpi) **zwraca `[]`** i nadpisuje cache. `keepPreviousData` nie broni przed sukcesem z pustą tablicą.  
3. [RoleContext.tsx](../Domio-Cleaning/src/contexts/RoleContext.tsx) linie 279–292: `TOKEN_REFRESHED` bez `session` czyści `currentOrgId` i localStorage roli. Query z `enabled: !!orgId` gasną.  
4. [SectionDetailSheet.tsx](../Domio-Cleaning/src/components/cleaner/SectionDetailSheet.tsx): `refetchOnMount: 'always'`, **brak** `keepPreviousData`; przy `normalizedTaskIds.length === 0` czyści lokalną listę zadań; drugi handler `visibilitychange` wymusza `refreshDataFromDatabase`.

Reprodukcja (faza poprawek): DevTools offline/throttling → ukryj kartę <5 min (lista już pusta vs niepusta) → ukryj >5 min → wróć w trakcie odświeżania JWT.

### 2.3 Administracja — P2

[App.tsx](src/App.tsx): `staleTime: 60s`, brak `refetchOnWindowFocus: false`. Wiele hooków `refetchOnMount: "always"`.  
[ContractsDataTable.tsx](src/components/contracts/ContractsDataTable.tsx) linia 59: `data: isLoading ? [] : filteredByType` — przy focus refetch tabela miga pustką. Ten sam wzorzec w InspectionsDataTable.

### 2.4 Home — P2

[App.tsx](../Domio-Home/src/App.tsx): `new QueryClient()` bez opcji.  
`ResidentContext` / `DashboardView` / `NeighborsView` / `ServicesView` zamieniają widok na loader przy `isLoading`. Focus refetch = chwilowe „zniknięcie”. Dodatkowo `community_board` / `partner_offers` i tak są puste przez RLS.

### 2.5 Serwis — P2

[OrgContext.tsx](../Domio-Serwis/src/contexts/OrgContext.tsx): na `TOKEN_REFRESHED` zawsze `fetchOrg()`. Błąd `getUser()` / `memberships` ustawia `currentOrgId = null` → dashboard bez org.  
`App.tsx` przy `isLoading && session` pokazuje pełny spinner.

### 2.6 Flota / Panel — P3 UI

Oba mają „cichy focus”. Flota: puste pojazdy to RLS, nie tab hide. Panel: `visibilitychange` → `getSession()`; obsługuje `AbortError` przy uśpieniu karty.

Brak service workerów i handlerów `pageshow`/`pagehide` we wszystkich repo.

---

## 3. Filar — Edge Function `generate-sop-tasks`

### 3.1 Stan produkcji

| Fakt | Wartość |
|------|---------|
| Deploy | v13, `ACTIVE`, **`verify_jwt: false`** |
| Cron | `generate-sop-tasks-nightly`, `5 0 * * *`, `net.http_post` + Authorization Bearer (sekret w `cron.job`) |
| Ostatni run | 2026-09-05 00:05:04 UTC — HTTP **200**, boot 29 ms, shutdown ~75 s później |
| Org / szablony | 1 org, 7 aktywnych checklist z `frequency_config` |
| Zadania SOP | 64 przyszłe `sop_standard`; **0** `long_term`; ostatni insert 2026-09-05 00:05:04 UTC |

Funkcja **działa i tworzy zadania**. Problem użytkownika to raczej: zła semantyka (dni tygodnia, kwartał), publiczny endpoint, drift lokalny vs produkcja — nie „cron nie chodzi”.

### 3.2 Znaleziska

**P0 — `verify_jwt: false` + sekret w cronie**  
Każdy, kto zna URL projektu, może odpalić generator (service role wewnątrz funkcji). Cron trzyma long-lived JWT w plaintext w `cron.job`.  
Ta sama klasa: deployed `create-worker` też ma `verify_jwt: false`.  
Rekomendacja: włączyć JWT (albo shared cron secret); przenieść token do Vault; **zrotować** service role.

**P1 — weekday off-by-one (potwierdzone danymi)**  
Szablon „Mycie szyb”, etykieta `Śr`, `frequency_config.days = [2]`.  
JS `Date.getDay()`: `2` = **wtorek**. 8.09.2026 (wtorek) ma zadanie „Mycie szyb”; środa nie.  
Rekomendacja: jedna konwencja (JS `getDay` vs UI Pon=0) + test jednostkowy dla każdego `type`.

**P1 — kwartał / `long_term` praktycznie nie powstaje**  
„Mycie okien” `type: quarterly`, baseline `2026-02-02`. Warunek: ta sama doba miesiąca i `monthsDiff % 3 === 0` (luty→maj→sierpień→listopad). W oknie 3–14.09 nie ma insertu — zgodne z kodem.  
`checkTaskExists` w deployed v13 filtruje `task_type = 'sop_standard'`. Gdy kwartał wpadnie, `getFrequencyDays > 28` wstawia `long_term`, a kolejna noc **nie znajdzie** duplikatu i może dublować.  
Deployed przy błędzie check/insert zwiększa `errors` i idzie dalej; lokalnie **rzuca** i przerywa całą org.

**P1 — drift local vs v13**  
Lokalny [index.ts](../Domio-Cleaning/supabase/functions/generate-sop-tasks/index.ts) robi:

```ts
.select("id, org_id, location_id, section_id, task_name, name, ...")
```

W produkcji `property_checklists` ma kolumnę **`name`**, nie `task_name`. Deploy lokalnej wersji skończy się błędem kolumny.  
v13: `select *`, pętle per lokalizacja, połykanie części błędów.

**P2 — typy Cleaning vs DB**  
`integrations/supabase/types.ts` nadal opisuje `task_name`. UI i generator mieszają `name` / `task_name`.

**P2 — timeout przy skali**  
1 org / 7 szablonów / ~7 dni mieści się w ~75 s wall time. Przy wielu org × lokalizacjach sekwencyjne SELECT+INSERT + `verify_jwt: false` to ryzyko timeout i nadużycia.

**P3 — `shouldTaskOccurOnDate` mutuje `targetDate.setHours(0)`**  
Wywołania produkcyjne przekazują kopię (`new Date(currentDate)`), więc dziś nie psuje dat; to krucha umowa.

Repozytoria mają też `create-user`, `delete-user`, `triage-ai-logic` — **nie są wdrożone** (w projekcie widać tylko `create-worker` i `generate-sop-tasks`).

---

## 4. Przegląd modułów

Wspólny model: SPA React + Vite + bezpośredni klient Supabase (brak API-first mimo `.cursorrules` Cleaning). Izolacja = RLS + czasem `.eq('org_id')`.

### 4.1 Panel Logowania (hub SSO)

- Cookie `domio-auth-token`, domena `.domio.com.pl`.  
- `create-worker`: `verify_jwt: false`, loguje hedery i body — **P0/P1**.  
- `org_subscriptions` bez polityk — launcher oparty o RLS widok `user_app_access` jest pusty; obecny dashboard idzie raczej po tabelach.  
- Verbose `[SSO DEBUG]` w `supabase.ts` / `DashboardPage` — P3.  
- Brak TanStack Query — niski ryzyko tab-hide poza spinnerem auth.

### 4.2 Cleaning

- SSO consumer, `RoleContext` + inline auth w `App.tsx`.  
- `tenant-resolver.ts` czyta `organizations.database_url`, ale aplikacja i tak używa jednego klienta — osobna baza per subscriber **nie jest podłączona**.  
- Największy dług UI (sekcja 2.2) + SOP (sekcja 3).  
- `console.log` QR / diagnostyka w `PropertyDetailSheet` — P2 (kwiecień: High, nadal obecne).

### 4.3 Serwis

- SSO + mostek sesji, `OrgContext` na `TOKEN_REFRESHED`.  
- Publiczne `/zgloszenie` **zablokowane przez RLS** (sekcja 1.2). Priority QR jest zgodny z enumem.  
- Realtime tylko INSERT na `property_issues` — nie czyści list.

### 4.4 Administracja

- Brak Universal Session Bridge; cookie `domio-auth-token`.  
- `getOrgAndActor()` + `.eq('org_id')` — dobra obrona w głębi, ale puste tabele bez polityk (`internal_tasks`, `inspections*`).  
- E-board kiosk / board portal zależą od słabego RLS.  
- CKOB: `get_ckob_api_key` + brak SELECT credentials dla klienta (tylko fałszywy check `jwt.role = service_role`).  
- `triage-ai-logic` w repo, nie na produkcji.

### 4.5 Flota

- **`storageKey` niezgodny z resztą ekosystemu:** `sb-bmozhsbcupufovwnmjeb-auth-token` (w komentarzu ref bez `w`; prawdziwy ref to `bmozhsbcwpufovwnmjeb`). Hub zapisuje `domio-auth-token`. Mostek skanuje `*-auth-token`, więc SSO zwykle działa, ale Flota może zapisać drugi klucz.  
- `vehicles` bez polityk → pusta lista; widoki deadline **wyciekają** dane.  
- Edge `create-user` / `delete-user` nie wdrożone.  
- N+1 `calculate_avg_consumption` — P3.

### 4.6 Home

- SSO + `ResidentContext`.  
- `community_board`, `partner_offers`, `resident_configs` bez polityk → puste karty.  
- Default React Query focus refetch.

### 4.7 Cross-cutting

| Temat | Stan |
|-------|------|
| `service_role` we frontendzie | Nie znaleziono |
| SSO storageKey | 5 aplikacji `domio-auth-token`; Flota inny klucz |
| Typy kanoniczne | Administracja `src/types/supabase.ts`; Cleaning/Flota własne, nieaktualne |
| Osobna DB per tenant | Kolumny `tenant_id` / `database_url` istnieją; frontend nie przełącza klienta |

---

## 5. Kolejka poprawek do akceptacji

Nic z tej listy nie zostało wdrożone. Zaznacz, od których P0/P1 zaczynamy.

### Fala A — natychmiast (P0)

1. Włączyć RLS + polityki org na `admin_contracts`; odebrać `anon` i `TRUNCATE`.  
2. Zablokować `link_user_to_org` i `get_profile_by_email` (`REVOKE` + authz albo usunąć z API).  
3. `security_invoker` na `v_upcoming_deadlines` / `v_active_notifications`; odebrać `anon`.  
4. `verify_jwt: true` (lub sekret crona) na `generate-sop-tasks` i `create-worker`; **rotacja** JWT zapisanego w `cron.job`.  
5. Usunąć globalny SELECT z `locations`.

### Fala B — izolacja i martwe moduły (P1)

6. Polityki org na: `vehicles`, `vendor_partners`, `partner_offers`, `resident_configs`, `org_subscriptions`, `community_board`, `internal_tasks`, `material_requests`, `inspections`, `inspections_hybrid`.  
7. Dopisać INSERT/UPDATE `cleaning_locations` dla management + SELECT `anon` po `issue_qr_token`.  
8. INSERT `anon` na `property_issues` ograniczony tokenem QR.  
9. Zwęzić `e_board_messages` dla `anon`.  
10. Storage: `WITH CHECK (bucket_id = …)` na wszystkich INSERT.  
11. SOP: poprawka `days[]` vs `getDay()`; idempotencja także dla `long_term`; zsynchronizować local z v13 **bez** kolumny `task_name`; nie deployować obecnego local.

### Fala C — UI karty i higiena (P2/P3)

12. Cleaning: nie zapisywać `[]` przy półżywej sesji; nie czyścić org na `TOKEN_REFRESHED` bez twardego `SIGNED_OUT`; `keepPreviousData` w `SectionDetailSheet`.  
13. Administracja + Home: `refetchOnWindowFocus: false` albo `placeholderData`; nie podawać `[]` gdy `isLoading`.  
14. Serwis: `OrgContext` nie nulluje org przy błędzie odświeżenia tokena.  
15. Flota: `storageKey: 'domio-auth-token'`.  
16. `REVOKE EXECUTE` zbędnych RPC od `anon`; ustawić `search_path` na definerach.  
17. Wyłączyć `[SSO DEBUG]` / logowanie QR w produkcji.  
18. Jeden pipeline `supabase gen types` (kanon: Administracja).

---

## 6. Checklist reprodukcji (faza poprawek, nie ta)

- [ ] Dwa konta z różnych org: REST `GET /rest/v1/admin_contracts` i `GET /rest/v1/locations` na `anon` / user A.  
- [ ] `POST /rest/v1/rpc/get_profile_by_email` i `link_user_to_org` jako `anon`.  
- [ ] `GET /rest/v1/v_upcoming_deadlines` jako `anon`.  
- [ ] QR `/zgloszenie?token=…` bez sesji.  
- [ ] Cleaning: ukryj kartę <5 min i >5 min, z throttlingiem.  
- [ ] Porównać „Mycie szyb” w kalendarzu z etykietą Śr.  
- [ ] Ręczny `POST /functions/v1/generate-sop-tasks` bez JWT (oczekiwane: 401 po poprawce).

---

*Raport z audytu read-only produkcji Supabase + statycznej analizy sześciu repozytoriów. Nie zastępuje testu penetracyjnego po wdrożeniu poprawek.*
