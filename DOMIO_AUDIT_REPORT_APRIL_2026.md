# DOMIO — raport audytu bezpieczeństwa, spójności danych, wydajności i typowania (kwiecień 2026)

**Tryb:** READ-ONLY (analiza repozytoriów bez modyfikacji kodu źródłowego).  
**Źródło prawdy (schema typów):** `Domio-Administracja/src/types/supabase.ts`.  
**Zakres repozytoria:** Domio-Administracja, Domio-Serwis, Domio-Cleaning, Domio-Panel-Logowania, Obsluga-floty-samochodow.

**Ograniczenia metodyczne:** Pełne definicje RLS w Postgresie nie są w całości obecne w sklonowanych migracjach (w repo widać fragmenty: m.in. `0000_tasks_schema.sql`, `20260401130000_companies_contracts_policies.sql`, `20260404210000_community_units_and_inspection_columns.sql`). Ocena izolacji `worker` / `anon` opiera się na kodzie aplikacji + dostępnych migracjach; polityki wdrożone wyłącznie w Supabase Dashboard pozostają poza tym audytem.

---

## 1. Bezpieczeństwo i RLS

### 1.1 Uwagi ogólne (supabase.ts vs RLS)

Plik `supabase.ts` opisuje **tabele i relacje**, nie polityki RLS. Analiza „czy worker może czytać cudze `org_id`” wymaga zgodności **polityk w bazie** z założeniami kodu. Poniżej: ryzyka widoczne z kodu i części migracji.

| Ścieżka | Problem | Poziom | Uzasadnienie |
|--------|---------|--------|--------------|
| `Domio-Administracja/supabase/migrations/20260401130000_companies_contracts_policies.sql` | Polityka `companies_select_authenticated` dla `companies`: `USING (true)` — każdy użytkownik `authenticated` może czytać cały katalog firm | **High** | W modelu B2B multi-tenant globalny odczyt katalogu bez filtrowania po `org_id` lub roli to ryzyko ujawnienia danych kontrahentów / NIP / danych kontaktowych między tenantami (naruszenie least privilege). |
| `Domio-Administracja/src/hooks/useEBoardMessages.ts` | Komentarz: publiczny kiosk wymaga odczytu `e_board_messages` jako **anon** po `community_id` | **High** (warunkowe) | Jeśli polityka RLS dla `anon` pozwala na `SELECT` dla dowolnego `community_id` (bez tokenu, bez powiązania z urządzeniem), realne jest **IDOR** (odgadnięcie UUID wspólnoty). Weryfikacja wyłącznie po stronie aplikacji jest niewystarczająca — reguły muszą być w RLS. |
| `Domio-Serwis/src/pages/PublicIssueReport.tsx` | Formularz publiczny: odczyt `cleaning_locations` po `issue_qr_token` + insert `property_issues` | **Medium** (projektowe) | Poprawny wzorzec to **tajny token w URL** + RLS dla `anon` ograniczający insert/update do walidowanego kontekstu. Ryzyko zależy od polityk (nie ma pełnej migracji `property_issues` / `cleaning_locations` w zestawie plików). |
| `Domio-Cleaning/src/components/cleaner/PropertyDetailSheet.tsx` | `console.log` wartości `qr_code_token` z bazy | **High** | Tokeny dostępu w konsoli przeglądarki ułatwają przejęcie sesji / dostępu fizycznego; dobre praktyki: brak logowania sekretów nawet w „dev”. |
| `Domio-Cleaning/src/App.tsx` | `console.log('[DIAGNOSTICS] Auth token check...')` z metadanymi o kluczach storage/cookies | **Medium** | Ujawnia strukturę przechowywania tokenów i nazwy kluczy — ułatwia atakującemu targeting (social engineering, XSS). |
| `Domio-Cleaning/src/lib/supabase.ts`, `Obsluga-floty-samochodow/src/integrations/supabase/client.ts` | Szczegółowe logi mostka sesji (nazwy kluczy cookie/localStorage, liczba tokenów) | **Medium** | To samo co wyżej — zbyt bogate logowanie diagnostyczne w produkcji. |
| `Domio-Administracja/supabase/functions/triage-issue/index.ts` | Edge Function: `console.error` z treścią błędów Gemini / fragmentami JSON | **Low–Medium** | Logi backendowe mogą zawierać treść zgłoszeń (PII). Dobre praktyki: redakcja, strukturalne logi bez pełnego body. |
| Wiele projektów: pliki `.env` / `.env.local` | Skan wykazał wartości `VITE_SUPABASE_ANON_KEY`, `VITE_GOOGLE_MAPS_API_KEY` w plikach środowiskowych w drzewie projektu | **Critical** (jeśli w repozytorium) | Klucze **nie powinny** być commitowane; `anon` jest publiczny w bundlu, ale powielanie w repo zwiększa ryzyko wycieku historii Git i mylenia środowisk. Google Maps key wymaga restrykcji HTTP referrer — wyciek w repo utrudnia rotację. **Uwaga:** nie powielaj tych wartości; usuń z historii / rotuj klucze operacyjnie. |
| `Domio-Serwis/.gitignore` | Brak jawnego wpisu `.env` (jest `*.local`) | **Medium** | Plik `.env` bez przyrostka `.local` może być trackowany przez Git — klasyczne źródło wycieków. |

