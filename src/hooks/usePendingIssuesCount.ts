import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export const PENDING_ISSUES_COUNT_ROOT = "pending-issues-count" as const;

export function pendingIssuesCountQueryKey(): readonly [typeof PENDING_ISSUES_COUNT_ROOT] {
  return [PENDING_ISSUES_COUNT_ROOT];
}

const PENDING_TRIAGE_STATUSES = ["new", "pending_admin_approval"] as const;

const STALE_MS = 30_000;
const GC_MS = 120_000;

async function fetchPendingIssuesCount(): Promise<number> {
  const { data: orgId, error: orgErr } = await supabase.rpc("get_my_org_id_safe");
  if (orgErr) {
    console.error("[usePendingIssuesCount] get_my_org_id_safe:", orgErr);
    throw orgErr;
  }
  if (!orgId || String(orgId).trim() === "") {
    return 0;
  }

  const { count, error } = await supabase
    .from("property_issues")
    .select("*", { count: "exact", head: true })
    .eq("org_id", String(orgId))
    .in("status", [...PENDING_TRIAGE_STATUSES]);

  if (error) {
    console.error("[usePendingIssuesCount] property_issues count:", error);
    throw error;
  }

  return typeof count === "number" && Number.isFinite(count) ? count : 0;
}

export function usePendingIssuesCount(enabled: boolean = true) {
  return useQuery({
    queryKey: pendingIssuesCountQueryKey(),
    queryFn: fetchPendingIssuesCount,
    enabled,
    staleTime: STALE_MS,
    gcTime: GC_MS,
  });
}
