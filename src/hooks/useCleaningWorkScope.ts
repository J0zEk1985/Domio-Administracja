import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/sonner";
import {
  fetchCleaningScopeDocument,
  fetchPartnerCleaningWorkScope,
  setBuildingCleaningScopeContract,
} from "@/lib/cleaningWorkScopeApi";

export const cleaningWorkScopeQueryKeys = {
  scope: (masterId: string) => ["partner-cleaning-work-scope", masterId] as const,
  document: (locationId: string) => ["cleaning-scope-document", locationId] as const,
};

export function usePartnerCleaningWorkScope(locationMasterId: string | null) {
  return useQuery({
    queryKey: cleaningWorkScopeQueryKeys.scope(locationMasterId ?? ""),
    queryFn: () => fetchPartnerCleaningWorkScope(locationMasterId!),
    enabled: Boolean(locationMasterId),
  });
}

export function useCleaningScopeDocument(adminLocationId: string | null) {
  return useQuery({
    queryKey: cleaningWorkScopeQueryKeys.document(adminLocationId ?? ""),
    queryFn: () => fetchCleaningScopeDocument(adminLocationId!),
    enabled: Boolean(adminLocationId),
  });
}

export function useSetCleaningScopeContract(adminLocationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (contractId: string | null) =>
      setBuildingCleaningScopeContract(adminLocationId!, contractId),
    onSuccess: (doc) => {
      toast.success(
        doc.source === "none"
          ? "Wskazanie umowy wyczyszczone — używany będzie dokument z bazy umów."
          : "Zapisano dokument umowy do porównania.",
      );
      if (adminLocationId) {
        void qc.invalidateQueries({ queryKey: cleaningWorkScopeQueryKeys.document(adminLocationId) });
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Nie udało się zapisać wskazania umowy.");
    },
  });
}
