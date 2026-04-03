import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { PropertyContract } from "@/types/contracts";

export const ALL_CONTRACTS_STALE_MS = 5 * 60 * 1000;

/** Prefix for React Query; invalidating this key clears all `useAllContracts` variants. */
export const allContractsQueryKey = ["contracts", "all"] as const;

export type UseAllContractsFilters = {
  companyId?: string;
};

export type PropertyContractWithRelations = PropertyContract;

function buildAllContractsQueryKey(filters?: UseAllContractsFilters) {
  if (filters?.companyId) {
    return [...allContractsQueryKey, { companyId: filters.companyId }] as const;
  }
  return allContractsQueryKey;
}

async function fetchAllContracts(filters?: UseAllContractsFilters): Promise<PropertyContractWithRelations[]> {
  try {
    let query = supabase
      .from("property_contracts")
      .select("*, company:companies(*), location:cleaning_locations(*)")
      .order("created_at", { ascending: false });

    if (filters?.companyId) {
      query = query.eq("company_id", filters.companyId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[useAllContracts] fetchAllContracts:", error);
      throw error;
    }
    return (data ?? []) as PropertyContractWithRelations[];
  } catch (err) {
    console.error("[useAllContracts] fetchAllContracts:", err);
    throw err;
  }
}

export function useAllContracts(
  filters?: UseAllContractsFilters,
  options?: { enabled?: boolean },
): UseQueryResult<PropertyContractWithRelations[], Error> {
  return useQuery({
    queryKey: buildAllContractsQueryKey(filters),
    queryFn: () => fetchAllContracts(filters),
    staleTime: ALL_CONTRACTS_STALE_MS,
    enabled: options?.enabled ?? true,
  });
}
