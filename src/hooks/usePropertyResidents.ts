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

function throwQueryError(
  scope: string,
  error: { message: string; code?: string },
  duplicateMessage?: string
): never {
  console.error(scope, error);
  if (error.code === "23505" && duplicateMessage) {
    throw new Error(duplicateMessage);
  }
  throw new Error(error.message);
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
    throwQueryError("[usePropertyResidents] community_units:", unitError);
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
    throwQueryError("[usePropertyResidents] community_unit_occupants:", occupantError);
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
        throwQueryError("[useImportPropertyResidents]", error);
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

export function useAddPropertyResident(locationId: string) {
  const importResidents = useImportPropertyResidents(locationId);
  return {
    ...importResidents,
    mutate: (
      input: { email: string; fullName: string; unitNumber: string },
      options?: Parameters<typeof importResidents.mutate>[1]
    ) =>
      importResidents.mutate(
        [
          {
            row_index: 1,
            email: input.email,
            full_name: input.fullName,
            unit_number: input.unitNumber,
          },
        ],
        options
      ),
  };
}

async function insertCommunityUnit(input: {
  locationId: string;
  orgId: string;
  communityId: string;
  unitNumber: string;
  kind: CommunityUnitKind;
}) {
  const unitNumber = input.unitNumber.trim();
  if (!unitNumber) {
    throw new Error(input.kind === "technical" ? "Podaj nazwę pomieszczenia." : "Podaj numer lokalu.");
  }
  const { error } = await supabase.from("community_units").insert({
    org_id: input.orgId,
    community_id: input.communityId,
    location_id: input.locationId,
    unit_number: unitNumber,
    kind: input.kind,
    label: input.kind === "technical" ? unitNumber : null,
  });
  if (error) {
    throwQueryError(
      "[insertCommunityUnit]",
      error,
      input.kind === "technical"
        ? "Pomieszczenie o tej nazwie już jest w rejestrze."
        : "Lokal o tym numerze już jest w rejestrze."
    );
  }
}

function useInsertCommunityUnit(locationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { orgId: string; communityId: string; unitNumber: string; kind: CommunityUnitKind }) =>
      insertCommunityUnit({ ...input, locationId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: propertyResidentsQueryKey(locationId) });
    },
  });
}

export function useCreateTechnicalUnit(locationId: string) {
  const insert = useInsertCommunityUnit(locationId);
  return {
    ...insert,
    mutate: (
      input: { orgId: string; communityId: string; label: string },
      options?: Parameters<typeof insert.mutate>[1]
    ) =>
      insert.mutate(
        { orgId: input.orgId, communityId: input.communityId, unitNumber: input.label, kind: "technical" },
        options
      ),
  };
}

export function useCreateResidentialUnit(locationId: string) {
  const insert = useInsertCommunityUnit(locationId);
  return {
    ...insert,
    mutate: (
      input: { orgId: string; communityId: string; unitNumber: string },
      options?: Parameters<typeof insert.mutate>[1]
    ) =>
      insert.mutate({ ...input, kind: "residential" }, options),
  };
}

export function useUpdatePropertyUnit(locationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { unitId: string; unitNumber: string; kind: CommunityUnitKind }) => {
      const unitNumber = input.unitNumber.trim();
      if (!unitNumber) {
        throw new Error(input.kind === "technical" ? "Podaj nazwę pomieszczenia." : "Podaj numer lokalu.");
      }
      const { error } = await supabase
        .from("community_units")
        .update({
          unit_number: unitNumber,
          label: input.kind === "technical" ? unitNumber : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.unitId);
      if (error) {
        throwQueryError("[useUpdatePropertyUnit]", error, "Lokal o tym numerze już jest w rejestrze.");
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
        throwQueryError("[useDeletePropertyUnit]", error);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: propertyResidentsQueryKey(locationId) });
    },
  });
}

export function useUpdateUnitOccupant(locationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { occupantId: string; fullName: string; email: string }) => {
      const { error } = await supabase.rpc("update_unit_occupant", {
        p_occupant_id: input.occupantId,
        p_full_name: input.fullName,
        p_email: input.email,
      });
      if (error) {
        throwQueryError("[useUpdateUnitOccupant]", error, "Ten e-mail jest już przypisany do tego lokalu.");
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
        throwQueryError("[useRemoveUnitOccupant]", error);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: propertyResidentsQueryKey(locationId) });
    },
  });
}
