import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { getOrgAndActor } from "@/lib/orgAccess";
import { supabase } from "@/lib/supabase";
import type { Database, Tables } from "@/types/supabase";

export type UnitInspectionRecordRow = Tables<"unit_inspection_records">;

export type InspectionCampaignWithVendorAndRecords = Tables<"inspection_campaigns"> & {
  vendor: { name: string } | null;
  unit_inspection_records: Pick<UnitInspectionRecordRow, "id" | "status">[] | null;
};

export const inspectionCampaignsQueryKey = (locationId: string) =>
  ["inspection-campaigns", locationId] as const;

export const inspectionCampaignRecordsQueryKey = (campaignId: string) =>
  ["inspection-campaign-records", campaignId] as const;

export const inspectionCampaignDetailQueryKey = (campaignId: string) =>
  ["inspection-campaign", campaignId] as const;

function sortRecordsByUnitNumber(records: UnitInspectionRecordRow[]): UnitInspectionRecordRow[] {
  return [...records].sort((a, b) =>
    a.unit_number.localeCompare(b.unit_number, undefined, { numeric: true }),
  );
}

async function fetchCampaignsForLocation(locationId: string): Promise<InspectionCampaignWithVendorAndRecords[]> {
  try {
    const { data, error } = await supabase
      .from("inspection_campaigns")
      .select(
        `
        *,
        vendor:vendor_partners(name),
        unit_inspection_records(id, status)
      `,
      )
      .eq("location_id", locationId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[useInspectionCampaigns] fetchCampaignsForLocation:", error);
      throw error;
    }
    return (data ?? []) as InspectionCampaignWithVendorAndRecords[];
  } catch (err) {
    console.error("[useInspectionCampaigns] fetchCampaignsForLocation:", err);
    throw err;
  }
}

export function useCampaigns(
  locationId: string,
  options?: { enabled?: boolean },
): UseQueryResult<InspectionCampaignWithVendorAndRecords[], Error> {
  return useQuery({
    queryKey: inspectionCampaignsQueryKey(locationId),
    queryFn: () => fetchCampaignsForLocation(locationId),
    enabled: (options?.enabled ?? true) && Boolean(locationId),
    staleTime: 30_000,
  });
}

async function fetchCampaignRecords(campaignId: string): Promise<UnitInspectionRecordRow[]> {
  try {
    const { data, error } = await supabase
      .from("unit_inspection_records")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("unit_number", { ascending: true });

    if (error) {
      console.error("[useInspectionCampaigns] fetchCampaignRecords:", error);
      throw error;
    }
    return sortRecordsByUnitNumber((data ?? []) as UnitInspectionRecordRow[]);
  } catch (err) {
    console.error("[useInspectionCampaigns] fetchCampaignRecords:", err);
    throw err;
  }
}

export function useCampaignRecords(
  campaignId: string,
  options?: { enabled?: boolean },
): UseQueryResult<UnitInspectionRecordRow[], Error> {
  return useQuery({
    queryKey: inspectionCampaignRecordsQueryKey(campaignId),
    queryFn: () => fetchCampaignRecords(campaignId),
    enabled: (options?.enabled ?? true) && Boolean(campaignId),
    staleTime: 15_000,
  });
}

export type InspectionCampaignDetail = Tables<"inspection_campaigns"> & {
  vendor: { name: string } | null;
};

async function fetchCampaignById(campaignId: string): Promise<InspectionCampaignDetail> {
  const actor = await getOrgAndActor();

  const { data: row, error } = await supabase
    .from("inspection_campaigns")
    .select(
      `
      *,
      vendor:vendor_partners(name)
    `,
    )
    .eq("id", campaignId)
    .maybeSingle();

  if (error) {
    console.error("[useInspectionCampaigns] fetchCampaignById:", error);
    throw error;
  }
  if (!row) {
    throw new Error("Nie znaleziono kampanii lub brak dostępu.");
  }

  const { data: loc, error: locErr } = await supabase
    .from("cleaning_locations")
    .select("id, org_id")
    .eq("id", row.location_id)
    .maybeSingle();

  if (locErr) {
    console.error("[useInspectionCampaigns] cleaning_locations:", locErr);
    throw locErr;
  }
  if (!loc || loc.org_id !== actor.orgId) {
    throw new Error("Nie znaleziono kampanii lub brak dostępu.");
  }

  if (!actor.isOwner) {
    const { data: acc } = await supabase
      .from("location_access")
      .select("id")
      .eq("location_id", row.location_id)
      .eq("user_id", actor.userId)
      .eq("access_type", "administration")
      .limit(1)
      .maybeSingle();
    if (!acc) {
      throw new Error("Nie znaleziono kampanii lub brak dostępu.");
    }
  }

  return row as InspectionCampaignDetail;
}

