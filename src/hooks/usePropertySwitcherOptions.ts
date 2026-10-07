import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { getOrgAndActor } from "@/lib/orgAccess";

export type PropertySwitcherOption = {
  id: string;
  name: string;
  address: string;
};

/** Names only. Shares the `properties` prefix so list invalidations mark it stale. */
export const propertySwitcherQueryKey = ["properties", "switcher"] as const;

const SWITCHER_STALE_MS = 60_000;

async function fetchPropertySwitcherOptions(): Promise<PropertySwitcherOption[]> {
  const actor = await getOrgAndActor();
  const { orgId, isOwner, userId } = actor;

  type Row = { id: string; name: string | null; address: string | null };
  let locs: Row[] | null = null;

  if (isOwner) {
    const { data, error } = await supabase
      .from("cleaning_locations")
      .select("id, name, address")
      .eq("org_id", orgId)
      .eq("is_admin_active", true)
      .order("address", { ascending: true });
    if (error) {
      console.error("[usePropertySwitcherOptions] cleaning_locations:", error);
      throw error;
    }
    locs = data;
  } else {
    const { data: accessRows, error: accErr } = await supabase
      .from("location_access")
      .select("location_id")
      .eq("user_id", userId)
      .eq("access_type", "administration");
    if (accErr) {
      console.error("[usePropertySwitcherOptions] location_access:", accErr);
      throw accErr;
    }
    const locationIds = [...new Set((accessRows ?? []).map((row) => row.location_id).filter(Boolean))] as string[];
    if (locationIds.length === 0) return [];

    const { data, error } = await supabase
      .from("cleaning_locations")
      .select("id, name, address")
      .eq("org_id", orgId)
      .eq("is_admin_active", true)
      .in("id", locationIds)
      .order("address", { ascending: true });
    if (error) {
      console.error("[usePropertySwitcherOptions] cleaning_locations:", error);
      throw error;
    }
    locs = data;
  }

  return (locs ?? []).map((row) => ({
    id: row.id,
    name: row.name?.trim() || "",
    address: row.address?.trim() || "",
  }));
}

/** Lightweight building labels for the detail-page switcher. Does not load admins or tab data. */
export function usePropertySwitcherOptions(enabled: boolean) {
  return useQuery({
    queryKey: propertySwitcherQueryKey,
    queryFn: fetchPropertySwitcherOptions,
    enabled,
    staleTime: SWITCHER_STALE_MS,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}
