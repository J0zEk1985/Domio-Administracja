import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type CommunityUnitKind = "residential" | "technical";

export type PropertyUnitRow = {
  id: string;
  orgId: string;
  communityId: string;
  locationId: string;
  unitNumber: string;
  normalizedUnitNumber: string;
  kind: CommunityUnitKind;
  label: string | null;
};

export type PropertyOccupantRow = {
  id: string;
  unitId: string;
  email: string;
  fullName: string;
  userId: string | null;
};

export type ResidentImportResultRow = {
  rowIndex: number;
  status: string;
  message: string;
};

export const propertyResidentsQueryKey = (locationId: string) =>
  ["property-residents", locationId] as const;

function asKind(value: string): CommunityUnitKind {
  return value === "technical" ? "technical" : "residential";
}

async function fetchPropertyResidents(locationId: string): Promise<{
  units: PropertyUnitRow[];
  occupants: PropertyOccupantRow[];
}> {
  const { data: units, error: unitError } = await supabase
    .from("community_units")
    .select(
      "id, org_id, community_id, location_id, unit_number, normalized_unit_number, kind, label"
    )
    .eq("location_id", locationId)
    .order("kind", { ascending: true })
    .order("normalized_unit_number", { ascending: true });

  if (unitError) {
    console.error("[usePropertyResidents] community_units:", unitError);
    throw unitError;
  }

  const unitRows: PropertyUnitRow[] = (units ?? []).map((row) => ({
    id: row.id,
    orgId: row.org_id,
    communityId: row.community_id,
    locationId: row.location_id,
    unitNumber: row.unit_number,
    normalizedUnitNumber: row.normalized_unit_number,
    kind: asKind(row.kind),
    label: row.label,
  }));

  if (unitRows.length === 0) {
    return { units: unitRows, occupants: [] };
  }

  const { data: occupants, error: occupantError } = await supabase
    .from("community_unit_occupants")
    .select("id, unit_id, email, full_name, user_id")
    .in(
      "unit_id",
      unitRows.map((unit) => unit.id)
    )
    .order("full_name", { ascending: true });

  if (occupantError) {
    console.error("[usePropertyResidents] community_unit_occupants:", occupantError);
    throw occupantError;
  }

  return {
    units: unitRows,
    occupants: (occupants ?? []).map((row) => ({
      id: row.id,
      unitId: row.unit_id,
      email: row.email,
      fullName: row.full_name,
      userId: row.user_id,
    })),
  };
}

export function usePropertyResidents(locationId: string) {
  return useQuery({
    queryKey: propertyResidentsQueryKey(locationId),
    queryFn: () => fetchPropertyResidents(locationId),
    enabled: Boolean(locationId),
  });
}

export function useImportPropertyResidents(locationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      rows: Array<{ row_index: number; email: string; full_name: string; unit_number: string }>
    ): Promise<ResidentImportResultRow[]> => {
      const { data, error } = await supabase.rpc("import_location_residents", {
        p_location_id: locationId,
        p_rows: rows,
      });
      if (error) {
        console.error("[useImportPropertyResidents]", error);
        throw error;
      }
      return (data ?? []).map((row) => ({
        rowIndex: row.row_index,
        status: row.status,
        message: row.message,
      }));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: propertyResidentsQueryKey(locationId) });
    },
  });
}

export function useCreateTechnicalUnit(locationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { orgId: string; communityId: string; label: string }) => {
      const label = input.label.trim();
      if (!label) {
        throw new Error("Podaj nazwę pomieszczenia.");
      }
      const { error } = await supabase.from("community_units").insert({
        org_id: input.orgId,
        community_id: input.communityId,
        location_id: locationId,
        unit_number: label,
        kind: "technical",
        label,
      });
      if (error) {
        console.error("[useCreateTechnicalUnit]", error);
        if (error.code === "23505") {
          throw new Error("Pomieszczenie o tej nazwie już jest w rejestrze.");
        }
        throw error;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: propertyResidentsQueryKey(locationId) });
    },
  });
}

export function useDeletePropertyUnit(locationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (unitId: string) => {
      const { error } = await supabase.from("community_units").delete().eq("id", unitId);
      if (error) {
        console.error("[useDeletePropertyUnit]", error);
        throw error;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: propertyResidentsQueryKey(locationId) });
    },
  });
}

export function useRemoveUnitOccupant(locationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (occupantId: string) => {
      const { error } = await supabase.rpc("remove_unit_occupant", {
        p_occupant_id: occupantId,
      });
      if (error) {
        console.error("[useRemoveUnitOccupant]", error);
        throw error;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: propertyResidentsQueryKey(locationId) });
    },
  });
}
