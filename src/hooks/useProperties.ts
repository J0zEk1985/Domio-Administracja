import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

const STALE_MS = 0;
const GC_MS = 30_000;

export const PROPERTIES_QUERY_KEY = "properties" as const;

export const propertyQueryKey = (propertyId: string) => ["property", propertyId] as const;

export const propertyAdministratorsQueryKey = (propertyId: string) =>
  ["property-administrators", propertyId] as const;

export type PropertyListRow = {
  id: string;
  name: string;
  address: string;
  adminCount: number;
};

async function fetchProperties(): Promise<PropertyListRow[]> {
  const { data: orgId, error: orgErr } = await supabase.rpc("get_my_org_id_safe");
  if (orgErr) {
    console.error("[useProperties] get_my_org_id_safe:", orgErr);
    throw orgErr;
  }
  if (!orgId || String(orgId).trim() === "") {
    return [];
  }

  const { data: locs, error: locErr } = await supabase
    .from("cleaning_locations")
    .select("id, name, address")
    .eq("org_id", orgId)
    .eq("is_admin_active", true)
    .order("name", { ascending: true });

  if (locErr) {
    console.error("[useProperties] cleaning_locations:", locErr);
    throw locErr;
  }

  const rows = locs ?? [];
  if (rows.length === 0) {
    return [];
  }

  const ids = rows.map((r) => r.id);
  const { data: accessRows, error: accErr } = await supabase
    .from("location_access")
    .select("location_id, user_id")
    .in("location_id", ids)
    .eq("access_type", "administration");

  if (accErr) {
    console.error("[useProperties] location_access:", accErr);
    throw accErr;
  }

  const distinctUsersByLoc = new Map<string, Set<string>>();
  for (const a of accessRows ?? []) {
    if (!a.location_id || !a.user_id) continue;
    let set = distinctUsersByLoc.get(a.location_id);
    if (!set) {
      set = new Set();
      distinctUsersByLoc.set(a.location_id, set);
    }
    set.add(a.user_id);
  }

  return rows.map((l) => ({
    id: l.id,
    name: l.name?.trim() || "—",
    address: l.address?.trim() || "—",
    adminCount: distinctUsersByLoc.get(l.id)?.size ?? 0,
  }));
}

export function useProperties(enabled: boolean = true) {
  return useQuery({
    queryKey: [PROPERTIES_QUERY_KEY],
    queryFn: fetchProperties,
    enabled,
    staleTime: STALE_MS,
    gcTime: GC_MS,
    refetchOnMount: "always",
  });
}

export type PropertyDetail = {
  id: string;
  name: string;
  address: string;
};

async function fetchPropertyById(propertyId: string): Promise<PropertyDetail> {
  const { data: orgId, error: orgErr } = await supabase.rpc("get_my_org_id_safe");
  if (orgErr) {
    console.error("[useProperty] get_my_org_id_safe:", orgErr);
    throw orgErr;
  }
  if (!orgId || String(orgId).trim() === "") {
    throw new Error("Brak organizacji.");
  }

  const { data: row, error } = await supabase
    .from("cleaning_locations")
    .select("id, name, address, org_id, is_admin_active")
    .eq("id", propertyId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) {
    console.error("[useProperty] cleaning_locations:", error);
    throw error;
  }
  if (!row) {
    throw new Error("Nie znaleziono nieruchomości lub brak dostępu.");
  }
  if (row.is_admin_active !== true) {
    throw new Error("Nieruchomość nie jest aktywna w module Administracja.");
  }

  return {
    id: row.id,
    name: row.name?.trim() || "—",
    address: row.address?.trim() || "—",
  };
}

export function useProperty(propertyId: string | undefined, enabled: boolean = true) {
  return useQuery({
    queryKey: propertyId ? propertyQueryKey(propertyId) : ["property", "none"],
    queryFn: () => fetchPropertyById(propertyId!),
    enabled: Boolean(propertyId && enabled),
    staleTime: STALE_MS,
    gcTime: GC_MS,
    refetchOnMount: "always",
  });
}

export type PropertyAdministratorRow = {
  accessId: string;
  userId: string;
  fullName: string;
  email: string;
};

async function fetchPropertyAdministrators(propertyId: string): Promise<PropertyAdministratorRow[]> {
  const { data: orgId, error: orgErr } = await supabase.rpc("get_my_org_id_safe");
  if (orgErr) {
    console.error("[usePropertyAdministrators] get_my_org_id_safe:", orgErr);
    throw orgErr;
  }
  if (!orgId || String(orgId).trim() === "") {
    throw new Error("Brak organizacji.");
  }

  const { data: loc, error: lErr } = await supabase
    .from("cleaning_locations")
    .select("id")
    .eq("id", propertyId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (lErr) {
    console.error("[usePropertyAdministrators] cleaning_locations:", lErr);
    throw lErr;
  }
  if (!loc) {
    throw new Error("Brak dostępu do tej nieruchomości.");
  }

  const { data: access, error: aErr } = await supabase
    .from("location_access")
    .select("id, user_id")
    .eq("location_id", propertyId)
    .eq("access_type", "administration");

  if (aErr) {
    console.error("[usePropertyAdministrators] location_access:", aErr);
    throw aErr;
  }

  const accessList = (access ?? []).filter((a): a is { id: string; user_id: string } =>
    Boolean(a.id && a.user_id),
  );

  const userIds = [...new Set(accessList.map((a) => a.user_id))];
  if (userIds.length === 0) {
    return [];
  }

  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("id, full_name, email, contact_email")
    .in("id", userIds);

  if (pErr) {
    console.error("[usePropertyAdministrators] profiles:", pErr);
    throw pErr;
  }

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const seenUser = new Set<string>();
  const out: PropertyAdministratorRow[] = [];
  for (const a of accessList) {
    if (seenUser.has(a.user_id)) continue;
    seenUser.add(a.user_id);
    const p = profileById.get(a.user_id);
    out.push({
      accessId: a.id,
      userId: a.user_id,
      fullName: p?.full_name?.trim() || "—",
      email: p?.email?.trim() || p?.contact_email?.trim() || "—",
    });
  }

  return out.sort((x, y) => x.fullName.localeCompare(y.fullName, "pl", { sensitivity: "base" }));
}

export function usePropertyAdministrators(propertyId: string | undefined, enabled: boolean = true) {
  return useQuery({
    queryKey: propertyId ? propertyAdministratorsQueryKey(propertyId) : ["property-administrators", "none"],
    queryFn: () => fetchPropertyAdministrators(propertyId!),
    enabled: Boolean(propertyId && enabled),
    staleTime: STALE_MS,
    gcTime: GC_MS,
    refetchOnMount: "always",
  });
}
