import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { mapMembershipRoleToPolish } from "@/lib/membershipRolePl";

export const ORG_ASSIGNABLE_STAFF_QUERY_KEY = "org-assignable-staff" as const;

export type AssignableStaffRow = {
  userId: string;
  fullName: string;
  email: string;
  roleCode: string;
  roleLabelPl: string;
};

async function fetchAssignableStaff(): Promise<AssignableStaffRow[]> {
  const { data: orgId, error: orgErr } = await supabase.rpc("get_my_org_id_safe");
  if (orgErr) {
    console.error("[useOrgAssignableStaff] get_my_org_id_safe:", orgErr);
    throw orgErr;
  }
  if (!orgId || String(orgId).trim() === "") {
    return [];
  }

  const { data: memberships, error: memErr } = await supabase
    .from("memberships")
    .select("user_id, role")
    .eq("org_id", String(orgId))
    .eq("is_active", true);

  if (memErr) {
    console.error("[useOrgAssignableStaff] memberships:", memErr);
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
    console.error("[useOrgAssignableStaff] profiles:", profErr);
    throw profErr;
  }

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  return rows.map((m) => {
    const p = profileById.get(m.user_id);
    const email = p?.email?.trim() || p?.contact_email?.trim() || "—";
    const fullName = p?.full_name?.trim() || "—";
    const roleCode = m.role?.trim() ?? "";
    return {
      userId: m.user_id,
      fullName,
      email,
      roleCode,
      roleLabelPl: mapMembershipRoleToPolish(roleCode),
    };
  });
}

export function useOrgAssignableStaff(enabled: boolean = true) {
  return useQuery({
    queryKey: [ORG_ASSIGNABLE_STAFF_QUERY_KEY],
    queryFn: fetchAssignableStaff,
    enabled,
    staleTime: 30_000,
  });
}