### 1.2 Worker / anon a `org_id` / `community_id`

| Obserwacja | Ryzyko | Komentarz |
|------------|--------|-----------|
| `community_units` (migracja): dostęp przez `memberships` dla `auth.uid()` — **bez rozróżnienia roli** w samej polityce | **Low** (izolacja org) | Użytkownik z aktywnym członkostwem w `org_id` widzi wiersze dla tej organizacji — **nie** przekracza innych `org_id`. Rola `worker` nie jest tu wyłączona; jeśli biznesowo worker nie powinien widzieć rejestru lokali, potrzebna osobna polityka lub widok. |
| `property_tasks` (`0000_tasks_schema.sql`): dostęp tylko dla `authenticated`, funkcja `property_task_user_has_access` (owner lub `location_access` administracja) | **N/A dla anon** | Anon nie ma polityk w tym pliku — zgodnie z migracją anon nie powinien czytać zadań. |
| E-board display (`useEBoardMessages.ts`): zapytanie po `community_id` bez dodatkowego filtra po stronie klienta | **Zależy od RLS** | Jeśli `anon` może czytać po znanym UUID — patrz IDOR wyżej. |

---

## 2. Spójność danych i logika biznesowa

| Ścieżka | Problem | Poziom | Uzasadnienie |
|---------|---------|--------|--------------|
| `Domio-Administracja/src/hooks/useCreateIssue.ts` | `community_id` z formularza jest **usuwane** przed insertem (`_communityId` ignorowane) | **Medium** | Relacja issue → wspólnota jest pośrednia (`location_id` → `cleaning_locations`). Jeśli w bazie brakuje triggera CHECK spójności `location.community_id` z oczekiwaniami triage, możliwa jest niespójność semantyczna (raport „dla wspólnoty” bez twardego powiązania w wierszu). |
| `Domio-Serwis/src/types/database.ts` vs `Domio-Administracja/src/types/supabase.ts` | `IssuePriority` zawiera m.in. `"standard"` i `"krytyczny"`, podczas gdy `issue_priority_enum` w `supabase.ts` to `"low" \| "medium" \| "high" \| "critical"` | **High** | Rozjazd typów frontowych i enumu DB prowadzi do błędów runtime, błędnych raportów i filtrów (single source of truth powinien być generowany typ DB). |
| `Domio-Serwis/src/pages/PublicIssueReport.tsx` | Insert: `priority: "standard"` | **High** | W kanonicznym `supabase.ts` **nie ma** wartości `"standard"` w `issue_priority_enum`. Albo typy są nieaktualne, albo insert jest niezgodny z enumem Postgres — w obu przypadkach to **niespójność krytyczna** wymagająca weryfikacji względem faktycznego schematu produkcyjnego. |
| `Domio-Cleaning/src/integrations/supabase/types.ts` | Osobna kopia typów Supabase obok kanonicznego `Administracja` | **Medium** | Ryzyko driftu schematu między aplikacjami (inna wersja tabel/enums) — łamie zasadę jednego źródła prawdy. |
| `Domio-Cleaning` — liczne wywołania `supabase.from(...)` w `PropertyDetailsPage.tsx`, `SectionDetailSheet.tsx` itd. | „Sieroty” względem wspólnych hooków React Query | **Low** | Utrudnia centralną invalidację cache, powtarzalne filtry `org_id` i testowanie — ryzyko niespójnego stanu UI po mutacjach. |
| `Domio-Serwis/src/components/DashboardTicketCard.tsx` i inne | Aktualizacje `property_issues` filtrowane często tylko `.eq("id", id)` | **Low** (przy poprawnym RLS) | Poprawne **o ile** RLS wymusza dostęp do wierszy tylko w obrębie organizacji; w przeciwnym razie aplikacja polega wyłącznie na sekrecie UUID (słaba obrona). |

---

## 3. Wydajność i wąskie gardła

### 3.1 N+1 i brak eager loadingu

| Ścieżka | Problem | Poziom | Uzasadnienie |
|---------|---------|--------|--------------|
| `Obsluga-floty-samochodow/src/hooks/useFleetAnalytics.ts` | `useAllVehiclesConsumption`: `Promise.all(vehicles.map(async ... supabase.rpc('calculate_avg_consumption') ))` | **High** | Klasyczne **N+1 RPC**: jedno zapytanie listy pojazdów + N wywołań RPC — skalowanie liniowe z liczbą pojazdów; obciążenie sieci i bazy. Preferowane: jedna funkcja SQL agregująca po zestawie `vehicle_id` lub batch. |
| `Domio-Administracja/src/hooks/useProperties.ts` | W ścieżce awaryjnej `useAssignLocationsToCommunity`: `Promise.all(locationIds.map(async id => update...))` | **Medium** | Przy dużej liczbie ID wiele round-tripów; akceptowalne jako fallback, ale szczytowe obciążenie przy błędzie bulk. |
| `Domio-Serwis/src/components/RepairReportSheet.tsx`, `ManagerNewTicketView.tsx` | `files.map(async ...)` uploadów | **Low–Medium** | Równoległe uploady mogą przeciążyć pamięć i sieć na urządzeniach mobilnych; często lepszy jest limit współbieżności lub kolejka. |
| `Domio-Serwis/src/hooks/usePropertyIssuesData.ts` | Lista usterek: bogaty `select` z zagnieżdżonymi `cleaning_locations` i `communities` | **Positive** | Prawidłowy kierunek (jedno zapytanie z relacjami zamiast pętli). |

