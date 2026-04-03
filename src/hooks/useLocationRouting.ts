import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/sonner";
import type { Database } from "@/types/supabase";

export const LOCATION_VENDOR_ROUTING_QUERY_ROOT = "location-vendor-routing" as const;

export function locationVendorRoutingQueryKey(locationId: string): readonly [
  typeof LOCATION_VENDOR_ROUTING_QUERY_ROOT,
  string,
] {
  return [LOCATION_VENDOR_ROUTING_QUERY_ROOT, locationId];
}

type RoutingRow = Database["public"]["Tables"]["location_vendor_routing"]["Row"];

export type LocationRoutingRule = RoutingRow & {
  vendor: { name: string | null } | null;
};

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "Operacja nie powiodła się.";
}

function isUniqueConstraintViolation(err: unknown): boolean {
  if (err && typeof err === "object" && "code" in err) {
    const code = String((err as { code: unknown }).code);
    if (code === "23505") return true;
  }
  const msg = errMessage(err).toLowerCase();
  return msg.includes("duplicate key") || msg.includes("unique constraint");
}

async function fetchLocationRoutingRules(locationId: string): Promise<LocationRoutingRule[]> {
  const { data, error } = await supabase
    .from("location_vendor_routing")
    .select("*, vendor:vendor_partners(name)")
    .eq("location_id", locationId)
    .order("issue_category", { ascending: true });

  if (error) {
    console.error("[useLocationRouting] select:", error);
    throw error;
  }

  return (data ?? []) as LocationRoutingRule[];
}

export function useLocationRoutingRules(locationId: string | undefined, enabled: boolean = true) {
  return useQuery({
    queryKey: locationId ? locationVendorRoutingQueryKey(locationId) : ["location-vendor-routing", "disabled"],
    queryFn: () => fetchLocationRoutingRules(locationId!),
    enabled: Boolean(locationId) && enabled,
    staleTime: 30_000,
  });
}

export type AddRoutingRuleVars = {
  locationId: string;
  issueCategory: string;
  vendorId: string;
};

export function useAddRoutingRule() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ locationId, issueCategory, vendorId }: AddRoutingRuleVars) => {
      const { data: orgId, error: orgErr } = await supabase.rpc("get_my_org_id_safe");
      if (orgErr) {
        console.error("[useAddRoutingRule] get_my_org_id_safe:", orgErr);
        throw orgErr;
      }
      if (!orgId || String(orgId).trim() === "") {
        throw new Error("Brak kontekstu organizacji.");
      }

      const { error } = await supabase.from("location_vendor_routing").insert({
        location_id: locationId,
        issue_category: issueCategory.trim(),
        vendor_id: vendorId,
        org_id: String(orgId),
      });

      if (error) {
        console.error("[useAddRoutingRule] insert:", error);
        throw error;
      }
    },
    onError: (err) => {
      if (isUniqueConstraintViolation(err)) {
        toast.error("Reguła dla tej kategorii już istnieje na tym budynku.");
        console.error("[useAddRoutingRule] unique:", err);
        return;
      }
      toast.error(errMessage(err));
      console.error("[useAddRoutingRule]", err);
    },
    onSuccess: async (_data, vars) => {
      toast.success("Reguła dodana.");
      await qc.invalidateQueries({ queryKey: locationVendorRoutingQueryKey(vars.locationId) });
    },
  });
}

export type DeleteRoutingRuleVars = {
  ruleId: string;
  locationId: string;
};

export function useDeleteRoutingRule() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ ruleId }: DeleteRoutingRuleVars) => {
      const { error } = await supabase.from("location_vendor_routing").delete().eq("id", ruleId);

      if (error) {
        console.error("[useDeleteRoutingRule] delete:", error);
        throw error;
      }
    },
    onError: (err) => {
      toast.error(errMessage(err));
      console.error("[useDeleteRoutingRule]", err);
    },
    onSuccess: async (_data, vars) => {
      toast.success("Reguła usunięta.");
      await qc.invalidateQueries({ queryKey: locationVendorRoutingQueryKey(vars.locationId) });
    },
  });
}
