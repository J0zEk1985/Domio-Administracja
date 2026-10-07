/**
 * React Hooks dla modułu Zasobów Wspólnych i Giełdy Sąsiedzkiej
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import * as api from "@/lib/sharedResourcesApi";
import type {
  SharedResource,
  ResourceBooking,
  ResourceBookingWithDetails,
  CreateCommunityResourceRequest,
  CreatePrivateResourceRequest,
  CreateBookingRequest,
  ResourceFilters,
  BookingFilters,
  BookingStatus,
  ResourceAvailabilityCalendar,
} from "@/types/sharedResources";
import { toast } from "sonner";

// ============================================================================
// QUERY KEYS
// ============================================================================

export const QUERY_KEYS = {
  resources: (filters?: ResourceFilters) => ["shared-resources", filters],
  resource: (id: string) => ["shared-resource", id],
  myBookings: (status?: BookingStatus, includePast?: boolean) => [
    "my-bookings",
    status,
    includePast,
  ],
  resourceBookings: (resourceId: string, filters?: BookingFilters) => [
    "resource-bookings",
    resourceId,
    filters,
  ],
  availability: (resourceId: string, year: number, month: number) => [
    "resource-availability",
    resourceId,
    year,
    month,
  ],
  usageStats: (unitId: string, resourceId?: string) => [
    "usage-stats",
    unitId,
    resourceId,
  ],
  usageReport: (resourceId: string, year: number, month: number) => [
    "usage-report",
    resourceId,
    year,
    month,
  ],
};

// ============================================================================
// ZASOBY
// ============================================================================

/**
 * Hook do pobierania dostępnych zasobów
 */
export function useAvailableResources(filters?: ResourceFilters) {
  return useQuery({
    queryKey: QUERY_KEYS.resources(filters),
    queryFn: async () => {
      const { data, error } = await api.getAvailableResources(filters);
      if (error) throw error;
      return data || [];
    },
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minut
  });
}

/**
 * Hook do pobierania pojedynczego zasobu
 */
export function useResource(resourceId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.resource(resourceId),
    queryFn: async () => {
      const { data, error } = await api.getResourceById(resourceId);
      if (error) throw error;
      return data;
    },
    enabled: !!resourceId,
  });
}

/**
 * Hook do tworzenia zasobu wspólnego
 */
export function useCreateCommunityResource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: CreateCommunityResourceRequest) =>
      api.createCommunityResource(request),
    onSuccess: (result) => {
      if (result.error) {
        toast.error("Błąd podczas tworzenia zasobu", {
          description: result.error.message,
        });
        return;
      }

      toast.success("Zasób wspólny został utworzony");
      queryClient.invalidateQueries({ queryKey: ["shared-resources"] });
    },
    onError: (error: Error) => {
      toast.error("Błąd podczas tworzenia zasobu", {
        description: error.message,
      });
    },
  });
}

/**
 * Hook do tworzenia zasobu prywatnego (P2P)
 */
export function useCreatePrivateResource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: CreatePrivateResourceRequest) =>
      api.createPrivateResource(request),
    onSuccess: (result) => {
      if (result.error) {
        toast.error("Błąd podczas dodawania przedmiotu", {
          description: result.error.message,
        });
        return;
      }

      toast.success("Przedmiot został dodany do giełdy sąsiedzkiej");
      queryClient.invalidateQueries({ queryKey: ["shared-resources"] });
    },
    onError: (error: Error) => {
      toast.error("Błąd podczas dodawania przedmiotu", {
        description: error.message,
      });
    },
  });
}

/**
 * Hook do aktualizacji zasobu
 */
export function useUpdateResource(resourceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (updates: Partial<SharedResource>) =>
      api.updateResource(resourceId, updates as any),
    onSuccess: (result) => {
      if (result.error) {
        toast.error("Błąd podczas aktualizacji", {
          description: result.error.message,
        });
        return;
      }

      toast.success("Zasób został zaktualizowany");
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.resource(resourceId),
      });
      queryClient.invalidateQueries({ queryKey: ["shared-resources"] });
    },
  });
}

/**
 * Hook do dezaktywacji zasobu
 */
export function useDeactivateResource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (resourceId: string) => api.deactivateResource(resourceId),
    onSuccess: (result, resourceId) => {
      if (result.error) {
        toast.error("Błąd podczas dezaktywacji", {
          description: result.error.message,
        });
        return;
      }

      toast.success("Zasób został dezaktywowany");
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.resource(resourceId),
      });
      queryClient.invalidateQueries({ queryKey: ["shared-resources"] });
    },
  });
}