### 3.2 Listy / tabele bez wirtualizacji

| Ścieżka | Problem | Poziom | Uzasadnienie |
|---------|---------|--------|--------------|
| Cały ekosystem (skan zależności) | Brak użycia bibliotek typu `@tanstack/react-virtual`, `react-window` w kodzie źródłowym | **Medium** | Duże listy (np. `PropertyDetailsPage.tsx` w Cleaning — tysiące linii, wiele sekcji list) renderują wiele węzłów DOM — na słabszych telefonach możliwe **FPS drops** i zużycie pamięci. |
| `Obsluga-floty-samochodow/src/hooks/useFleetAnalytics.ts` | Agregacja `fuel_logs` / `repair_logs` przez pobranie **wszystkich** wierszy `select('cost')` | **Medium** | Przy dużej historii pełny scan po stronie klienta — powinna być agregacja SQL (`sum`) + paginacja / zakres dat. |

### 3.3 TanStack Query — invalidacja

| Ścieżka | Problem | Poziom | Uzasadnienie |
|---------|---------|--------|--------------|
| `Domio-Serwis/src/components/DashboardTicketCard.tsx` | Mutacje wywołują `invalidate()` z `getPropertyIssuesListQueryKey(currentOrgId)` | **Positive** | Spójny klucz z `usePropertyIssuesData.ts`. |
| `Domio-Serwis/src/pages/ManagerDashboard.tsx` | `invalidateQueries({ queryKey: ["property-issues"] })` | **Low** | Prefiks invaliduje poddrzewo kluczy — zwykle poprawne w TanStack Query v5; należy upewnić się, że żadna inna funkcja nie używa tego samego prefiksu w niepowiązanym kontekście. |
| Mutacje rozproszone w komponentach Serwisu (`ManagerBillingTab`, `ManagerInboxTab`, …) | Każda musi pamiętać o invalidacji | **Medium** (utrzymanie) | Ryzykowny wzorzec — łatwo o regresję „stare dane po akcji” przy zmianach w jednym pliku. |

---

## 4. Ścisłe typowanie

| Ścieżka | Problem | Poziom | Uzasadnienie |
|---------|---------|--------|--------------|
| `Domio-Administracja/src/types/supabase.ts` (`policy_scope_enum`) | W typie wygenerowanym występuje **uszkodzona sekwencja znaków** (`maj─ůtkowe` zamiast spójnego ASCII jak w CHECK / Zod) | **Medium** | Typ nie jest bezpiecznie kompatybilny z `policySchema.ts` (`majatkowe` itd.) — kompilator nie wyłapie błędów semantycznych; ryzyko błędów przy `switch` / porównaniach. |
| `Domio-Administracja/src/schemas/policySchema.ts` vs migracja SQL | Zod używa kluczy ASCII (`majatkowe`, …); enum w `supabase.ts` jest **nieczytelny** | **Medium** | Wskazuje na problem generowania typów (kodowanie) lub rozjazd z produkcją — należy zsynchronizować pipeline `supabase gen types`. |
| `Domio-Cleaning` (wiele plików, m.in. `PropertyDetailsPage.tsx`, `SectionDetailSheet.tsx`, `WorkerDetailsPage.tsx`) | Częste `(x as any)` przy polach z bazy (`checklist`, `coordinator_notes`, `profiles`) | **Medium** | Obejście systemu typów — regresje przy zmianie schematu nie wykryją się statycznie. |
| `Domio-Serwis` | Brak `as any` w skanowaniu w obrębie `src` (względem typowego wzorca) | **Positive** | Relatywnie czystszy moduł pod kątem tego antywzorca (nie wyklucza innych obejść typów). |

---

## Podsumowanie priorytetów

1. **Critical / natychmiastowe:** sekrety w plikach środowiskowych w repozytorium; rotacja kluczy; `.gitignore` i higiena Git.  
2. **High:** spójność `issue_priority` / `PublicIssueReport` z enumem DB; potencjalne IDOR na E-board dla `anon`; logowanie tokenów QR.  
3. **Medium:** globalny SELECT na `companies`; N+1 w Flocie; brak wirtualizacji dużych list; duplikacja `supabase/types` w Cleaning; drift typów `database.ts` vs `supabase.ts`.  
4. **Low:** logi diagnostyczne SSO; szerokie prefiksy `invalidateQueries`.

---

*Raport wygenerowany automatycznie na podstawie statycznej analizy kodu (kwiecień 2026). Nie zastępuje testów penetracyjnych ani audytu konfiguracji Supabase w środowisku produkcyjnym.*
