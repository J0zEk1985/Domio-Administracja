import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { mapMembershipRoleToPolish } from "@/lib/membershipRolePl";
import { toast } from "@/components/ui/sonner";

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

/** Eksportowany klucz React Query — używany także przy invalidacji po dodaniu członka. */
export const TEAM_MEMBERS_QUERY_KEY = "team-members" as const;

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
    queryKey: [TEAM_MEMBERS_QUERY_KEY],
    queryFn: fetchTeamMembers,
    enabled,
    staleTime: TEAM_STALE_MS,
    gcTime: TEAM_GC_MS,
  });
}

function isOwnerRoleCode(role: string): boolean {
  return role.trim().toLowerCase() === "owner";
}

/** Soft-deletes an org membership (`is_active = false`) and drops building access. */
export async function deactivateTeamMember(membershipId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Brak sesji.");
  }

  const { data: orgId, error: orgErr } = await supabase.rpc("get_my_org_id_safe");
  if (orgErr) {
    console.error("[deactivateTeamMember] get_my_org_id_safe:", orgErr);
    throw orgErr;
  }
  if (!orgId || String(orgId).trim() === "") {
    throw new Error("Brak organizacji.");
  }

  const { data: row, error: rowErr } = await supabase
    .from("memberships")
    .select("id, user_id, role, is_active")
    .eq("id", membershipId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (rowErr) {
    console.error("[deactivateTeamMember] load membership:", rowErr);
    throw rowErr;
  }
  if (!row || row.is_active === false) {
    throw new Error("Nie znaleziono aktywnego pracownika.");
  }
  if (row.user_id === user.id) {
    throw new Error("Nie możesz usunąć własnego konta z zespołu.");
  }

  if (isOwnerRoleCode(row.role ?? "")) {
    const { count, error: countErr } = await supabase
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("is_active", true)
      .eq("role", "owner");

    if (countErr) {
      console.error("[deactivateTeamMember] count owners:", countErr);
      throw countErr;
    }
    if ((count ?? 0) <= 1) {
      throw new Error("Nie można usunąć ostatniego właściciela organizacji.");
    }
  }

  const { data: updated, error: updErr } = await supabase
    .from("memberships")
    .update({ is_active: false })
    .eq("id", membershipId)
    .eq("org_id", orgId)
    .eq("is_active", true)
    .select("id");

  if (updErr) {
    console.error("[deactivateTeamMember] update:", updErr);
    throw updErr;
  }
  if (!updated || updated.length === 0) {
    throw new Error("Nie udało się usunąć pracownika. Sprawdź uprawnienia.");
  }

  const { data: locations, error: locErr } = await supabase
    .from("cleaning_locations")
    .select("id")
    .eq("org_id", orgId);

  if (locErr) {
    console.error("[deactivateTeamMember] locations:", locErr);
    return;
  }
  const locationIds = (locations ?? []).map((l) => l.id).filter(Boolean);
  if (locationIds.length === 0) return;

  const { error: accErr } = await supabase
    .from("location_access")
    .delete()
    .eq("user_id", row.user_id)
    .eq("access_type", "administration")
    .in("location_id", locationIds);

  if (accErr) {
    console.error("[deactivateTeamMember] location_access:", accErr);
  }
}

export function useDeactivateTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (membershipId: string) => deactivateTeamMember(membershipId),
    onSuccess: () => {
      toast.success("Pracownik został usunięty z zespołu.");
      void qc.invalidateQueries({ queryKey: [TEAM_MEMBERS_QUERY_KEY] });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Nie udało się usunąć pracownika.";
      toast.error(msg);
      console.error("[useDeactivateTeamMember]", e);
    },
  });
}
