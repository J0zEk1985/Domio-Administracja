import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/supabase";

export const VENDOR_PARTNERS_QUERY_KEY = "vendor-partners" as const;

export type VendorPartnerRow = Pick<
  Database["public"]["Tables"]["vendor_partners"]["Row"],
  "id" | "name" | "service_type"
>;

export type FetchOrgVendorPartnersOptions = {
  /**
   * When true, only partners considered active (status = active or legacy null).
   * Does not join contracts or filter by location — org scope only.
   */
  activeOnly?: boolean;
  /**
   * When set, restricts to these company categories (column `category` on `vendor_partners`).
   * Omit to load all org partners (no category filter). Use full enum list to mirror “all B2B” explicitly.
   */
  categoriesIn?: Database["public"]["Enums"]["company_category"][];
};

export async function fetchOrgVendorPartners(
  options: FetchOrgVendorPartnersOptions = {},
): Promise<VendorPartnerRow[]> {
  const { data: orgId, error: orgErr } = await supabase.rpc("get_my_org_id_safe");
  if (orgErr) {
    console.error("[fetchOrgVendorPartners] get_my_org_id_safe:", orgErr);
    throw orgErr;
  }
  if (!orgId || String(orgId).trim() === "") {
    return [];
  }

  let query = supabase
    .from("vendor_partners")
    .select("id, name, service_type")
    .eq("org_id", String(orgId))
    .order("name", { ascending: true });

  if (options.activeOnly) {
    query = query.or("status.eq.active,status.is.null");
  }

  if (options.categoriesIn && options.categoriesIn.length > 0) {
    query = query.in("category", options.categoriesIn);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[fetchOrgVendorPartners] vendor_partners:", error);
    throw error;
  }

  return (data ?? []) as VendorPartnerRow[];
}

async function fetchVendorPartners(): Promise<VendorPartnerRow[]> {
  return fetchOrgVendorPartners({ activeOnly: false });
}

export function useVendorPartners(enabled: boolean = true) {
  return useQuery({
    queryKey: [VENDOR_PARTNERS_QUERY_KEY],
    queryFn: fetchVendorPartners,
    enabled,
    staleTime: 60_000,
  });
}
