/**
 * DOMIO Home - Łódź Waste Adapter
 * Adapter do pobierania harmonogramu odbioru odpadów z UML Łódź
 * 
 * Źródło: https://uml.lodz.pl/dla-mieszkancow/ochrona-srodowiska/czyste-miasto/gospodarka-odpadami/harmonogramy-odbioru-odpadow/
 */

import type { ICityWasteAdapter, CityAdapterResponse, WasteType } from "@/types/wasteManagement";

/**
 * Adapter dla miasta Łódź
 * 
 * UWAGA: To jest mockowa implementacja. Prawdziwa implementacja wymaga:
 * 1. Web scraping strony UML Łódź (np. Cheerio/JSDOM w Edge Function)
 * 2. Lub reverse engineering ich API (jeśli istnieje)
 * 3. Lub ręczne parsowanie PDF-ów z harmonogramami
 * 
 * Obecnie zwraca mockowe dane dla celów demonstracyjnych.
 */
export class LodzWasteAdapter implements ICityWasteAdapter {
  readonly cityName = "Łódź";
  readonly adapterKey = "lodz";

  private readonly baseUrl = "https://uml.lodz.pl/dla-mieszkancow/ochrona-srodowiska/czyste-miasto/gospodarka-odpadami/harmonogramy-odbioru-odpadow/";

  /**
   * Pobierz harmonogram dla danego adresu
   * 
   * @param street - Nazwa ulicy (np. "Piotrkowska")
   * @param buildingNumber - Numer budynku (np. "104")
   */
  async fetchSchedule(street: string, buildingNumber: string): Promise<CityAdapterResponse> {
    try {
      console.log(`[LodzWasteAdapter] Fetching schedule for: ${street} ${buildingNumber}`);

      // TODO: Implementacja rzeczywistego scrapingu/API call
      // Obecnie zwraca mockowe dane
      const mockSchedules = this.generateMockSchedule(street, buildingNumber);

      return {
        success: true,
        schedules: mockSchedules,
        source: this.baseUrl,
      };
    } catch (error) {
      console.error("[LodzWasteAdapter] Error:", error);
      return {
        success: false,
        schedules: [],
        error: error instanceof Error ? error.message : "Nieznany błąd podczas pobierania harmonogramu",
      };
    }
  }

  /**
   * Sprawdź czy adres jest obsługiwany
   */
  isAddressSupported(street: string): boolean {
    // TODO: Walidacja na podstawie listy ulic w Łodzi
    // Obecnie akceptuje wszystkie
    return street.trim().length > 0;
  }

  /**
   * Pobierz listę obsługiwanych ulic (opcjonalne, dla autocomplete)
   */
  async getSupportedStreets(): Promise<string[]> {
    // TODO: Zwróć rzeczywistą listę ulic z UML Łódź
    return [
      "Piotrkowska",
      "Nawrot",
      "Kilińskiego",
      "Łąkowa",
      "Sienkiewicza",
      "Roosevelta",
      "Jaracza",
      "Wschodnia",
      "Zachodnia",
      "Północna",
      "Południowa",
    ];
  }

