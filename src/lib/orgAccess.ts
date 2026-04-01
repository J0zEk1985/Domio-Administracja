import { supabase } from "@/lib/supabase";

export type OrgActor = {
  orgId: string;
  userId: string;
  isOwner: boolean;
};

/**
 * Current session user + org + whether they hold the owner role in the active org.
 */
export async function getOrgAndActor(): Promise<OrgActor> {
  const {
    data: { user },
    error: uErr,
  } = await supabase.auth.getUser();
  if (uErr) {
    console.error("[getOrgAndActor] getUser:", uErr);
  }
  if (!user) {
    throw new Error("Brak sesji.");
  }

  const { data: orgId, error: orgErr } = await supabase.rpc("get_my_org_id_safe");
  if (orgErr) {
    console.error("[getOrgAndActor] get_my_org_id_safe:", orgErr);
    throw orgErr;
  }
  if (!orgId || String(orgId).trim() === "") {
    throw new Error("Brak organizacji.");
  }

  const oid = String(orgId);
  const { data: memRows, error: mErr } = await supabase
    .from("memberships")
    .select("role")
    .eq("org_id", oid)
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (mErr) {
    console.error("[getOrgAndActor] memberships:", mErr);
    throw mErr;
  }

  const isOwner = (memRows ?? []).some((r) => r.role?.trim().toLowerCase() === "owner");
  return { orgId: oid, userId: user.id, isOwner };
}

export async function hasLocationAdministrationAccess(userId: string, locationId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("location_access")
    .select("id")
    .eq("location_id", locationId)
    .eq("user_id", userId)
    .eq("access_type", "administration")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[hasLocationAdministrationAccess]", error);
    throw error;
  }
  return data != null;
}
