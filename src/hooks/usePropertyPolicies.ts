import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import type { InsurancePolicyFormValues } from "@/schemas/policySchema";
import { supabase } from "@/lib/supabase";
import type { PropertyPolicy } from "@/types/contracts";
import type { Database } from "@/types/supabase";

export type PropertyPolicyWithCompany = PropertyPolicy;

export const propertyPoliciesQueryKey = (locationId: string) =>
  ["property_policies", locationId] as const;

async function fetchPropertyPolicies(locationId: string): Promise<PropertyPolicyWithCompany[]> {
  try {
    const { data, error } = await supabase
      .from("property_policies")
      .select("*, company:companies(*)")
      .eq("location_id", locationId)
      .order("end_date", { ascending: false });

    if (error) {
      console.error("[usePropertyPolicies] fetchPropertyPolicies:", error);
      throw error;
    }
    return (data ?? []) as PropertyPolicyWithCompany[];
  } catch (err) {
    console.error("[usePropertyPolicies] fetchPropertyPolicies:", err);
    throw err;
  }
}

export function usePropertyPolicies(
  locationId: string,
  options?: { enabled?: boolean },
): UseQueryResult<PropertyPolicyWithCompany[], Error> {
  return useQuery({
    queryKey: propertyPoliciesQueryKey(locationId),
    queryFn: () => fetchPropertyPolicies(locationId),
    enabled: (options?.enabled ?? true) && Boolean(locationId),
    staleTime: 30_000,
  });
}

type PolicyInsert = Database["public"]["Tables"]["property_policies"]["Insert"];

export type AddPropertyPolicyVariables = {
  locationId: string;
  values: InsurancePolicyFormValues;
};

async function insertPropertyPolicy({ locationId, values }: AddPropertyPolicyVariables): Promise<void> {
  try {
    const doc = values.document_url?.trim() ?? "";
    const row: PolicyInsert = {
      location_id: locationId,
      company_id: values.company_id,
      policy_number: values.policy_number.trim(),
      policy_scope: values.policy_scope,
      premium_amount: values.premium_amount,
      start_date: values.start_date,
      end_date: values.end_date,
      document_url: doc.length > 0 ? doc : "",
      coverage_amount: 0,
    };

    const { error } = await supabase.from("property_policies").insert(row);
    if (error) {
      console.error("[useAddPropertyPolicy] insert:", error);
      throw error;
    }
  } catch (err) {
    console.error("[useAddPropertyPolicy] insertPropertyPolicy:", err);
    throw err;
  }
}

export function useAddPropertyPolicy(): UseMutationResult<void, Error, AddPropertyPolicyVariables> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: insertPropertyPolicy,
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: propertyPoliciesQueryKey(variables.locationId),
      });
    },
  });
}
