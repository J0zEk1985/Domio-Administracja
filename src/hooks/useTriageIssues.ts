import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { TRIAGE_ACTIVE_STATUSES } from "@/lib/triageIssueUi";
import type { Database } from "@/types/supabase";

const STALE_MS = 0;
const GC_MS = 60_000;

export const TRIAGE_ISSUES_QUERY_ROOT = "triage-issues" as const;

export function triageIssuesQueryKey(): readonly [typeof TRIAGE_ISSUES_QUERY_ROOT] {
  return [TRIAGE_ISSUES_QUERY_ROOT];
}

type PropertyIssueRow = Database["public"]["Tables"]["property_issues"]["Row"];

export type TriageIssue = PropertyIssueRow & {
  location: { name: string | null } | null;
  reporter: { full_name: string | null } | null;
  delegated_vendor: { name: string | null } | null;
  assigned_staff: { full_name: string | null } | null;
};

type RowWithEmbeds = PropertyIssueRow & {
  location: { name: string | null } | null;
  reporter: { full_name: string | null } | null;
  delegated_vendor: { name: string | null } | null;
  assigned_staff: { full_name: string | null } | null;
};

async function fetchTriageIssues(): Promise<TriageIssue[]> {
  const { data: orgId, error: orgErr } = await supabase.rpc("get_my_org_id_safe");
  if (orgErr) {
    console.error("[useTriageIssues] get_my_org_id_safe:", orgErr);
    throw orgErr;
  }
  if (!orgId || String(orgId).trim() === "") {
    return [];
  }

  const { data, error } = await supabase
    .from("property_issues")
    .select(
      `
      *,
      location:cleaning_locations(name),
      reporter:profiles!property_issues_reporter_id_fkey(full_name),
      delegated_vendor:vendor_partners(name),
      assigned_staff:profiles!property_issues_assigned_staff_id_fkey(full_name)
    `,
    )
    .eq("org_id", String(orgId))
    .in("status", [...TRIAGE_ACTIVE_STATUSES])
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[useTriageIssues] property_issues:", error);
    throw error;
  }

  return ((data ?? []) as RowWithEmbeds[]).map((row) => ({
    ...row,
    location: row.location ?? null,
    reporter: row.reporter ?? null,
    delegated_vendor: row.delegated_vendor ?? null,
    assigned_staff: row.assigned_staff ?? null,
  }));
}

export function useTriageIssues(enabled: boolean = true) {
  return useQuery({
    queryKey: triageIssuesQueryKey(),
    queryFn: fetchTriageIssues,
    enabled,
    staleTime: STALE_MS,
    gcTime: GC_MS,
    refetchOnMount: "always",
  });
}
