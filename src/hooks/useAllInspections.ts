import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import type { Company } from "@/types/contracts";
import type { Tables } from "@/types/supabase";

export const ALL_INSPECTIONS_STALE_MS = 5 * 60 * 1000;

export const allInspectionsQueryKey = ["inspections", "all"] as const;

export type PropertyInspectionGlobalRow = Tables<"property_inspections"> & {
  company: Company | null;
  location: Pick<Tables<"cleaning_locations">, "id" | "name" | "address"> | null;
};

async function fetchAllInspections(): Promise<PropertyInspectionGlobalRow[]> {
  try {
    const { data, error } = await supabase
      .from("property_inspections")
      .select("*, company:companies(*), location:cleaning_locations(*)")
      .order("valid_until", { ascending: true });

    if (error) {
      console.error("[useAllInspections] fetchAllInspections:", error);
      throw error;
    }
    return (data ?? []) as PropertyInspectionGlobalRow[];
  } catch (err) {
    console.error("[useAllInspections] fetchAllInspections:", err);
    throw err;
  }
}

export function useAllInspections(
  options?: { enabled?: boolean },
): UseQueryResult<PropertyInspectionGlobalRow[], Error> {
  return useQuery({
    queryKey: allInspectionsQueryKey,
    queryFn: fetchAllInspections,
    staleTime: ALL_INSPECTIONS_STALE_MS,
    enabled: options?.enabled ?? true,
  });
}
