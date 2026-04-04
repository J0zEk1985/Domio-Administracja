import { useQueries, useQuery } from "@tanstack/react-query";
import { addDays, addHours, parseISO } from "date-fns";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/supabase";

export const DASHBOARD_METRICS_STALE_MS = 60_000;

export const dashboardMetricsQueryKeys = {
  orgId: ["dashboard", "org-id"] as const,
  overdueIssues: (orgId: string) => ["dashboard", "overdue-issues", orgId] as const,
  missedCleaning: (orgId: string) => ["dashboard", "missed-cleaning", orgId] as const,
  expiringInspections: (orgId: string) => ["dashboard", "expiring-inspections", orgId] as const,
  expiringContracts: (orgId: string) => ["dashboard", "expiring-contracts", orgId] as const,
} as const;

const OPEN_ISSUE_SLA_HOURS = 48;
const INSPECTION_HORIZON_DAYS = 30;
const CONTRACT_HORIZON_DAYS = 45;
const ROW_LIMIT = 10;

const ACTIVE_ISSUE_STATUSES: Database["public"]["Enums"]["issue_status_enum"][] = [
  "new",
  "open",
  "in_progress",
];

const INCOMPLETE_TASK_STATUSES: Database["public"]["Enums"]["task_status"][] = [
  "pending",
  "in_progress",
];

type LocationName = { name: string | null };

export type DashboardOverdueIssue = {
  id: string;
  locationId: string | null;
  /** SLA deadline (created_at + 48h) — display as due date */
  dueAtIso: string;
  buildingName: string;
  detail: string;
};

export type DashboardMissedCleaning = {
  id: string;
  locationId: string | null;
  dueAtIso: string;
  buildingName: string;
  detail: string;
};

export type DashboardExpiringInspection = {
  id: string;
  locationId: string | null;
  dueAtIso: string;
  buildingName: string;
  detail: string;
};

export type DashboardExpiringContract = {
  id: string;
  locationId: string | null;
  dueAtIso: string;
  buildingName: string;
  detail: string;
};

async function resolveOrgId(): Promise<string | null> {
  const { data: orgId, error: orgErr } = await supabase.rpc("get_my_org_id_safe");
  if (orgErr) {
    console.error("[useDashboardMetrics] get_my_org_id_safe:", orgErr);
    throw orgErr;
  }
  if (!orgId || String(orgId).trim() === "") {
    return null;
  }
  return String(orgId);
}

async function fetchOverdueIssues(orgId: string): Promise<DashboardOverdueIssue[]> {
  try {
    const cutoff = addHours(new Date(), -OPEN_ISSUE_SLA_HOURS).toISOString();
    const { data, error } = await supabase
      .from("property_issues")
      .select("id, location_id, created_at, category, description, location:cleaning_locations(name)")
      .eq("org_id", orgId)
      .in("status", ACTIVE_ISSUE_STATUSES)
      .lt("created_at", cutoff)
      .order("created_at", { ascending: true })
      .limit(ROW_LIMIT);

    if (error) {
      console.error("[useDashboardMetrics] overdue property_issues:", error);
      throw error;
    }

    const rows = (data ?? []) as {
      id: string;
      location_id: string | null;
      created_at: string | null;
      category: string | null;
      description: string | null;
      location: LocationName | null;
    }[];

    return rows.map((row) => {
      const created = row.created_at ? parseISO(row.created_at) : new Date();
      const due = addHours(created, OPEN_ISSUE_SLA_HOURS);
      const buildingName = row.location?.name?.trim() || "—";
      const cat = row.category?.trim();
      const desc = row.description?.trim();
      const detail = cat && desc ? `${cat} — ${desc}` : cat ?? desc ?? "Usterka";
      return {
        id: row.id,
        locationId: row.location_id,
        dueAtIso: due.toISOString(),
        buildingName,
        detail,
      };
    });
  } catch (err) {
    console.error("[useDashboardMetrics] fetchOverdueIssues:", err);
    throw err;
  }
}

async function fetchMissedCleaning(orgId: string): Promise<DashboardMissedCleaning[]> {
  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("cleaning_tasks")
      .select("id, location_id, scheduled_at, task_type, location:cleaning_locations(name)")
      .eq("org_id", orgId)
      .in("status", INCOMPLETE_TASK_STATUSES)
      .lt("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true })
      .limit(ROW_LIMIT);

    if (error) {
      console.error("[useDashboardMetrics] missed cleaning_tasks:", error);
      throw error;
    }

    const rows = (data ?? []) as {
      id: string;
      location_id: string | null;
      scheduled_at: string;
      task_type: Database["public"]["Enums"]["task_type"];
      location: LocationName | null;
    }[];

    return rows.map((row) => ({
      id: row.id,
      locationId: row.location_id,
      dueAtIso: row.scheduled_at,
      buildingName: row.location?.name?.trim() || "—",
      detail: formatTaskType(row.task_type),
    }));
  } catch (err) {
    console.error("[useDashboardMetrics] fetchMissedCleaning:", err);
    throw err;
  }
}

function formatTaskType(t: Database["public"]["Enums"]["task_type"]): string {
  switch (t) {
    case "sop_standard":
      return "SOP";
    case "coordinator_single":
      return "Koordynator";
    case "long_term":
      return "Długoterminowe";
    case "employee_extra":
      return "Dodatkowe";
  }
}

