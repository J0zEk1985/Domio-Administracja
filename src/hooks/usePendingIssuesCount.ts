import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  ADMIN_HANDOFF_FROM_SERWIS_OR,
  ADMIN_INTAKE_MODULE_OR,
  ADMIN_VISIBLE_ISSUES_OR,
} from "@/lib/issueModuleVisibility";

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
    .select("id, location:cleaning_locations!inner(id)", { count: "exact", head: true })
    .eq("org_id", String(orgId))
    .eq("location.is_admin_active", true)
    .or(ADMIN_VISIBLE_ISSUES_OR)
    .or(ADMIN_HANDOFF_FROM_SERWIS_OR)
    .or(ADMIN_INTAKE_MODULE_OR)
    .in("status", [...PENDING_TRIAGE_STATUSES]);

  if (error) {
    console.error("[usePendingIssuesCount] property_issues count:", error);
    throw error;
  }

  const unlocated = await supabase
    .from("property_issues")
    .select("id", { count: "exact", head: true })
    .eq("org_id", String(orgId))
    .eq("intake_module", "administracja")
    .is("location_id", null)
    .or(ADMIN_VISIBLE_ISSUES_OR)
    .or(ADMIN_HANDOFF_FROM_SERWIS_OR)
    .in("status", [...PENDING_TRIAGE_STATUSES]);

  if (unlocated.error) {
    console.error("[usePendingIssuesCount] unlocated property_issues count:", unlocated.error);
    throw unlocated.error;
  }

  const locatedCount = typeof count === "number" && Number.isFinite(count) ? count : 0;
  const unlocatedCount =
    typeof unlocated.count === "number" && Number.isFinite(unlocated.count) ? unlocated.count : 0;
  return locatedCount + unlocatedCount;
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
