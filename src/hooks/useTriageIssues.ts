import { useQuery } from "@tanstack/react-query";
import { subMonths } from "date-fns";
import { supabase } from "@/lib/supabase";
import { ADMIN_VISIBLE_ISSUES_OR } from "@/lib/issueModuleVisibility";
import type { Database } from "@/types/supabase";
import type { PropertyIssueLifecycleFields } from "@/types/issueLifecycle";
import type { PropertyIssueProtocolFields } from "@/lib/issueProtocol";
import { parseProtocolFields } from "@/lib/issueProtocol";
import type { IssueStatus } from "@/lib/triageIssueUi";

/** Cap rows returned to the browser; combined with a time window. */
const MAX_TRIAGE_ISSUES = 300;
const HISTORY_MONTHS = 6;

const STALE_MS = 0;
const GC_MS = 60_000;

export const TRIAGE_ISSUES_QUERY_ROOT = "triage-issues" as const;

export function triageIssuesQueryKey(): readonly [typeof TRIAGE_ISSUES_QUERY_ROOT] {
  return [TRIAGE_ISSUES_QUERY_ROOT];
}

type PropertyIssueRow = Database["public"]["Tables"]["property_issues"]["Row"];

export type TriageIssue = Omit<PropertyIssueRow, "status"> &
  PropertyIssueLifecycleFields &
  PropertyIssueProtocolFields & {
    status: IssueStatus | null;
    location: { name: string | null; address: string | null } | null;
    reporter: { full_name: string | null } | null;
    organization: { name: string | null } | null;
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

  const since = subMonths(new Date(), HISTORY_MONTHS);

  const { data, error } = await supabase
    .from("property_issues")
    .select(
      `
      *,
      location:cleaning_locations(name, address),
      reporter:profiles!property_issues_reporter_id_fkey(full_name),
      organization:organizations!property_issues_org_id_fkey(name),
      delegated_vendor:vendor_partners!property_issues_delegated_vendor_id_fkey(name),
      assigned_staff:profiles!property_issues_assigned_staff_id_fkey(full_name)
    `,
    )
    .eq("org_id", String(orgId))
    .or(ADMIN_VISIBLE_ISSUES_OR)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(MAX_TRIAGE_ISSUES);

  if (error) {
    console.error("[useTriageIssues] property_issues:", error);
    throw error;
  }

  return ((data ?? []) as unknown as TriageIssue[]).map((row) => {
    const protocol = parseProtocolFields(row as unknown as Record<string, unknown>);
    return {
      ...row,
      ...protocol,
      claimed_at: row.claimed_at ?? null,
      cancelled_at: row.cancelled_at ?? null,
      cancelled_by: row.cancelled_by ?? null,
      cancel_reason: row.cancel_reason ?? null,
      cancel_requested_at: row.cancel_requested_at ?? null,
      cancel_requested_by: row.cancel_requested_by ?? null,
      cancel_request_reason: row.cancel_request_reason ?? null,
      transfer_to_vendor_id: row.transfer_to_vendor_id ?? null,
      transfer_authorized_at: row.transfer_authorized_at ?? null,
      transfer_authorized_by: row.transfer_authorized_by ?? null,
      location: row.location ?? null,
      reporter: row.reporter ?? null,
      organization: row.organization ?? null,
      delegated_vendor: row.delegated_vendor ?? null,
      assigned_staff: row.assigned_staff ?? null,
      marketplace_scope:
        row.marketplace_scope === "all" || row.marketplace_scope === "serving"
          ? row.marketplace_scope
          : null,
    };
  });
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
