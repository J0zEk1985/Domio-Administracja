# Panel Administratora - Gospodarka Odpadami

## ✅ Zaimplementowane Funkcje

### Lokalizacja w Aplikacji
**Domio-Administracja → Wspólnoty → [Wybierz wspólnotę] → Zakładka "Gospodarka odpadami"**

### Funkcjonalności Panelu

#### 1. **Zarządzanie Harmonogramem**
- ✅ Lista wszystkich terminów odbioru odpadów
- ✅ Wyświetlanie z kolorami per typ odpadu (żółty, niebieski, zielony, brązowy, czarny, pomarańczowy)
- ✅ Informacje: data, godziny, źródło danych, notatki
- ✅ Akcje: Edycja i usuwanie terminów

#### 2. **Dodawanie Terminów Ręcznie**
Przycisk **"Dodaj termin"** otwiera dialog z formularzem:
- Wybór typu odpadu (dropdown)
- Data odbioru (input date)
- Godziny odbioru: od - do (opcjonalne)
- Notatki dla mieszkańców (opcjonalne)

#### 3. **Synchronizacja z Miastem**
Przycisk **"Synchronizuj z miastem"** otwiera dialog:
- Wybór miasta (obecnie: Łódź)
- Wpisanie adresu: ulica + numer budynku
- Automatyczne pobranie harmonogramu z UML Łódź
- ⚠️ **Uwaga:** Obecnie używa mockowych danych (wymaga implementacji scrapera)

#### 4. **Edycja Terminów**
- Zmiana godzin odbioru
- Edycja notatek
- Zachowanie wszystkich innych danych

#### 5. **Historia Synchronizacji**
Karta na dole wyświetla:
- Ostatnie 5 synchronizacji z miastem
- Status (sukces/błąd)
- Liczba dodanych rekordów
- Komunikaty błędów (jeśli były)

---

## 📁 Utworzone Pliki (Panel Administratora)

### Skopiowane z Domio-Home:
- ✅ `src/types/wasteManagement.ts` - Typy TypeScript
- ✅ `src/lib/wasteConstants.ts` - Konfiguracje kolorów/ikon
- ✅ `src/lib/wasteManagementApi.ts` - Funkcje API Supabase
- ✅ `src/lib/adapters/LodzWasteAdapter.ts` - Adapter Łodzi
- ✅ `src/hooks/useWasteManagement.ts` - React Query hooks

### Nowe dla Administracji:
- ✅ `src/components/communities/CommunityWasteTab.tsx` - **Główny komponent panelu**
- ✅ `src/pages/CommunityDetails.tsx` - Dodano zakładkę "Gospodarka odpadami"

---

## 🎨 UI Panelu Administratora

### Główna Karta
```
┌─────────────────────────────────────────────────┐
│ Harmonogram Odbioru Odpadów                     │
│ [+ Dodaj termin] [↻ Synchronizuj z miastem]     │
├─────────────────────────────────────────────────┤
│ Data         │ Typ    │ Godziny │ Źródło │ Akcje│
│ 15 lis 2026  │ Gabary │ 06-14   │ Łódź   │ ✎ 🗑 │
│ 20 lis 2026  │ Żółty  │ 07-15   │ Ręcz.  │ ✎ 🗑 │
└─────────────────────────────────────────────────┘
```

### Dialog Dodawania
```
┌────────────────────────────────┐
│ Dodaj termin odbioru           │
├────────────────────────────────┤
│ Typ odpadu: [Gabaryty       ▾] │
│ Data odbioru: [2026-11-15]     │
│ Godzina od: [06:00]            │
│ Godzina do: [14:00]            │
│ Notatki: [                   ] │
│          [                   ] │
├────────────────────────────────┤
│ [Anuluj]        [Dodaj termin] │
└────────────────────────────────┘
```

### Dialog Synchronizacji
```
┌────────────────────────────────────┐
│ Synchronizacja z harmonogramem     │
│ miasta                             │
├────────────────────────────────────┤
│ ⚠️ Obecnie adapter Łodzi używa     │
│ mockowych danych                   │
│                                    │
│ Miasto: [Łódź                   ▾] │
│ Ulica: [Piotrkowska             ] │
│ Numer: [104                     ] │
├────────────────────────────────────┤
│ [Anuluj]        [Synchronizuj]     │
└────────────────────────────────────┘
```

---

## 🚀 Jak Używać (Administrator)

### 1. Przejdź do Panelu
```
Domio-Administracja
└─ Wspólnoty
   └─ [Wybierz wspólnotę z listy]
      └─ Zakładka "Gospodarka odpadami" (nowa, na końcu listy)
```

### 2. Dodaj Termin Ręcznie
1. Kliknij **"+ Dodaj termin"**
2. Wybierz typ odpadu
3. Ustaw datę i godziny
4. (Opcjonalnie) Dodaj notatki
5. Kliknij **"Dodaj termin"**

