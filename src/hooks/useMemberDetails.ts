import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { supabase } from "@/lib/supabase";
import { mapMembershipRoleToPolish } from "@/lib/membershipRolePl";
import { TEAM_ADMIN_ROLES, TEAM_MEMBERS_QUERY_KEY } from "@/hooks/useTeamMembers";
import { toast } from "@/components/ui/sonner";
import {
  encodeAdminLeaveDescription,
  parseAdminLeaveDescription,
  type AdminLeavePayload,
} from "@/lib/adminLeaveDescription";

const STALE_MS = 0;
const GC_MS = 30_000;

export const memberDetailsQueryKey = (membershipId: string) => ["member-details", membershipId] as const;
export const memberBuildingsQueryKey = (membershipId: string) => ["member-buildings", membershipId] as const;
export const memberLeavesQueryKey = (membershipId: string) => ["member-leaves", membershipId] as const;

export type MemberDetailsData = {
  membershipId: string;
  userId: string;
  orgId: string;
  roleCode: string;
  roleLabelPl: string;
  fullName: string;
  /** Główny e-mail konta (profiles.email); do wyświetlenia jako stały. */
  authEmail: string;
  /** E-mail do kontaktu (fallback contact_email) — używany m.in. w nagłówku strony. */
  email: string;
  /** Telefon z `profiles.phone`. */
  phone: string;
  isActive: boolean;
};

async function fetchMemberDetails(membershipId: string): Promise<MemberDetailsData> {
  const { data: orgId, error: orgErr } = await supabase.rpc("get_my_org_id_safe");
  if (orgErr) throw orgErr;
  if (!orgId || String(orgId).trim() === "") {
    throw new Error("Brak organizacji.");
  }

  const { data: row, error } = await supabase
    .from("memberships")
    .select("id, user_id, org_id, role, is_active")
    .eq("id", membershipId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw error;
  if (!row) {
    throw new Error("Nie znaleziono pracownika lub brak dostępu.");
  }

  const { data: prof, error: pErr } = await supabase
    .from("profiles")
    .select("full_name, email, contact_email, phone")
    .eq("id", row.user_id)
    .maybeSingle();

  if (pErr) throw pErr;

  const authEmail = prof?.email?.trim() ?? "";
  const email = prof?.email?.trim() || prof?.contact_email?.trim() || "—";
  const fullName = prof?.full_name?.trim() || "—";
  const phone = prof?.phone?.trim() ?? "";
  const roleCode = row.role?.trim() ?? "";

  return {
    membershipId: row.id,
    userId: row.user_id,
    orgId: row.org_id,
    roleCode,
    roleLabelPl: mapMembershipRoleToPolish(roleCode),
    fullName,
    authEmail,
    email,
    phone,
    isActive: row.is_active !== false,
  };
}

export function useMemberDetails(membershipId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: membershipId ? memberDetailsQueryKey(membershipId) : ["member-details", "none"],
    queryFn: () => fetchMemberDetails(membershipId!),
    enabled: Boolean(membershipId && enabled),
    staleTime: STALE_MS,
    gcTime: GC_MS,
    refetchOnMount: "always",
  });
}

export type AdminBuildingRow = {
  id: string;
  name: string;
  address: string;
  accessId: string | null;
};

async function fetchMemberBuildings(membershipId: string): Promise<AdminBuildingRow[]> {
  const detail = await fetchMemberDetails(membershipId);
  const { data: locs, error: locErr } = await supabase
    .from("cleaning_locations")
    .select("id, name, address")
    .eq("org_id", detail.orgId)
    .eq("is_admin_active", true)
    .order("name", { ascending: true });

  if (locErr) throw locErr;

  const { data: accessRows, error: accErr } = await supabase
    .from("location_access")
    .select("id, location_id")
    .eq("user_id", detail.userId);

  if (accErr) throw accErr;

  const accessByLoc = new Map((accessRows ?? []).map((a) => [a.location_id as string, a.id]));

  return (locs ?? []).map((l) => ({
    id: l.id,
    name: l.name?.trim() || "—",
    address: l.address?.trim() || "—",
    accessId: accessByLoc.get(l.id) ?? null,
  }));
}

export function useMemberBuildings(membershipId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: membershipId ? memberBuildingsQueryKey(membershipId) : ["member-buildings", "none"],
    queryFn: () => fetchMemberBuildings(membershipId!),
    enabled: Boolean(membershipId && enabled),
    staleTime: STALE_MS,
    gcTime: GC_MS,
    refetchOnMount: "always",
  });
}

export type LeaveHistoryRow = {
  id: string;
  holidayDate: string;
  payload: AdminLeavePayload;
  createdAt: string | null;
};

async function fetchMemberLeaves(membershipId: string): Promise<LeaveHistoryRow[]> {
  const detail = await fetchMemberDetails(membershipId);
  const { data: rows, error } = await supabase
    .from("location_holidays")
    .select("id, holiday_date, description, created_at")
    .eq("org_id", detail.orgId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;

  const out: LeaveHistoryRow[] = [];
  for (const r of rows ?? []) {
    const payload = parseAdminLeaveDescription(r.description);
    if (payload && payload.staff_user_id === detail.userId) {
      out.push({
        id: r.id,
        holidayDate: r.holiday_date,
        payload,
        createdAt: r.created_at,
      });
    }
  }
  return out;
}

export function useMemberLeaves(membershipId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: membershipId ? memberLeavesQueryKey(membershipId) : ["member-leaves", "none"],
    queryFn: () => fetchMemberLeaves(membershipId!),
    enabled: Boolean(membershipId && enabled),
    staleTime: STALE_MS,
    gcTime: GC_MS,
    refetchOnMount: "always",
  });
}