export function useInspectionCampaign(
  campaignId: string | undefined,
  options?: { enabled?: boolean },
): UseQueryResult<InspectionCampaignDetail, Error> {
  return useQuery({
    queryKey: inspectionCampaignDetailQueryKey(campaignId ?? ""),
    queryFn: () => fetchCampaignById(campaignId!),
    enabled: (options?.enabled ?? true) && Boolean(campaignId),
    staleTime: 30_000,
  });
}

export type CreateInspectionCampaignInput = {
  locationId: string;
  title: string;
  category: string;
  startDate: string;
  endDate: string;
  /** Daily window start, HH:mm (mapped to Postgres TIME) or null when omitted */
  startTime: string | null;
  /** Daily window end, HH:mm or null */
  endTime: string | null;
  vendorId: string | null;
};

function toPostgresTime(hhmm: string): string {
  const [h, m] = hhmm.trim().split(":");
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}:00`;
}

async function insertInspectionCampaign(input: CreateInspectionCampaignInput): Promise<string> {
  const actor = await getOrgAndActor();

  const { data: loc, error: locErr } = await supabase
    .from("cleaning_locations")
    .select("id, org_id")
    .eq("id", input.locationId)
    .eq("org_id", actor.orgId)
    .maybeSingle();

  if (locErr) {
    console.error("[useInspectionCampaigns] insertInspectionCampaign location:", locErr);
    throw locErr;
  }
  if (!loc) {
    throw new Error("Brak dostępu do tego budynku.");
  }

  if (!actor.isOwner) {
    const { data: acc } = await supabase
      .from("location_access")
      .select("id")
      .eq("location_id", input.locationId)
      .eq("user_id", actor.userId)
      .eq("access_type", "administration")
      .limit(1)
      .maybeSingle();
    if (!acc) {
      throw new Error("Brak dostępu do tego budynku.");
    }
  }

  const payload: Database["public"]["Tables"]["inspection_campaigns"]["Insert"] = {
    org_id: actor.orgId,
    location_id: input.locationId,
    title: input.title.trim(),
    category: input.category.trim(),
    start_date: input.startDate,
    end_date: input.endDate,
    start_time: input.startTime ? toPostgresTime(input.startTime) : null,
    end_time: input.endTime ? toPostgresTime(input.endTime) : null,
    vendor_id: input.vendorId,
  };

  const { data: inserted, error } = await supabase.from("inspection_campaigns").insert(payload).select("id").single();

  if (error) {
    console.error("[useInspectionCampaigns] insertInspectionCampaign:", error);
    throw error;
  }
  if (!inserted?.id) {
    throw new Error("Nie udało się utworzyć kampanii.");
  }
  return inserted.id;
}

export function useCreateInspectionCampaign(): UseMutationResult<string, Error, CreateInspectionCampaignInput> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: insertInspectionCampaign,
    onSuccess: (_id, variables) => {
      void queryClient.invalidateQueries({ queryKey: inspectionCampaignsQueryKey(variables.locationId) });
    },
  });
}

export type GenerateUnitRecordsVariables = {
  campaignId: string;
  locationId: string;
  unitsArray: string[];
};

async function bulkInsertUnitRecords({ campaignId, unitsArray }: GenerateUnitRecordsVariables): Promise<void> {
  const unique = [...new Set(unitsArray.map((u) => u.trim()).filter(Boolean))];
  if (unique.length === 0) {
    throw new Error("Podaj co najmniej jeden numer lokalu.");
  }

  const rows: Database["public"]["Tables"]["unit_inspection_records"]["Insert"][] = unique.map((unit_number) => ({
    campaign_id: campaignId,
    unit_number,
    status: "pending",
  }));

  try {
    const { error } = await supabase.from("unit_inspection_records").insert(rows);
    if (error) {
      console.error("[useInspectionCampaigns] bulkInsertUnitRecords:", error);
      throw error;
    }
  } catch (err) {
    console.error("[useInspectionCampaigns] bulkInsertUnitRecords:", err);
    throw err;
  }
}

export function useGenerateUnitRecords(): UseMutationResult<void, Error, GenerateUnitRecordsVariables> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: bulkInsertUnitRecords,
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: inspectionCampaignRecordsQueryKey(variables.campaignId) });
      void queryClient.invalidateQueries({ queryKey: inspectionCampaignsQueryKey(variables.locationId) });
    },
  });
}

/** Counts units considered "done" for progress bar (completed or failed with defects). */
export function countCampaignFinishedUnits(
  records: Pick<UnitInspectionRecordRow, "status">[] | null | undefined,
): { done: number; total: number } {
  const list = records ?? [];
  const total = list.length;
  const done = list.filter((r) => r.status === "completed" || r.status === "failed_defects").length;
  return { done, total };
}