// ============================================================================
// REZERWACJE
// ============================================================================

/**
 * Hook do pobierania moich rezerwacji
 */
export function useMyBookings(status?: BookingStatus, includePast = false) {
  return useQuery({
    queryKey: QUERY_KEYS.myBookings(status, includePast),
    queryFn: async () => {
      const { data, error } = await api.getMyBookings(status, includePast);
      if (error) throw error;
      return data || [];
    },
  });
}

/**
 * Hook do pobierania rezerwacji zasobu
 */
export function useResourceBookings(
  resourceId: string,
  filters?: BookingFilters
) {
  return useQuery({
    queryKey: QUERY_KEYS.resourceBookings(resourceId, filters),
    queryFn: async () => {
      const { data, error } = await api.getResourceBookings(
        resourceId,
        filters
      );
      if (error) throw error;
      return data || [];
    },
    enabled: !!resourceId,
  });
}

/**
 * Hook do tworzenia rezerwacji
 */
export function useCreateBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: CreateBookingRequest) => api.createBooking(request),
    onSuccess: (result) => {
      if (result.error) {
        toast.error("Błąd podczas tworzenia rezerwacji", {
          description: result.error.message,
        });
        return;
      }

      if (!result.data || !result.data.success) {
        toast.error("Nie udało się utworzyć rezerwacji", {
          description: result.data?.message || "Nieznany błąd",
        });
        return;
      }

      const { status, message } = result.data;

      if (status === "pending") {
        toast.info("Rezerwacja oczekuje na zatwierdzenie", {
          description: message,
        });
      } else {
        toast.success("Rezerwacja potwierdzona!", {
          description: message,
        });
      }

      queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["resource-bookings"] });
    },
    onError: (error: Error) => {
      toast.error("Błąd podczas rezerwacji", {
        description: error.message,
      });
    },
  });
}

/**
 * Hook do zatwierdzania rezerwacji
 */
export function useApproveBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bookingId: string) => api.approveBooking(bookingId),
    onSuccess: (result) => {
      if (result.error) {
        toast.error("Błąd podczas zatwierdzania", {
          description: result.error.message,
        });
        return;
      }

      if (!result.data?.success) {
        toast.error("Nie udało się zatwierdzić rezerwacji", {
          description: result.data?.message,
        });
        return;
      }

      toast.success("Rezerwacja zatwierdzona");
      queryClient.invalidateQueries({ queryKey: ["resource-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
    },
  });
}

/**
 * Hook do odrzucania rezerwacji
 */
export function useRejectBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ bookingId, reason }: { bookingId: string; reason: string }) =>
      api.rejectBooking(bookingId, reason),
    onSuccess: (result) => {
      if (result.error) {
        toast.error("Błąd podczas odrzucania", {
          description: result.error.message,
        });
        return;
      }

      if (!result.data?.success) {
        toast.error("Nie udało się odrzucić rezerwacji", {
          description: result.data?.message,
        });
        return;
      }

      toast.success("Rezerwacja odrzucona");
      queryClient.invalidateQueries({ queryKey: ["resource-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
    },
  });
}

/**
 * Hook do anulowania rezerwacji
 */
export function useCancelBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      bookingId,
      reason,
    }: {
      bookingId: string;
      reason?: string;
    }) => api.cancelBooking(bookingId, reason),
    onSuccess: (result) => {
      if (result.error) {
        toast.error("Błąd podczas anulowania", {
          description: result.error.message,
        });
        return;
      }

      if (!result.data?.success) {
        toast.error("Nie udało się anulować rezerwacji", {
          description: result.data?.message,
        });
        return;
      }

      toast.success("Rezerwacja anulowana");
      queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["resource-bookings"] });
    },
  });
}

/**
 * Hook do check-in
 */
export function useCheckInBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bookingId: string) => api.checkInBooking(bookingId),
    onSuccess: (result) => {
      if (result.error) {
        toast.error("Błąd podczas check-in", {
          description: result.error.message,
        });
        return;
      }

      if (!result.data?.success) {
        toast.error("Nie udało się wykonać check-in", {
          description: result.data?.message,
        });
        return;
      }

      toast.success("Check-in wykonany pomyślnie");
      queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
    },
  });
}

/**
 * Hook do check-out
 */
