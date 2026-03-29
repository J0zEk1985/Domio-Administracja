import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { mapMembershipRoleToPolish } from "@/lib/membershipRolePl";

/** Roles shown on the Team page (administrative); excludes cleaner, driver, etc. */
export const TEAM_ADMIN_ROLES = ["owner", "admin", "coordinator", "assistant", "accountant"] as const;

export type TeamMemberRow = {
  membershipId: string;
  userId: string;
  fullName: string;
  email: string;
  /** Raw value from `memberships.role` */
  roleCode: string;
  /** Polish label for UI */
  roleLabelPl: string;
};

const TEAM_QUERY_KEY = "team-members" as const;

/** Short cache window so leaving the tab drops cached rows quickly (GC-friendly). */
const TEAM_STALE_MS = 0;
const TEAM_GC_MS = 30_000;

async function fetchTeamMembers(): Promise<TeamMemberRow[]> {
  const { data: orgId, error: orgErr } = await supabase.rpc("get_my_org_id_safe");
  if (orgErr) {
    console.error("[useTeamMembers] get_my_org_id_safe:", orgErr);
    throw orgErr;
  }
  if (!orgId || String(orgId).trim() === "") {
    return [];
  }

  const { data: memberships, error: memErr } = await supabase
    .from("memberships")
    .select("id, role, user_id, is_active")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .in("role", [...TEAM_ADMIN_ROLES]);

  if (memErr) {
    console.error("[useTeamMembers] memberships:", memErr);
    throw memErr;
  }
  const rows = memberships ?? [];
  if (rows.length === 0) return [];

  const userIds = [...new Set(rows.map((m) => m.user_id))];
  const { data: profiles, error: profErr } = await supabase
    .from("profiles")
    .select("id, full_name, email, contact_email")
    .in("id", userIds);

  if (profErr) {
    console.error("[useTeamMembers] profiles:", profErr);
    throw profErr;
  }

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  return rows.map((m) => {
    const p = profileById.get(m.user_id);
    const email = p?.email?.trim() || p?.contact_email?.trim() || "—";
    const fullName = p?.full_name?.trim() || "—";
    const roleCode = m.role?.trim() ?? "";
    return {
      membershipId: m.id,
      userId: m.user_id,
      fullName,
      email,
      roleCode,
      roleLabelPl: mapMembershipRoleToPolish(roleCode),
    };
  });
}

export function useTeamMembers(enabled: boolean = true) {
  return useQuery({
    queryKey: [TEAM_QUERY_KEY],
    queryFn: fetchTeamMembers,
    enabled,
    staleTime: TEAM_STALE_MS,
    gcTime: TEAM_GC_MS,
  });
}
