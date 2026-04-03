import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { allContractsQueryKey } from "@/hooks/useAllContracts";
import { supabase } from "@/lib/supabase";
import type { PropertyContract } from "@/types/contracts";
import type { AddContractFormValues } from "@/schemas/contractSchema";
import type { Database } from "@/types/supabase";

export type PropertyContractWithCompany = PropertyContract;

export const propertyContractsQueryKey = (locationId: string) => ["contracts", locationId] as const;

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function fetchPropertyContracts(locationId: string): Promise<PropertyContractWithCompany[]> {
  try {
    const today = todayIsoDate();
    const { data, error } = await supabase
      .from("property_contracts")
      .select("*, company:companies(*)")
      .eq("location_id", locationId)
      .or(`end_date.is.null,end_date.gte.${today}`)
      .order("start_date", { ascending: false });

    if (error) {
      console.error("[usePropertyContracts] fetchPropertyContracts:", error);
      throw error;
    }
    return (data ?? []) as PropertyContractWithCompany[];
  } catch (err) {
    console.error("[usePropertyContracts] fetchPropertyContracts:", err);
    throw err;
  }
}

export function usePropertyContracts(
  locationId: string,
  options?: { enabled?: boolean },
): UseQueryResult<PropertyContractWithCompany[], Error> {
  return useQuery({
    queryKey: propertyContractsQueryKey(locationId),
    queryFn: () => fetchPropertyContracts(locationId),
    enabled: (options?.enabled ?? true) && Boolean(locationId),
    staleTime: 30_000,
  });
}

type ContractInsert = Database["public"]["Tables"]["property_contracts"]["Insert"];
type ContractUpdate = Database["public"]["Tables"]["property_contracts"]["Update"];

export type AddContractVariables = {
  locationId: string;
  values: AddContractFormValues;
};

function buildContractPayload(values: AddContractFormValues): Omit<ContractInsert, "location_id" | "id"> {
  const endTrimmed = values.end_date?.trim();
  return {
    company_id: values.company_id,
    type: values.type,
    contract_number: values.contract_number.trim(),
    start_date: values.start_date,
    end_date: endTrimmed && endTrimmed.length > 0 ? endTrimmed : null,
    net_value: values.net_value,
    vat_rate: values.vat_rate,
    gross_value: values.gross_value,
    custom_type_name:
      values.type === "other" ? values.custom_type_name?.trim() ?? null : null,
    notice_period_months:
      values.notice_period_months === undefined ? null : values.notice_period_months,
    currency: "PLN",
    document_url: "",
  };
}

async function insertPropertyContract({ locationId, values }: AddContractVariables): Promise<void> {
  try {
    const row: ContractInsert = {
      ...buildContractPayload(values),
      location_id: locationId,
    };

    const { error } = await supabase.from("property_contracts").insert(row);
    if (error) {
      console.error("[useAddContract] insert:", error);
      throw error;
    }
  } catch (err) {
    console.error("[useAddContract] insertPropertyContract:", err);
    throw err;
  }
}

export function useAddContract(): UseMutationResult<void, Error, AddContractVariables> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: insertPropertyContract,
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["contracts", variables.locationId] });
      void queryClient.invalidateQueries({ queryKey: allContractsQueryKey });
    },
  });
}

export type UpdateContractVariables = {
  id: string;
  locationId: string;
  values: AddContractFormValues;
};

async function updatePropertyContract({ id, values }: UpdateContractVariables): Promise<void> {
  try {
    const payload = buildContractPayload(values);
    const row: ContractUpdate = {
      company_id: payload.company_id,
      type: payload.type,
      contract_number: payload.contract_number,
      start_date: payload.start_date,
      end_date: payload.end_date,
      net_value: payload.net_value,
      vat_rate: payload.vat_rate,
      gross_value: payload.gross_value,
      custom_type_name: payload.custom_type_name,
      notice_period_months: payload.notice_period_months,
      currency: payload.currency,
    };

    const { error } = await supabase.from("property_contracts").update(row).eq("id", id);
    if (error) {
      console.error("[useUpdateContract] update:", error);
      throw error;
    }
  } catch (err) {
    console.error("[useUpdateContract] updatePropertyContract:", err);
    throw err;
  }
}

export function useUpdateContract(): UseMutationResult<void, Error, UpdateContractVariables> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updatePropertyContract,
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["contracts", variables.locationId] });
      void queryClient.invalidateQueries({ queryKey: allContractsQueryKey });
    },
  });
}

export type DeleteContractVariables = {
  id: string;
  locationId: string;
};

async function deletePropertyContract({ id }: DeleteContractVariables): Promise<void> {
  try {
    const { error } = await supabase.from("property_contracts").delete().eq("id", id);
    if (error) {
      console.error("[useDeleteContract] delete:", error);
      throw error;
    }
  } catch (err) {
    console.error("[useDeleteContract] deletePropertyContract:", err);
    throw err;
  }
}

export function useDeleteContract(): UseMutationResult<void, Error, DeleteContractVariables> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deletePropertyContract,
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["contracts", variables.locationId] });
      void queryClient.invalidateQueries({ queryKey: allContractsQueryKey });
    },
  });
}