export function useCheckOutBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      bookingId,
      photoUrl,
      notes,
    }: {
      bookingId: string;
      photoUrl?: string;
      notes?: string;
    }) => api.checkOutBooking(bookingId, photoUrl, notes),
    onSuccess: (result) => {
      if (result.error) {
        toast.error("Błąd podczas check-out", {
          description: result.error.message,
        });
        return;
      }

      if (!result.data?.success) {
        toast.error("Nie udało się wykonać check-out", {
          description: result.data?.message,
        });
        return;
      }

      toast.success("Check-out wykonany pomyślnie");
      queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
    },
  });
}

// ============================================================================
// DOSTĘPNOŚĆ
// ============================================================================

/**
 * Hook do sprawdzania dostępności w czasie rzeczywistym
 */
export function useCheckAvailability(
  resourceId: string,
  startsAt: string | null,
  endsAt: string | null
) {
  return useQuery({
    queryKey: ["check-availability", resourceId, startsAt, endsAt],
    queryFn: async () => {
      if (!startsAt || !endsAt) return null;
      const { data, error } = await api.checkAvailability(
        resourceId,
        startsAt,
        endsAt
      );
      if (error) throw error;
      return data;
    },
    enabled: !!resourceId && !!startsAt && !!endsAt,
    staleTime: 1000 * 30, // 30 sekund
  });
}

/**
 * Hook do pobierania kalendarza dostępności
 */
export function useResourceAvailability(
  resourceId: string,
  year: number,
  month: number
) {
  return useQuery({
    queryKey: QUERY_KEYS.availability(resourceId, year, month),
    queryFn: async () => {
      const { data, error } = await api.getResourceAvailabilityCalendar(
        resourceId,
        year,
        month
      );
      if (error) throw error;
      return data || [];
    },
    enabled: !!resourceId,
  });
}

// ============================================================================
// STATYSTYKI
// ============================================================================

/**
 * Hook do pobierania statystyk użytkownika
 */
export function useMyUsageStats(unitId: string, resourceId?: string) {
  return useQuery({
    queryKey: QUERY_KEYS.usageStats(unitId, resourceId),
    queryFn: async () => {
      const { data, error } = await api.getMyUsageStats(unitId, resourceId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!unitId,
  });
}

/**
 * Hook do pobierania raportu wykorzystania (dla zarządcy)
 */
export function useResourceUsageReport(
  resourceId: string,
  year?: number,
  month?: number
) {
  const currentYear = year || new Date().getFullYear();
  const currentMonth = month || new Date().getMonth() + 1;

  return useQuery({
    queryKey: QUERY_KEYS.usageReport(resourceId, currentYear, currentMonth),
    queryFn: async () => {
      const { data, error } = await api.getResourceUsageReport(
        resourceId,
        currentYear,
        currentMonth
      );
      if (error) throw error;
      return data || [];
    },
    enabled: !!resourceId,
  });
}

// ============================================================================
// KOD DOSTĘPU
// ============================================================================

/**
 * Hook do generowania kodu dostępu
 */
export function useGenerateAccessCode() {
  return useMutation({
    mutationFn: (bookingId: string) => api.generateAccessCode(bookingId),
    onSuccess: (result) => {
      if (result.error) {
        toast.error("Błąd podczas generowania kodu", {
          description: result.error.message,
        });
        return;
      }

      if (!result.data?.success) {
        toast.error("Nie udało się wygenerować kodu", {
          description: result.data?.message,
        });
        return;
      }

      // Kod został wygenerowany - UI pokaże go w osobnym komponencie
    },
  });
}

// ============================================================================
// REAL-TIME SUBSCRIPTION
// ============================================================================

/**
 * Hook do subskrypcji zmian w moich rezerwacjach (real-time)
 */
export function useMyBookingsSubscription(userId: string) {
  const queryClient = useQueryClient();
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    if (!userId) return;

    setIsSubscribed(true);
    const unsubscribe = api.subscribeToMyBookings(userId, () => {
      // Invalidate queries when booking changes
      queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
    });

    return () => {
      setIsSubscribed(false);
      unsubscribe();
    };
  }, [userId, queryClient]);

  return { isSubscribed };
}

/**
 * Hook do subskrypcji zmian w rezerwacjach zasobu (real-time)
 */
export function useResourceBookingsSubscription(resourceId: string) {
  const queryClient = useQueryClient();
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    if (!resourceId) return;

    setIsSubscribed(true);
    const unsubscribe = api.subscribeToResourceBookings(resourceId, () => {
      // Invalidate queries when booking changes
      queryClient.invalidateQueries({
        queryKey: ["resource-bookings", resourceId],
      });
    });

    return () => {
      setIsSubscribed(false);
      unsubscribe();
    };
  }, [resourceId, queryClient]);

  return { isSubscribed };
}
