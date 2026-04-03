import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
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

export type AddContractVariables = {
  locationId: string;
  values: AddContractFormValues;
};

async function insertPropertyContract({ locationId, values }: AddContractVariables): Promise<void> {
  try {
    const endTrimmed = values.end_date?.trim();
    const row: ContractInsert = {
      location_id: locationId,
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
    },
  });
}
