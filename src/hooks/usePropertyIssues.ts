import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { TriageIssue } from "@/hooks/useTriageIssues";
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
      delegated_vendor:vendor_partners(name),
      assigned_staff:profiles!property_issues_assigned_staff_id_fkey(full_name)
    `,
    )
    .eq("org_id", String(orgId))
    .eq("location_id", locationId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[usePropertyIssues] property_issues:", error);
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
