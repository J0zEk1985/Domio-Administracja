/**
 * DOMIO Home - Waste Management Hooks
 * React Query hooks dla modułu gospodarki odpadami
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  WasteCollectionSchedule,
  WasteGuideItem,
  WasteType,
  WasteSyncResult,
} from "@/types/wasteManagement";
import {
  fetchWasteSchedule,
  fetchUpcomingWasteSchedule,
  fetchWasteGuide,
  fetchPopularWasteGuideItems,
  createWasteSchedule,
  updateWasteSchedule,
  deleteWasteSchedule,
  syncWasteScheduleFromCity,
} from "@/lib/wasteManagementApi";
import { getCityAdapter } from "@/lib/adapters/LodzWasteAdapter";

// ============================================================================
// Query Keys
// ============================================================================

export const wasteKeys = {
  all: ["waste"] as const,
  schedules: () => [...wasteKeys.all, "schedules"] as const,
  schedule: (locationId: string, fromDate?: string, toDate?: string) =>
    [...wasteKeys.schedules(), { locationId, fromDate, toDate }] as const,
  upcomingSchedule: (locationId: string, limit?: number) =>
    [...wasteKeys.schedules(), "upcoming", { locationId, limit }] as const,
  guide: () => [...wasteKeys.all, "guide"] as const,
  guideItems: (orgId?: string | null, searchQuery?: string) =>
    [...wasteKeys.guide(), { orgId, searchQuery }] as const,
  popularItems: (orgId?: string | null, limit?: number) =>
    [...wasteKeys.guide(), "popular", { orgId, limit }] as const,
};

// ============================================================================
// Schedule Hooks (Resident)
// ============================================================================

/**
 * Hook do pobierania harmonogramu odbioru odpadów
 */
export function useWasteSchedule(
  locationId: string,
  options?: {
    fromDate?: string;
    toDate?: string;
    enabled?: boolean;
  }
) {
  return useQuery({
    queryKey: wasteKeys.schedule(locationId, options?.fromDate, options?.toDate),
    queryFn: () =>
      fetchWasteSchedule(locationId, options?.fromDate, options?.toDate),
    enabled: options?.enabled !== false && Boolean(locationId),
    staleTime: 5 * 60 * 1000, // 5 minut
  });
}

/**
 * Hook do pobierania nadchodzących terminów odbioru
 */
export function useUpcomingWasteSchedule(
  locationId: string,
  limit: number = 10,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: wasteKeys.upcomingSchedule(locationId, limit),
    queryFn: () => fetchUpcomingWasteSchedule(locationId, limit),
    enabled: enabled && Boolean(locationId),
    staleTime: 5 * 60 * 1000,
  });
}

// ============================================================================
// Guide Hooks (Resident)
// ============================================================================

/**
 * Hook do pobierania przewodnika segregacji odpadów
 */
export function useWasteGuide(
  orgId?: string | null,
  searchQuery?: string,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: wasteKeys.guideItems(orgId, searchQuery),
    queryFn: () => fetchWasteGuide(orgId, searchQuery),
    enabled,
    staleTime: 10 * 60 * 1000, // 10 minut (dane statyczne)
  });
}

/**
 * Hook do pobierania najpopularniejszych elementów przewodnika
 */
export function usePopularWasteGuideItems(
  orgId?: string | null,
  limit: number = 12,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: wasteKeys.popularItems(orgId, limit),
    queryFn: () => fetchPopularWasteGuideItems(orgId, limit),
    enabled,
    staleTime: 10 * 60 * 1000,
  });
}

// ============================================================================
// Management Hooks (Admin)
// ============================================================================

/**
 * Hook do dodawania nowego terminu odbioru (admin)
 */
export function useCreateWasteSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      locationId: string;
      orgId: string;
      wasteType: WasteType;
      collectionDate: string;
      collectionTimeFrom?: string;
      collectionTimeUntil?: string;
      notes?: string;
    }) => {
      return createWasteSchedule(
        params.locationId,
        params.orgId,
        params.wasteType,
        params.collectionDate,
        {
          collectionTimeFrom: params.collectionTimeFrom,
          collectionTimeUntil: params.collectionTimeUntil,
          notes: params.notes,
        }
      );
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: wasteKeys.schedule(variables.locationId),
      });
      void queryClient.invalidateQueries({
        queryKey: wasteKeys.upcomingSchedule(variables.locationId),
      });
    },
  });
}

/**
 * Hook do aktualizacji terminu odbioru (admin)
 */
export function useUpdateWasteSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      scheduleId: string;
      locationId: string;
      updates: Parameters<typeof updateWasteSchedule>[1];
    }) => {
      return updateWasteSchedule(params.scheduleId, params.updates);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: wasteKeys.schedule(variables.locationId),
      });
      void queryClient.invalidateQueries({
        queryKey: wasteKeys.upcomingSchedule(variables.locationId),
      });
    },
  });
}

/**
 * Hook do usuwania terminu odbioru (admin)
 */
export function useDeleteWasteSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { scheduleId: string; locationId: string }) => {
      await deleteWasteSchedule(params.scheduleId);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: wasteKeys.schedule(variables.locationId),
      });
      void queryClient.invalidateQueries({
        queryKey: wasteKeys.upcomingSchedule(variables.locationId),
      });
    },
  });
}

/**
 * Hook do synchronizacji harmonogramu z adapterem miasta (admin)
 */
export function useSyncWasteScheduleFromCity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      locationId: string;
      orgId: string;
      cityAdapter: string;
      street: string;
      buildingNumber: string;
    }): Promise<WasteSyncResult> => {
      // Pobierz adapter dla miasta
      const adapter = getCityAdapter(params.cityAdapter);
      if (!adapter) {
        return {
          success: false,
          recordsAdded: 0,
          recordsUpdated: 0,
          error: `Nieznany adapter miasta: ${params.cityAdapter}`,
        };
      }

      // Pobierz dane z adaptera
      const adapterResponse = await adapter.fetchSchedule(
        params.street,
        params.buildingNumber
      );

      // Zapisz do bazy
      return syncWasteScheduleFromCity(
        params.locationId,
        params.orgId,
        params.cityAdapter,
        params.street,
        params.buildingNumber,
        adapterResponse
      );
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: wasteKeys.schedule(variables.locationId),
      });
      void queryClient.invalidateQueries({
        queryKey: wasteKeys.upcomingSchedule(variables.locationId),
      });
    },
  });
}
