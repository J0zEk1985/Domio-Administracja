import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export const VENDOR_PARTNERS_QUERY_KEY = "vendor-partners" as const;

export type VendorPartnerRow = {
  id: string;
  name: string;
  service_type: string;
  contact_email: string | null;
  dispatch_channel: "in_app" | "email" | null;
};

/**
 * All vendor_partners for the current org — org_id only (no category/status filters).
 * Maps 1:1 to `inspection_campaigns.vendor_id`.
 */
export async function fetchOrgVendorPartners(): Promise<VendorPartnerRow[]> {
  const { data: orgId, error: orgErr } = await supabase.rpc("get_my_org_id_safe");
  if (orgErr) {
    console.error("[fetchOrgVendorPartners] get_my_org_id_safe:", orgErr);
    throw orgErr;
  }
  if (!orgId || String(orgId).trim() === "") {
    return [];
  }

  const { data, error } = await supabase
    .from("vendor_partners")
    .select("id, name, service_type, contact_email, dispatch_channel")
    .eq("org_id", String(orgId))
    .order("name", { ascending: true });

  if (error) {
    console.error("[fetchOrgVendorPartners] vendor_partners:", error);
    throw error;
  }

  return ((data ?? []) as VendorPartnerRow[]).map((row) => ({
    ...row,
    contact_email: row.contact_email ?? null,
    dispatch_channel: row.dispatch_channel === "email" ? "email" : "in_app",
  }));
}

export function useVendorPartners(enabled: boolean = true) {
  return useQuery({
    queryKey: [VENDOR_PARTNERS_QUERY_KEY],
    queryFn: fetchOrgVendorPartners,
    enabled,
    staleTime: 60_000,
  });
}
