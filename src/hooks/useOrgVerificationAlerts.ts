import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  countOrgVerificationAlerts,
  listOrgVerificationAlerts,
  VERIFICATION_ALERTS_ROOT,
  type OrgVerificationAlert,
} from "@/lib/legalEntityApi";

export function verificationAlertsListKey(orgId: string) {
  return [VERIFICATION_ALERTS_ROOT, "list", orgId] as const;
}

export function verificationAlertsCountKey(orgId: string) {
  return [VERIFICATION_ALERTS_ROOT, "count", orgId] as const;
}

const STALE_MS = 30_000;
const GC_MS = 120_000;

export function useOrgVerificationAlerts(orgId: string | null) {
  return useQuery({
    queryKey: verificationAlertsListKey(orgId ?? "__none__"),
    queryFn: async (): Promise<OrgVerificationAlert[]> => {
      if (!orgId) return [];
      return listOrgVerificationAlerts(orgId);
    },
    enabled: Boolean(orgId),
    staleTime: STALE_MS,
    gcTime: GC_MS,
  });
}

export function useOrgVerificationAlertsCount(orgId: string | null, enabled: boolean = true) {
  return useQuery({
    queryKey: verificationAlertsCountKey(orgId ?? "__none__"),
    queryFn: async (): Promise<number> => {
      if (!orgId) return 0;
      return countOrgVerificationAlerts(orgId);
    },
    enabled: enabled && Boolean(orgId),
    staleTime: STALE_MS,
    gcTime: GC_MS,
  });
}

export function usePendingVerificationCount(enabled: boolean = true) {
  return useQuery({
    queryKey: [VERIFICATION_ALERTS_ROOT, "count", "my-org"] as const,
    queryFn: async (): Promise<number> => {
      const { data: orgId, error } = await supabase.rpc("get_my_org_id_safe");
      if (error) {
        console.error("[usePendingVerificationCount] get_my_org_id_safe:", error);
        throw error;
      }
      if (!orgId || String(orgId).trim() === "") return 0;
      return countOrgVerificationAlerts(String(orgId));
    },
    enabled,
    staleTime: STALE_MS,
    gcTime: GC_MS,
  });
}
