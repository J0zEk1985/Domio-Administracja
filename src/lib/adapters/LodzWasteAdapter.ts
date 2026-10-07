/**
 * DOMIO Home - Łódź Waste Adapter
 * Pobiera terminy odpadów gabarytowych z Karty Łodzianina (harmonogram UM Łódź).
 *
 * The browser cannot call kartalodzianina.pl directly (no CORS). Dev uses the
 * Vite proxy; production calls the `lodz-waste-schedule` edge function.
 */

import { supabase } from "@/lib/supabase";
import type { ICityWasteAdapter, CityAdapterResponse } from "@/types/wasteManagement";

export class LodzWasteAdapter implements ICityWasteAdapter {
  readonly cityName = "Łódź";
  readonly adapterKey = "lodz";

  async fetchSchedule(street: string, buildingNumber: string): Promise<CityAdapterResponse> {
    try {
      console.log(`[LodzWasteAdapter] Fetching bulky-waste schedule for: ${street} ${buildingNumber}`);

      if (import.meta.env.DEV) {
        return await this.fetchViaDevProxy(street, buildingNumber);
      }

      return await this.fetchViaEdgeFunction(street, buildingNumber);
    } catch (error) {
      console.error("[LodzWasteAdapter] Error:", error);
      return {
        success: false,
        schedules: [],
        error: error instanceof Error ? error.message : "Nieznany błąd podczas pobierania harmonogramu",
      };
    }
  }

  isAddressSupported(street: string): boolean {
    return street.trim().length > 0;
  }

  private async fetchViaDevProxy(street: string, buildingNumber: string): Promise<CityAdapterResponse> {
    const response = await fetch("/api/lodz-waste-schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ street, buildingNumber }),
    });

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      console.error("[LodzWasteAdapter] Dev proxy returned non-JSON:", error);
      throw new Error("Nie udało się odczytać odpowiedzi harmonogramu.");
    }

    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
          ? (payload as { error: string }).error
          : `Serwer harmonogramu zwrócił błąd (HTTP ${response.status}).`;
      return { success: false, schedules: [], error: message };
    }

    return asCityAdapterResponse(payload);
  }

  private async fetchViaEdgeFunction(street: string, buildingNumber: string): Promise<CityAdapterResponse> {
    const { data, error } = await supabase.functions.invoke("lodz-waste-schedule", {
      body: { street, buildingNumber },
    });

    if (error) {
      console.error("[LodzWasteAdapter] edge function:", error);
      const fromBody = readFunctionError(data);
      return {
        success: false,
        schedules: [],
        error:
          fromBody ??
          "Nie udało się połączyć z usługą harmonogramu Łodzi. Wdróż funkcję lodz-waste-schedule.",
      };
    }

    return asCityAdapterResponse(data);
  }
}

function readFunctionError(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const error = (data as { error?: unknown }).error;
  return typeof error === "string" && error.trim() ? error : null;
}

function asCityAdapterResponse(payload: unknown): CityAdapterResponse {
  if (!payload || typeof payload !== "object") {
    return { success: false, schedules: [], error: "Nieprawidłowa odpowiedź usługi harmonogramu." };
  }

  const body = payload as {
    success?: unknown;
    error?: unknown;
    source?: unknown;
    schedules?: unknown;
  };

  if (body.success !== true) {
    return {
      success: false,
      schedules: [],
      error: typeof body.error === "string" ? body.error : "Nie udało się pobrać harmonogramu.",
    };
  }

  const schedules = Array.isArray(body.schedules)
    ? body.schedules.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const row = item as { wasteType?: unknown; collectionDate?: unknown };
        if (row.wasteType !== "bulk" || typeof row.collectionDate !== "string") return [];
        if (!/^\d{4}-\d{2}-\d{2}$/.test(row.collectionDate)) return [];
        return [{ wasteType: "bulk" as const, collectionDate: row.collectionDate }];
      })
    : [];

  if (schedules.length === 0) {
    return {
      success: false,
      schedules: [],
      error: "Nie znaleziono terminów odbioru odpadów gabarytowych dla tego adresu.",
    };
  }

  return {
    success: true,
    schedules,
    source: typeof body.source === "string" ? body.source : undefined,
  };
}

export function createLodzWasteAdapter(): ICityWasteAdapter {
  return new LodzWasteAdapter();
}

export function getCityAdapter(cityKey: string): ICityWasteAdapter | null {
  switch (cityKey.toLowerCase()) {
    case "lodz":
    case "łódź":
      return createLodzWasteAdapter();
    default:
      return null;
  }
}