  /**
   * Generuj mockowe harmonogramy (do usunięcia po implementacji prawdziwego scrapera)
   */
  private generateMockSchedule(street: string, buildingNumber: string): Array<{
    wasteType: WasteType;
    collectionDate: string;
    collectionTimeFrom?: string;
    collectionTimeUntil?: string;
  }> {
    const today = new Date();
    const schedules: Array<{
      wasteType: WasteType;
      collectionDate: string;
      collectionTimeFrom?: string;
      collectionTimeUntil?: string;
    }> = [];

    // Generuj harmonogram na najbliższe 3 miesiące
    const wasteTypes: WasteType[] = ['bulk', 'plastic', 'paper', 'glass', 'bio'];
    
    // Gabaryty - raz w miesiącu (pierwsza sobota)
    for (let month = 0; month < 3; month++) {
      const date = new Date(today);
      date.setMonth(date.getMonth() + month);
      date.setDate(1);
      
      // Znajdź pierwszą sobotę
      while (date.getDay() !== 6) {
        date.setDate(date.getDate() + 1);
      }
      
      if (date > today) {
        schedules.push({
          wasteType: 'bulk',
          collectionDate: date.toISOString().split('T')[0],
          collectionTimeFrom: '06:00',
          collectionTimeUntil: '14:00',
        });
      }
    }

    // Plastik/metal - co 2 tygodnie (środa)
    for (let week = 0; week < 12; week += 2) {
      const date = new Date(today);
      date.setDate(date.getDate() + (week * 7));
      
      // Znajdź najbliższą środę
      while (date.getDay() !== 3) {
        date.setDate(date.getDate() + 1);
      }
      
      if (date > today) {
        schedules.push({
          wasteType: 'plastic',
          collectionDate: date.toISOString().split('T')[0],
          collectionTimeFrom: '07:00',
          collectionTimeUntil: '15:00',
        });
      }
    }

    // Papier - raz w miesiącu (drugi wtorek)
    for (let month = 0; month < 3; month++) {
      const date = new Date(today);
      date.setMonth(date.getMonth() + month);
      date.setDate(1);
      
      // Znajdź drugi wtorek
      let tuesdayCount = 0;
      while (tuesdayCount < 2) {
        if (date.getDay() === 2) {
          tuesdayCount++;
        }
        if (tuesdayCount < 2) {
          date.setDate(date.getDate() + 1);
        }
      }
      
      if (date > today) {
        schedules.push({
          wasteType: 'paper',
          collectionDate: date.toISOString().split('T')[0],
          collectionTimeFrom: '07:00',
          collectionTimeUntil: '15:00',
        });
      }
    }

    // Szkło - raz w miesiącu (trzeci czwartek)
    for (let month = 0; month < 3; month++) {
      const date = new Date(today);
      date.setMonth(date.getMonth() + month);
      date.setDate(1);
      
      // Znajdź trzeci czwartek
      let thursdayCount = 0;
      while (thursdayCount < 3) {
        if (date.getDay() === 4) {
          thursdayCount++;
        }
        if (thursdayCount < 3) {
          date.setDate(date.getDate() + 1);
        }
      }
      
      if (date > today) {
        schedules.push({
          wasteType: 'glass',
          collectionDate: date.toISOString().split('T')[0],
          collectionTimeFrom: '07:00',
          collectionTimeUntil: '15:00',
        });
      }
    }

    // Bio - co tydzień (piątek)
    for (let week = 0; week < 12; week++) {
      const date = new Date(today);
      date.setDate(date.getDate() + (week * 7));
      
      // Znajdź najbliższy piątek
      while (date.getDay() !== 5) {
        date.setDate(date.getDate() + 1);
      }
      
      if (date > today) {
        schedules.push({
          wasteType: 'bio',
          collectionDate: date.toISOString().split('T')[0],
          collectionTimeFrom: '07:00',
          collectionTimeUntil: '15:00',
        });
      }
    }

    // Sortuj po dacie
    schedules.sort((a, b) => a.collectionDate.localeCompare(b.collectionDate));

    return schedules;
  }
}

/**
 * Factory function do tworzenia instancji adaptera
 */
export function createLodzWasteAdapter(): ICityWasteAdapter {
  return new LodzWasteAdapter();
}

/**
 * Helper: Pobierz adapter dla danego miasta
 */
export function getCityAdapter(cityKey: string): ICityWasteAdapter | null {
  switch (cityKey.toLowerCase()) {
    case 'lodz':
    case 'łódź':
      return createLodzWasteAdapter();
    // Dodaj tutaj kolejne miasta w przyszłości
    // case 'warszawa':
    //   return new WarszawaWasteAdapter();
    default:
      return null;
  }
}
