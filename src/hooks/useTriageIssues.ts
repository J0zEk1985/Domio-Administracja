import { useQuery } from "@tanstack/react-query";
import { subMonths } from "date-fns";
import { supabase } from "@/lib/supabase";
import {
  ADMIN_HANDOFF_FROM_SERWIS_OR,
  ADMIN_VISIBLE_ISSUES_OR,
  isIssueVisibleInAdminModule,
} from "@/lib/issueModuleVisibility";
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

export function triageIssuesQueryKey(
  locationIds?: readonly string[],
): readonly [typeof TRIAGE_ISSUES_QUERY_ROOT] | readonly [typeof TRIAGE_ISSUES_QUERY_ROOT, "locations", string] {
  if (locationIds && locationIds.length > 0) {
    const scope = [...locationIds].sort().join(",");
    return [TRIAGE_ISSUES_QUERY_ROOT, "locations", scope];
  }
  return [TRIAGE_ISSUES_QUERY_ROOT];
}

export type UseTriageIssuesOptions = {
  enabled?: boolean;
  /** When set, fetch only these buildings (no org-wide 6-month / 300 row cap). */
  locationIds?: string[];
};

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

function mapTriageRows(data: unknown[] | null): TriageIssue[] {
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
      email_dispatch_status:
        row.email_dispatch_status === "queued" ||
        row.email_dispatch_status === "sent" ||
        row.email_dispatch_status === "failed"
          ? row.email_dispatch_status
          : null,
      email_correlation_token: row.email_correlation_token ?? null,
      vendor_external_ref: row.vendor_external_ref ?? null,
    };
  });
}

async function fetchTriageIssues(locationIds?: readonly string[]): Promise<TriageIssue[]> {
  const { data: orgId, error: orgErr } = await supabase.rpc("get_my_org_id_safe");
  if (orgErr) {
    console.error("[useTriageIssues] get_my_org_id_safe:", orgErr);
    throw orgErr;
  }
  if (!orgId || String(orgId).trim() === "") {
    return [];
  }
  if (locationIds && locationIds.length === 0) {
    return [];
  }

  const since = subMonths(new Date(), HISTORY_MONTHS);
  const scoped = Boolean(locationIds && locationIds.length > 0);

  let query = supabase
    .from("property_issues")
    .select(
      `
      *,
      location:cleaning_locations!inner(name, address),
      reporter:profiles!property_issues_reporter_id_fkey(full_name),
      organization:organizations!property_issues_org_id_fkey(name),
      delegated_vendor:vendor_partners!property_issues_delegated_vendor_id_fkey(name),
      assigned_staff:profiles!property_issues_assigned_staff_id_fkey(full_name)
    `,
    )
    .eq("org_id", String(orgId))
    .eq("location.is_admin_active", true)
    .or(ADMIN_VISIBLE_ISSUES_OR)
    .or(ADMIN_HANDOFF_FROM_SERWIS_OR);

  if (scoped) {
    query = query.in("location_id", [...locationIds!]);
  } else {
    query = query.gte("created_at", since.toISOString());
  }

  query = query.order("created_at", { ascending: false });
  if (!scoped) {
    query = query.limit(MAX_TRIAGE_ISSUES);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[useTriageIssues] property_issues:", error);
    throw error;
  }

  return mapTriageRows(data as unknown[] | null).filter(isIssueVisibleInAdminModule);
}

export function useTriageIssues(options: boolean | UseTriageIssuesOptions = true) {
  const enabled = typeof options === "boolean" ? options : (options.enabled ?? true);
  const locationIds = typeof options === "boolean" ? undefined : options.locationIds;
  const hasScope = locationIds != null;
  const scopeReady = !hasScope || locationIds.length > 0;

  return useQuery({
    queryKey: triageIssuesQueryKey(locationIds),
    queryFn: () => fetchTriageIssues(locationIds),
    enabled: enabled && scopeReady,
    staleTime: STALE_MS,
    gcTime: GC_MS,
    refetchOnMount: "always",
  });
}