async function fetchExpiringInspections(orgId: string): Promise<DashboardExpiringInspection[]> {
  try {
    const horizon = addDays(new Date(), INSPECTION_HORIZON_DAYS).toISOString();
    const { data, error } = await supabase
      .from("inspections_hybrid")
      .select("id, location_id, next_due_date, title, category, location:cleaning_locations(name)")
      .eq("org_id", orgId)
      .lte("next_due_date", horizon)
      .order("next_due_date", { ascending: true })
      .limit(ROW_LIMIT);

    if (error) {
      console.error("[useDashboardMetrics] inspections_hybrid:", error);
      throw error;
    }

    const rows = (data ?? []) as {
      id: string;
      location_id: string | null;
      next_due_date: string;
      title: string;
      category: string;
      location: LocationName | null;
    }[];

    return rows.map((row) => ({
      id: row.id,
      locationId: row.location_id,
      dueAtIso: row.next_due_date,
      buildingName: row.location?.name?.trim() || "—",
      detail: row.title?.trim() || row.category?.trim() || "Przegląd",
    }));
  } catch (err) {
    console.error("[useDashboardMetrics] fetchExpiringInspections:", err);
    throw err;
  }
}

async function fetchExpiringContracts(orgId: string): Promise<DashboardExpiringContract[]> {
  try {
    const horizon = addDays(new Date(), CONTRACT_HORIZON_DAYS).toISOString();
    const { data, error } = await supabase
      .from("property_contracts")
      .select(
        "id, location_id, end_date, type, custom_type_name, location:cleaning_locations!inner(name, org_id), company:companies(name)",
      )
      .eq("location.org_id", orgId)
      .not("end_date", "is", null)
      .lte("end_date", horizon.slice(0, 10))
      .order("end_date", { ascending: true })
      .limit(ROW_LIMIT);

    if (error) {
      console.error("[useDashboardMetrics] expiring property_contracts:", error);
      throw error;
    }

    const rows = (data ?? []) as {
      id: string;
      location_id: string;
      end_date: string | null;
      type: Database["public"]["Enums"]["property_contract_type"];
      custom_type_name: string | null;
      location: LocationName | null;
      company: { name: string } | null;
    }[];

    return rows.map((row) => {
      const end = row.end_date ?? "";
      const typeLabel =
        row.type === "other" && row.custom_type_name?.trim()
          ? row.custom_type_name.trim()
          : contractTypeLabel(row.type);
      return {
        id: row.id,
        locationId: row.location_id,
        dueAtIso: end.includes("T") ? end : `${end}T12:00:00.000Z`,
        buildingName: row.location?.name?.trim() || "—",
        detail: row.company?.name?.trim() ? `${row.company.name.trim()} · ${typeLabel}` : typeLabel,
      };
    });
  } catch (err) {
    console.error("[useDashboardMetrics] fetchExpiringContracts:", err);
    throw err;
  }
}

function contractTypeLabel(t: Database["public"]["Enums"]["property_contract_type"]): string {
  switch (t) {
    case "cleaning":
      return "Sprzątanie";
    case "maintenance":
      return "Utrzymanie";
    case "administration":
      return "Administracja";
    case "elevator":
      return "Windy";
    case "other":
      return "Inna";
  }
}

export type DashboardSection<T> = {
  data: T[];
  isLoading: boolean;
  error: Error | null;
};

export type UseDashboardMetricsResult = {
  orgId: string | null;
  orgLoading: boolean;
  overdueIssues: DashboardSection<DashboardOverdueIssue>;
  missedCleaning: DashboardSection<DashboardMissedCleaning>;
  expiringInspections: DashboardSection<DashboardExpiringInspection>;
  expiringContracts: DashboardSection<DashboardExpiringContract>;
};

export function useDashboardMetrics(): UseDashboardMetricsResult {
  const orgQuery = useQuery({
    queryKey: dashboardMetricsQueryKeys.orgId,
    queryFn: resolveOrgId,
    staleTime: 5 * 60_000,
  });

  const orgId = orgQuery.data ?? null;

  const orgKey = orgId ?? "__no_org__";

  const [overdueQ, missedQ, inspectionsQ, contractsQ] = useQueries({
    queries: [
      {
        queryKey: dashboardMetricsQueryKeys.overdueIssues(orgKey),
        queryFn: () => fetchOverdueIssues(orgId!),
        enabled: Boolean(orgId),
        staleTime: DASHBOARD_METRICS_STALE_MS,
      },
      {
        queryKey: dashboardMetricsQueryKeys.missedCleaning(orgKey),
        queryFn: () => fetchMissedCleaning(orgId!),
        enabled: Boolean(orgId),
        staleTime: DASHBOARD_METRICS_STALE_MS,
      },
      {
        queryKey: dashboardMetricsQueryKeys.expiringInspections(orgKey),
        queryFn: () => fetchExpiringInspections(orgId!),
        enabled: Boolean(orgId),
        staleTime: DASHBOARD_METRICS_STALE_MS,
      },
      {
        queryKey: dashboardMetricsQueryKeys.expiringContracts(orgKey),
        queryFn: () => fetchExpiringContracts(orgId!),
        enabled: Boolean(orgId),
        staleTime: DASHBOARD_METRICS_STALE_MS,
      },
    ],
  });

  const toSection = <T,>(q: typeof overdueQ): DashboardSection<T> => ({
    data: (q.data ?? []) as T[],
    isLoading: orgQuery.isPending || (Boolean(orgId) && q.isPending),
    error: q.error instanceof Error ? q.error : q.error ? new Error(String(q.error)) : null,
  });

  return {
    orgId,
    orgLoading: orgQuery.isPending,
    overdueIssues: toSection<DashboardOverdueIssue>(overdueQ),
    missedCleaning: toSection<DashboardMissedCleaning>(missedQ),
    expiringInspections: toSection<DashboardExpiringInspection>(inspectionsQ),
    expiringContracts: toSection<DashboardExpiringContract>(contractsQ),
  };
}
