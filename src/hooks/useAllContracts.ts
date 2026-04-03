import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { PropertyContract } from "@/types/contracts";

export const ALL_CONTRACTS_STALE_MS = 5 * 60 * 1000;

export const allContractsQueryKey = ["contracts", "all"] as const;

export type PropertyContractWithRelations = PropertyContract;

async function fetchAllContracts(): Promise<PropertyContractWithRelations[]> {
  try {
    const { data, error } = await supabase
      .from("property_contracts")
      .select("*, company:companies(*), location:cleaning_locations(*)")
      .order("created_at", { ascending: false });

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

export function useAllContracts(): UseQueryResult<PropertyContractWithRelations[], Error> {
  return useQuery({
    queryKey: allContractsQueryKey,
    queryFn: fetchAllContracts,
    staleTime: ALL_CONTRACTS_STALE_MS,
  });
}