/** Pozostali członkowie zespołu administracyjnego (do wyboru zastępstwa). */
export type TeamPickRow = { userId: string; fullName: string; email: string };

async function fetchAdminTeamPickList(excludeUserId: string, orgId: string): Promise<TeamPickRow[]> {
  const { data: memberships, error: mErr } = await supabase
    .from("memberships")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .in("role", [...TEAM_ADMIN_ROLES]);

  if (mErr) throw mErr;
  const userIds = [...new Set((memberships ?? []).map((m) => m.user_id))].filter((id) => id !== excludeUserId);
  if (userIds.length === 0) return [];

  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("id, full_name, email, contact_email")
    .in("id", userIds);

  if (pErr) throw pErr;

  return (profiles ?? []).map((p) => ({
    userId: p.id,
    fullName: p.full_name?.trim() || "—",
    email: p.email?.trim() || p.contact_email?.trim() || "—",
  }));
}

export function useAdminTeamPickList(excludeUserId: string | undefined, orgId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["admin-team-pick", orgId, excludeUserId],
    queryFn: () => fetchAdminTeamPickList(excludeUserId!, orgId!),
    enabled: Boolean(enabled && excludeUserId && orgId),
    staleTime: STALE_MS,
    gcTime: GC_MS,
    refetchOnMount: "always",
  });
}

export function useUpdateMemberRole(membershipId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (role: string) => {
      if (!membershipId) throw new Error("Brak identyfikatora.");
      const { data: orgId, error: orgErr } = await supabase.rpc("get_my_org_id_safe");
      if (orgErr) throw orgErr;
      if (!orgId) throw new Error("Brak organizacji.");
      const { error } = await supabase
        .from("memberships")
        .update({ role })
        .eq("id", membershipId)
        .eq("org_id", orgId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Zaktualizowano rolę.");
      if (membershipId) {
        void qc.invalidateQueries({ queryKey: memberDetailsQueryKey(membershipId) });
      }
      void qc.invalidateQueries({ queryKey: [TEAM_MEMBERS_QUERY_KEY] });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Nie udało się zapisać roli.";
      toast.error(msg);
      console.error("[useUpdateMemberRole]", e);
    },
  });
}

export function useUpdateMemberPhone(membershipId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (phone: string) => {
      if (!membershipId) throw new Error("Brak identyfikatora.");
      const detail = await fetchMemberDetails(membershipId);
      const normalized = phone.trim() === "" ? null : phone.trim();
      const { error } = await supabase.from("profiles").update({ phone: normalized }).eq("id", detail.userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Zapisano numer telefonu.");
      if (membershipId) {
        void qc.invalidateQueries({ queryKey: memberDetailsQueryKey(membershipId) });
      }
      void qc.invalidateQueries({ queryKey: [TEAM_MEMBERS_QUERY_KEY] });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Nie udało się zapisać telefonu.";
      toast.error(msg);
      console.error("[useUpdateMemberPhone]", e);
    },
  });
}

export function useAssignLocationAccess(membershipId: string | undefined, userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (locationId: string) => {
      if (!userId) throw new Error("Brak użytkownika.");
      const { error } = await supabase.from("location_access").insert({
        user_id: userId,
        location_id: locationId,
        access_type: "administration",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Przypisano budynek.");
      if (membershipId) void qc.invalidateQueries({ queryKey: memberBuildingsQueryKey(membershipId) });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Nie udało się przypisać budynku.";
      toast.error(msg);
      console.error("[useAssignLocationAccess]", e);
    },
  });
}

export function useRevokeLocationAccess(membershipId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (accessId: string) => {
      const { error } = await supabase.from("location_access").delete().eq("id", accessId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Usunięto przypisanie budynku.");
      if (membershipId) void qc.invalidateQueries({ queryKey: memberBuildingsQueryKey(membershipId) });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Nie udało się usunąć przypisania.";
      toast.error(msg);
      console.error("[useRevokeLocationAccess]", e);
    },
  });
}

export function useCreateStaffLeave(membershipId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { orgId: string; staffUserId: string; payload: AdminLeavePayload }) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) throw new Error("Brak sesji.");

      const { error } = await supabase.from("location_holidays").insert({
        org_id: params.orgId,
        location_id: null,
        holiday_date: params.payload.date_from,
        description: encodeAdminLeaveDescription(params.payload),
        created_by: session.user.id,
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      const { date_from, date_to } = variables.payload;
      let periodLabel = `${date_from} – ${date_to}`;
      try {
        periodLabel = `${format(parseISO(date_from), "dd.MM.yyyy")} – ${format(parseISO(date_to), "dd.MM.yyyy")}`;
      } catch {
        /* keep ISO fallback */
      }
      toast.success(`Urlop zapisany: ${periodLabel}.`);
      if (membershipId) void qc.invalidateQueries({ queryKey: memberLeavesQueryKey(membershipId) });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Nie udało się zapisać urlopu.";
      toast.error(msg);
      console.error("[useCreateStaffLeave]", e);
    },
  });
}
