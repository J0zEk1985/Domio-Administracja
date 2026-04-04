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
import type { PropertyResourceScopeOptions } from "@/hooks/usePropertyContracts";

export type PropertyPolicyWithCompany = PropertyPolicy;

function policiesScopeCacheKey(scope?: PropertyResourceScopeOptions | null): string {
  if (!scope?.communityScope) {
    return scope?.parentCommunityId ? `h:${scope.parentCommunityId}` : "default";
  }
  const { communityId, buildingIds } = scope.communityScope;
  return `c:${communityId}:${[...buildingIds].sort().join(",")}`;
}

export const propertyPoliciesQueryKey = (locationId: string, scope?: PropertyResourceScopeOptions | null) =>
  ["property_policies", locationId, policiesScopeCacheKey(scope)] as const;

async function fetchPropertyPolicies(
  locationId: string,
  scope?: PropertyResourceScopeOptions | null,
): Promise<PropertyPolicyWithCompany[]> {
  try {
    let q = supabase.from("property_policies").select("*, company:companies(*)");

    const cs = scope?.communityScope;
    if (cs && cs.communityId) {
      if (cs.buildingIds.length > 0) {
        q = q.or(`community_id.eq.${cs.communityId},location_id.in.(${cs.buildingIds.join(",")})`);
      } else {
        q = q.eq("community_id", cs.communityId);
      }
    } else if (scope?.parentCommunityId) {
      q = q.or(`location_id.eq.${locationId},community_id.eq.${scope.parentCommunityId}`);
    } else {
      q = q.eq("location_id", locationId);
    }

    const { data, error } = await q.order("end_date", { ascending: false });

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
  options?: { enabled?: boolean; scope?: PropertyResourceScopeOptions | null },
): UseQueryResult<PropertyPolicyWithCompany[], Error> {
  const scope = options?.scope ?? null;
  return useQuery({
    queryKey: propertyPoliciesQueryKey(locationId, scope ?? undefined),
    queryFn: () => fetchPropertyPolicies(locationId, scope ?? undefined),
    enabled: (options?.enabled ?? true) && Boolean(locationId),
    staleTime: 30_000,
  });
}

type PolicyInsert = Database["public"]["Tables"]["property_policies"]["Insert"];

export type AddPropertyPolicyVariables = {
  locationId: string;
  values: InsurancePolicyFormValues;
  communityId?: string | null;
};

async function insertPropertyPolicy({
  locationId,
  values,
  communityId,
}: AddPropertyPolicyVariables): Promise<void> {
  try {
    const doc = values.document_url?.trim() ?? "";
    const row: PolicyInsert = {
      location_id: locationId,
      community_id: communityId ?? null,
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
