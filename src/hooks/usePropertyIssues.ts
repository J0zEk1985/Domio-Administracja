import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { ADMIN_VISIBLE_ISSUES_OR } from "@/lib/issueModuleVisibility";
import type { TriageIssue } from "@/hooks/useTriageIssues";
import { parseProtocolFields } from "@/lib/issueProtocol";
import type { Database } from "@/types/supabase";

const STALE_MS = 0;
const GC_MS = 60_000;

export const PROPERTY_ISSUES_QUERY_ROOT = "property-issues" as const;

export function propertyIssuesQueryKey(
  locationId: string | undefined,
): readonly [typeof PROPERTY_ISSUES_QUERY_ROOT, string | undefined] {
  return [PROPERTY_ISSUES_QUERY_ROOT, locationId];
}

/** Same embed shape as triage inbox — reusable in IssueDetailsPanel. */
export type PropertyIssue = TriageIssue;

type RowWithEmbeds = Database["public"]["Tables"]["property_issues"]["Row"] & {
  location: { name: string | null } | null;
  reporter: { full_name: string | null } | null;
  delegated_vendor: { name: string | null } | null;
  assigned_staff: { full_name: string | null } | null;
};

async function fetchPropertyIssues(locationId: string): Promise<PropertyIssue[]> {
  const { data: orgId, error: orgErr } = await supabase.rpc("get_my_org_id_safe");
  if (orgErr) {
    console.error("[usePropertyIssues] get_my_org_id_safe:", orgErr);
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
      delegated_vendor:vendor_partners!property_issues_delegated_vendor_id_fkey(name),
      assigned_staff:profiles!property_issues_assigned_staff_id_fkey(full_name)
    `,
    )
    .eq("org_id", String(orgId))
    .eq("location_id", locationId)
    .or(ADMIN_VISIBLE_ISSUES_OR)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[usePropertyIssues] property_issues:", error);
    throw error;
  }

  return ((data ?? []) as RowWithEmbeds[]).map((row) => {
    const protocol = parseProtocolFields(row as unknown as Record<string, unknown>);
    return {
      ...row,
      ...protocol,
      claimed_at: (row as { claimed_at?: string | null }).claimed_at ?? null,
      cancelled_at: (row as { cancelled_at?: string | null }).cancelled_at ?? null,
      cancelled_by: (row as { cancelled_by?: string | null }).cancelled_by ?? null,
      cancel_reason: (row as { cancel_reason?: string | null }).cancel_reason ?? null,
      cancel_requested_at: (row as { cancel_requested_at?: string | null }).cancel_requested_at ?? null,
      cancel_requested_by: (row as { cancel_requested_by?: string | null }).cancel_requested_by ?? null,
      cancel_request_reason:
        (row as { cancel_request_reason?: string | null }).cancel_request_reason ?? null,
      transfer_to_vendor_id: (row as { transfer_to_vendor_id?: string | null }).transfer_to_vendor_id ?? null,
      transfer_authorized_at:
        (row as { transfer_authorized_at?: string | null }).transfer_authorized_at ?? null,
      transfer_authorized_by:
        (row as { transfer_authorized_by?: string | null }).transfer_authorized_by ?? null,
      location: row.location ? { name: row.location.name, address: null } : null,
      reporter: row.reporter ?? null,
      organization: null,
      delegated_vendor: row.delegated_vendor ?? null,
      assigned_staff: row.assigned_staff ?? null,
      marketplace_scope:
        (row as { marketplace_scope?: string | null }).marketplace_scope === "all" ||
        (row as { marketplace_scope?: string | null }).marketplace_scope === "serving"
          ? ((row as { marketplace_scope?: "serving" | "all" }).marketplace_scope ?? null)
          : null,
    };
  });
}

export function usePropertyIssues(locationId: string | undefined, enabled: boolean = true) {
  return useQuery({
    queryKey: propertyIssuesQueryKey(locationId),
    queryFn: () => fetchPropertyIssues(locationId!),
    enabled: Boolean(locationId && enabled),
    staleTime: STALE_MS,
    gcTime: GC_MS,
    refetchOnMount: "always",
  });
}
