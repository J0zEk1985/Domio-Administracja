import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type OrgOwnerAccess = {
  isOwner: boolean;
  /** Raw `memberships.role` for current org, if found */
  membershipRole: string | null;
};

async function fetchOrgOwnerAccess(): Promise<OrgOwnerAccess> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { isOwner: false, membershipRole: null };
  }

  const { data: orgId, error: orgErr } = await supabase.rpc("get_my_org_id_safe");
  if (orgErr) {
    console.error("[useIsOrgOwner] get_my_org_id_safe:", orgErr);
    throw orgErr;
  }
  if (!orgId || String(orgId).trim() === "") {
    return { isOwner: false, membershipRole: null };
  }

  const { data: rows, error: memErr } = await supabase
    .from("memberships")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (memErr) {
    console.error("[useIsOrgOwner] memberships:", memErr);
    throw memErr;
  }

  const list = rows ?? [];
  const ownerRow = list.find((r) => r.role?.trim().toLowerCase() === "owner");
  const primaryRole = ownerRow?.role ?? list[0]?.role ?? null;
  return {
    isOwner: ownerRow != null,
    membershipRole: primaryRole,
  };
}

export function useIsOrgOwner() {
  return useQuery({
    queryKey: ["my-org-owner-access"],
    queryFn: fetchOrgOwnerAccess,
    staleTime: 60_000,
  });
}
