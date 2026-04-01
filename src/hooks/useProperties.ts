import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { getOrgAndActor, hasLocationAdministrationAccess } from "@/lib/orgAccess";
import {
  mergeVisibilityConfigWithAdminData,
  parsePropertyAdminData,
  type PropertyAdminData,
} from "@/types/propertyAdminData";

const STALE_MS = 0;
const GC_MS = 30_000;

export type { PropertyAdminData };

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
  const actor = await getOrgAndActor();
  const { orgId, isOwner, userId } = actor;

  let locs: { id: string; name: string | null; address: string }[] | null = null;

  if (isOwner) {
    const { data, error } = await supabase
      .from("cleaning_locations")
      .select("id, name, address")
      .eq("org_id", orgId)
      .eq("is_admin_active", true)
      .order("name", { ascending: true });
    if (error) {
      console.error("[useProperties] cleaning_locations:", error);
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
      console.error("[useProperties] location_access:", accErr);
      throw accErr;
    }

    const locationIds = [...new Set((accessRows ?? []).map((a) => a.location_id).filter(Boolean))] as string[];
    if (locationIds.length === 0) {
      return [];
    }

    const { data, error } = await supabase
      .from("cleaning_locations")
      .select("id, name, address")
      .eq("org_id", orgId)
      .eq("is_admin_active", true)
      .in("id", locationIds)
      .order("name", { ascending: true });
    if (error) {
      console.error("[useProperties] cleaning_locations:", error);
      throw error;
    }
    locs = data;
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
    console.error("[useProperties] location_access counts:", accErr);
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
  adminData: PropertyAdminData;
  /** `cleaning_locations.board_portal_token` — public board portal URL. */
  boardPortalToken: string;
  /** `cleaning_locations.public_report_token` — resident issue form URL. */
  publicReportToken: string;
};

async function fetchPropertyById(propertyId: string): Promise<PropertyDetail> {
  const actor = await getOrgAndActor();

  const { data: row, error } = await supabase
    .from("cleaning_locations")
    .select(
      "id, name, address, org_id, is_admin_active, square_meters, visibility_config, board_portal_token, public_report_token",
    )
    .eq("id", propertyId)
    .eq("org_id", actor.orgId)
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

  if (!actor.isOwner) {
    const ok = await hasLocationAdministrationAccess(actor.userId, propertyId);
    if (!ok) {
      throw new Error("Nie znaleziono nieruchomości lub brak dostępu.");
    }
  }

  const adminData = parsePropertyAdminData(row.visibility_config, row.square_meters);

  return {
    id: row.id,
    name: row.name?.trim() || "—",
    address: row.address?.trim() || "—",
    adminData,
    boardPortalToken: row.board_portal_token ?? "",
    publicReportToken: row.public_report_token ?? "",
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
  membershipId: string | null;
  fullName: string;
  email: string;
};

async function fetchPropertyAdministrators(propertyId: string): Promise<PropertyAdministratorRow[]> {
  const actor = await getOrgAndActor();

  const { data: loc, error: lErr } = await supabase
    .from("cleaning_locations")
    .select("id, is_admin_active")
    .eq("id", propertyId)
    .eq("org_id", actor.orgId)
    .maybeSingle();

  if (lErr) {
    console.error("[usePropertyAdministrators] cleaning_locations:", lErr);
    throw lErr;
  }
  if (!loc) {
    throw new Error("Brak dostępu do tej nieruchomości.");
  }
  if (loc.is_admin_active !== true) {
    throw new Error("Nieruchomość nie jest aktywna w module Administracja.");
  }

  if (!actor.isOwner) {
    const ok = await hasLocationAdministrationAccess(actor.userId, propertyId);
    if (!ok) {
      throw new Error("Brak dostępu do tej nieruchomości.");
    }
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

  const { data: mems, error: memErr } = await supabase
    .from("memberships")
    .select("id, user_id")
    .eq("org_id", actor.orgId)
    .in("user_id", userIds)
    .eq("is_active", true);

  if (memErr) {
    console.error("[usePropertyAdministrators] memberships:", memErr);
    throw memErr;
  }

  const membershipByUser = new Map<string, string>();
  for (const m of mems ?? []) {
    if (m.user_id && !membershipByUser.has(m.user_id)) {
      membershipByUser.set(m.user_id, m.id);
    }
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
      membershipId: membershipByUser.get(a.user_id) ?? null,
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

async function updatePropertyAdminDataRequest(propertyId: string, adminData: PropertyAdminData): Promise<void> {
  const actor = await getOrgAndActor();
  if (!actor.isOwner) {
    throw new Error("Tylko właściciel organizacji może zapisywać konfigurację.");
  }

  const { data: row, error: fetchErr } = await supabase
    .from("cleaning_locations")
    .select("visibility_config, org_id, is_admin_active")
    .eq("id", propertyId)
    .eq("org_id", actor.orgId)
    .maybeSingle();

  if (fetchErr) {
    console.error("[updatePropertyAdminData] fetch:", fetchErr);
    throw fetchErr;
  }
  if (!row || row.is_admin_active !== true) {
    throw new Error("Nie znaleziono nieruchomości lub brak dostępu.");
  }

  const nextConfig = mergeVisibilityConfigWithAdminData(row.visibility_config, adminData);

  const { error: upErr } = await supabase
    .from("cleaning_locations")
    .update({ visibility_config: nextConfig })
    .eq("id", propertyId)
    .eq("org_id", actor.orgId);

  if (upErr) {
    console.error("[updatePropertyAdminData] update:", upErr);
    throw upErr;
  }
}

export function useUpdatePropertyAdminData(propertyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (adminData: PropertyAdminData) => {
      if (!propertyId) throw new Error("Brak identyfikatora nieruchomości.");
      return updatePropertyAdminDataRequest(propertyId, adminData);
    },
    onSuccess: async () => {
      if (propertyId) {
        await qc.invalidateQueries({ queryKey: propertyQueryKey(propertyId) });
      }
    },
    onError: (e: unknown) => {
      console.error("[useUpdatePropertyAdminData]", e);
    },
  });
}