### 3. Synchronizuj z Miastem
1. Kliknij **"↻ Synchronizuj z miastem"**
2. Wpisz adres budynku
3. Kliknij **"Synchronizuj"**
4. System pobierze harmonogram i doda terminy

### 4. Edytuj Termin
1. Kliknij ikonę **✎** przy terminie
2. Zmień godziny lub notatki
3. Kliknij **"Zapisz zmiany"**

### 5. Usuń Termin
1. Kliknij ikonę **🗑** przy terminie
2. Potwierdź usunięcie

---

## 🔗 Integracja z Mieszkańcami

Harmonogram utworzony przez administratora jest **automatycznie widoczny** dla mieszkańców w aplikacji **Domio Home**:

```
Domio Home (Mieszkańcy)
└─ Dashboard
   └─ Karta "Gospodarka odpadami"
      └─ Zakładka "Harmonogram odbioru"
         └─ Lista terminów (readonly)
```

---

## ⚠️ Ważne Informacje

### Mockowe Dane Łodzi
**Adapter Łodzi** generuje obecnie **mockowe harmonogramy**. Do produkcji wymaga:
- Implementacji web scrapera strony UML Łódź
- Supabase Edge Function (Deno + Cheerio)
- Lub integracji z API miasta (jeśli udostępnią)

### Struktura Danych
- Każdy budynek we wspólnocie = osobny harmonogram
- Panel pokazuje harmonogram pierwszego budynku (reprezentuje wspólnotę)
- RLS: Administrator widzi tylko harmonogramy w swojej organizacji

### Źródła Danych
- **`manual`** - Dodane ręcznie przez administratora
- **`city_scraper`** - Zsynchronizowane z miasta (mockowe/scraper)

---

## 🧪 Testowanie

### 1. Sprawdź Build
```bash
cd d:\projekty\Domio-Administracja
npm run dev
```

### 2. W Przeglądarce
1. Zaloguj się jako administrator
2. Wybierz wspólnotę z listą (musi mieć przypisany budynek)
3. Przejdź do zakładki **"Gospodarka odpadami"**
4. Dodaj przykładowy termin
5. Sprawdź czy pojawia się w tabeli
6. Przejdź do Domio Home jako mieszkaniec tej wspólnoty
7. Sprawdź czy termin jest widoczny

---

## 📊 Status Implementacji

### ✅ Zakończone
- ✅ Panel zarządzania harmonogramem
- ✅ Dodawanie terminów ręcznie
- ✅ Edycja terminów
- ✅ Usuwanie terminów
- ✅ Dialog synchronizacji (UI)
- ✅ Historia synchronizacji
- ✅ Integracja z Domio Home (mieszkańcy widzą harmonogram)
- ✅ Build produkcyjny (sukces)

### ⏳ Do Zaimplementowania
- ⏳ Rzeczywisty scraper UML Łódź (zamienić mock)
- ⏳ Adaptery dla innych miast
- ⏳ Automatyczna synchronizacja (cron job)
- ⏳ Powiadomienia push przed wywozem
- ⏳ Eksport do kalendarza (.ics)
- ⏳ Panel zarządzania przewodnikiem "Gdzie to wyrzucić?" (obecnie globalny)

---

## 📝 Notatki Techniczne

### Używane Hooki
```typescript
useWasteSchedule(locationId)          // Lista harmonogramu
useCreateWasteSchedule()              // Dodawanie
useUpdateWasteSchedule()              // Edycja
useDeleteWasteSchedule()              // Usuwanie
useSyncWasteScheduleFromCity()        // Synchronizacja
```

### Mutations
Wszystkie operacje CRUD używają React Query mutations z:
- Automatic cache invalidation
- Toast notifications (sukces/błąd)
- Loading states
- Error handling

---

## 🎓 Porównanie: Admin vs Mieszkaniec

| Funkcja | Administrator | Mieszkaniec |
|---------|--------------|-------------|
| Wyświetlanie harmonogramu | ✅ Tak | ✅ Tak |
| Dodawanie terminów | ✅ Tak | ❌ Nie |
| Edycja terminów | ✅ Tak | ❌ Nie |
| Usuwanie terminów | ✅ Tak | ❌ Nie |
| Synchronizacja z miastem | ✅ Tak | ❌ Nie |
| Logi synchronizacji | ✅ Tak | ❌ Nie |
| Przewodnik "Gdzie to wyrzucić?" | 🔄 Przyszłość | ✅ Tak |

---

**Status:** ✅ **GOTOWE DO UŻYCIA**  
**Wersja:** 1.0  
**Data:** 2026-10-06  
**Aplikacja:** Domio-Administracja + Domio Home (zintegrowane)
