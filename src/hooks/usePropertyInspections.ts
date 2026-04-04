import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { allInspectionsQueryKey } from "@/hooks/useAllInspections";
import type { AddInspectionFormValues } from "@/schemas/inspectionSchema";
import { supabase } from "@/lib/supabase";
import type { Company } from "@/types/contracts";
import type { Database, Tables } from "@/types/supabase";

export type PropertyInspectionWithCompany = Tables<"property_inspections"> & {
  company: Company | null;
};

/** Przeglądy nie mają community_id — w widoku wspólnoty filtrujemy po budynkach. */
export type PropertyInspectionsScopeOptions = {
  /** Agregacja przeglądów wszystkich budynków wspólnoty. */
  communityBuildingIds?: string[] | null;
};

function inspectionsScopeCacheKey(scope?: PropertyInspectionsScopeOptions | null): string {
  const ids = scope?.communityBuildingIds;
  if (!ids || ids.length === 0) return "default";
  return `b:${[...ids].sort().join(",")}`;
}

export const propertyInspectionsQueryKey = (
  locationId: string,
  scope?: PropertyInspectionsScopeOptions | null,
) => ["inspections", locationId, inspectionsScopeCacheKey(scope)] as const;

type InspectionInsert = Database["public"]["Tables"]["property_inspections"]["Insert"];

async function fetchPropertyInspections(
  locationId: string,
  scope?: PropertyInspectionsScopeOptions | null,
): Promise<PropertyInspectionWithCompany[]> {
  try {
    const ids = scope?.communityBuildingIds;
    let q = supabase.from("property_inspections").select("*, company:companies(*)");

    if (ids && ids.length > 0) {
      q = q.in("location_id", ids);
    } else {
      q = q.eq("location_id", locationId);
    }

    const { data, error } = await q.order("valid_until", { ascending: false });

    if (error) {
      console.error("[usePropertyInspections] fetchPropertyInspections:", error);
      throw error;
    }
    return (data ?? []) as PropertyInspectionWithCompany[];
  } catch (err) {
    console.error("[usePropertyInspections] fetchPropertyInspections:", err);
    throw err;
  }
}

export function usePropertyInspections(
  locationId: string,
  options?: { enabled?: boolean; scope?: PropertyInspectionsScopeOptions | null },
): UseQueryResult<PropertyInspectionWithCompany[], Error> {
  const scope = options?.scope ?? null;
  return useQuery({
    queryKey: propertyInspectionsQueryKey(locationId, scope ?? undefined),
    queryFn: () => fetchPropertyInspections(locationId, scope ?? undefined),
    enabled: (options?.enabled ?? true) && Boolean(locationId),
    staleTime: 30_000,
  });
}

export type AddInspectionVariables = {
  locationId: string;
  values: AddInspectionFormValues;
};

function buildInspectionPayload(
  values: AddInspectionFormValues,
): Omit<InspectionInsert, "location_id" | "id"> {
  const protocol = values.protocol_number?.trim();
  const notes = values.notes?.trim();
  return {
    company_id: values.company_id,
    type: values.type,
    status: values.status,
    execution_date: values.execution_date,
    valid_until: values.valid_until,
    protocol_number: protocol && protocol.length > 0 ? protocol : null,
    notes: notes && notes.length > 0 ? notes : null,
  };
}

async function insertPropertyInspection({ locationId, values }: AddInspectionVariables): Promise<void> {
  try {
    const row: InspectionInsert = {
      ...buildInspectionPayload(values),
      location_id: locationId,
    };

    const { error } = await supabase.from("property_inspections").insert(row);
    if (error) {
      console.error("[useAddInspection] insert:", error);
      throw error;
    }
  } catch (err) {
    console.error("[useAddInspection] insertPropertyInspection:", err);
    throw err;
  }
}

export function useAddInspection(): UseMutationResult<void, Error, AddInspectionVariables> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: insertPropertyInspection,
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: propertyInspectionsQueryKey(variables.locationId) });
      void queryClient.invalidateQueries({ queryKey: allInspectionsQueryKey });
    },
  });
}
