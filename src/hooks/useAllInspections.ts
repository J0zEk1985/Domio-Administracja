import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import type { Company } from "@/types/contracts";
import type { Tables } from "@/types/supabase";

export const ALL_INSPECTIONS_STALE_MS = 5 * 60 * 1000;

export const allInspectionsQueryKey = ["inspections", "all"] as const;

export type PropertyInspectionGlobalRow = Tables<"property_inspections"> & {
  company: Company | null;
  location: {
    id: string;
    name: string | null;
    address: string | null;
    communities?: { id?: string | null; name?: string | null } | null;
  } | null;
};

type LocationEmbed = PropertyInspectionGlobalRow["location"];

function normalizeLocationEmbed(value: unknown): LocationEmbed {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  const loc = row as {
    id?: string;
    name?: string | null;
    address?: string | null;
    communities?: { id?: string | null; name?: string | null } | { id?: string | null; name?: string | null }[] | null;
  };
  if (!loc.id) return null;
  const communities = Array.isArray(loc.communities) ? (loc.communities[0] ?? null) : (loc.communities ?? null);
  return {
    id: loc.id,
    name: loc.name ?? null,
    address: loc.address ?? null,
    communities,
  };
}

async function fetchAllInspections(): Promise<PropertyInspectionGlobalRow[]> {
  try {
    const { data, error } = await supabase
      .from("property_inspections")
      .select(
        "*, company:companies(*), location:cleaning_locations!property_inspections_location_id_fkey(id, name, address, communities!cleaning_locations_community_id_fkey(id, name))",
      )
      .order("valid_until", { ascending: true });

    if (error) {
      console.error("[useAllInspections] fetchAllInspections:", error);
      throw error;
    }
    return (data ?? []).map((row) => {
      const raw = row as PropertyInspectionGlobalRow & { location: unknown };
      return { ...raw, location: normalizeLocationEmbed(raw.location) };
    });
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
