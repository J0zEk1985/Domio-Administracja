import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/sonner";

export const LOCATION_ISSUE_VENDORS_QUERY_ROOT = "location-issue-vendors" as const;

export function locationIssueVendorsQueryKey(locationId: string): readonly [
  typeof LOCATION_ISSUE_VENDORS_QUERY_ROOT,
  string,
] {
  return [LOCATION_ISSUE_VENDORS_QUERY_ROOT, locationId];
}

export type LocationIssueVendor = {
  id: string;
  location_id: string;
  vendor_id: string;
  vendor_name: string;
  contact_email: string | null;
};

type VendorJoin = { name: string | null; contact_email: string | null } | null;

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "Operacja nie powiodła się.";
}

function isUniqueConstraintViolation(err: unknown): boolean {
  if (err && typeof err === "object" && "code" in err) {
    if (String((err as { code: unknown }).code) === "23505") return true;
  }
  const msg = errMessage(err).toLowerCase();
  return msg.includes("duplicate key") || msg.includes("unique constraint");
}

async function fetchLocationIssueVendors(locationId: string): Promise<LocationIssueVendor[]> {
  const { data, error } = await supabase
    .from("location_issue_vendors")
    .select("id, location_id, vendor_id, vendor:vendor_partners(name, contact_email)")
    .eq("location_id", locationId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[useLocationIssueVendors] select:", error);
    throw error;
  }

  return (data ?? []).map((row) => {
    const joined = row.vendor as VendorJoin | VendorJoin[];
    const vendor = Array.isArray(joined) ? joined[0] ?? null : joined;
    return {
      id: row.id,
      location_id: row.location_id,
      vendor_id: row.vendor_id,
      vendor_name: vendor?.name?.trim() || "—",
      contact_email: vendor?.contact_email ?? null,
    };
  });
}

export function useLocationIssueVendors(locationId: string | null | undefined, enabled: boolean = true) {
  return useQuery({
    queryKey: locationId
      ? locationIssueVendorsQueryKey(locationId)
      : [LOCATION_ISSUE_VENDORS_QUERY_ROOT, "disabled"],
    queryFn: () => fetchLocationIssueVendors(locationId!),
    enabled: Boolean(locationId) && enabled,
    staleTime: 30_000,
  });
}

export type AddLocationIssueVendorVars = {
  locationId: string;
  vendorId: string;
};

export function useAddLocationIssueVendor() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ locationId, vendorId }: AddLocationIssueVendorVars) => {
      const { data: orgId, error: orgErr } = await supabase.rpc("get_my_org_id_safe");
      if (orgErr) {
        console.error("[useAddLocationIssueVendor] get_my_org_id_safe:", orgErr);
        throw orgErr;
      }
      if (!orgId || String(orgId).trim() === "") {
        throw new Error("Brak kontekstu organizacji.");
      }

      const { error } = await supabase.from("location_issue_vendors").insert({
        location_id: locationId,
        vendor_id: vendorId,
        org_id: String(orgId),
      });

      if (error) {
        console.error("[useAddLocationIssueVendor] insert:", error);
        throw error;
      }
    },
    onError: (err) => {
      if (isUniqueConstraintViolation(err)) {
        toast.error("Ta firma jest już podpięta pod budynek.");
        console.error("[useAddLocationIssueVendor] unique:", err);
        return;
      }
      toast.error(errMessage(err));
      console.error("[useAddLocationIssueVendor]", err);
    },
    onSuccess: async (_data, vars) => {
      toast.success("Firma podpięta pod budynek.");
      await qc.invalidateQueries({ queryKey: locationIssueVendorsQueryKey(vars.locationId) });
    },
  });
}

export type RemoveLocationIssueVendorVars = {
  rowId: string;
  locationId: string;
};

export function useRemoveLocationIssueVendor() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ rowId }: RemoveLocationIssueVendorVars) => {
      const { error } = await supabase.from("location_issue_vendors").delete().eq("id", rowId);
      if (error) {
        console.error("[useRemoveLocationIssueVendor] delete:", error);
        throw error;
      }
    },
    onError: (err) => {
      toast.error(errMessage(err));
      console.error("[useRemoveLocationIssueVendor]", err);
    },
    onSuccess: async (_data, vars) => {
      toast.success("Firma odpięta od budynku.");
      await qc.invalidateQueries({ queryKey: locationIssueVendorsQueryKey(vars.locationId) });
    },
  });
}
