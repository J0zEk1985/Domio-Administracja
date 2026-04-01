import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/supabase";
import type { PropertyTaskWithCommentCount, TaskPriority } from "@/types/propertyTasks";

const STALE_MS = 0;
const GC_MS = 30_000;

/** Root segment — invaliduje wszystkie warianty listy globalnej. */
export const GLOBAL_TASKS_QUERY_ROOT = "global-tasks" as const;

export type GlobalTasksSortBy = "date_desc" | "priority_desc";

export type GlobalTasksFilters = {
  locationId?: string;
  assigneeId?: string;
  sortBy: GlobalTasksSortBy;
};

const DEFAULT_FILTERS: GlobalTasksFilters = {
  sortBy: "date_desc",
};

export function globalTasksQueryKey(
  filters: GlobalTasksFilters = DEFAULT_FILTERS,
): readonly [typeof GLOBAL_TASKS_QUERY_ROOT, GlobalTasksFilters] {
  return [GLOBAL_TASKS_QUERY_ROOT, filters];
}

type PropertyTaskRow = Database["public"]["Tables"]["property_tasks"]["Row"];

type RowWithEmbeds = PropertyTaskRow & {
  task_comments: { count: number | string }[] | null;
  location: { name: string | null } | null;
  assignee: { full_name: string | null } | null;
};

export type GlobalTaskRow = PropertyTaskWithCommentCount & {
  location: { name: string | null } | null;
  assignee: { full_name: string | null } | null;
};

function parseCommentCount(raw: RowWithEmbeds["task_comments"]): number {
  if (!raw || !Array.isArray(raw) || raw.length === 0) return 0;
  const n = raw[0]?.count;
  if (typeof n === "number" && Number.isFinite(n)) return n;
  if (typeof n === "string") {
    const parsed = Number(n);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function priorityWeight(p: TaskPriority): number {
  if (p === "urgent") return 3;
  if (p === "medium") return 2;
  return 1;
}

function mapGlobalRow(row: RowWithEmbeds): GlobalTaskRow {
  return {
    id: row.id,
    location_id: row.location_id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    visibility: row.visibility,
    assignee_id: row.assignee_id,
    created_by: row.created_by,
    created_at: row.created_at,
    comments_count: parseCommentCount(row.task_comments),
    location: row.location ? { name: row.location.name } : null,
    assignee: row.assignee ? { full_name: row.assignee.full_name } : null,
  };
}

function applySort(rows: GlobalTaskRow[], sortBy: GlobalTasksSortBy): GlobalTaskRow[] {
  if (sortBy === "date_desc") {
    return [...rows].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }
  return [...rows].sort((a, b) => {
    const dw = priorityWeight(b.priority) - priorityWeight(a.priority);
    if (dw !== 0) return dw;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

async function fetchGlobalTasks(filters: GlobalTasksFilters): Promise<GlobalTaskRow[]> {
  let q = supabase.from("property_tasks").select(
    "*, location:cleaning_locations(name), assignee:profiles!property_tasks_assignee_id_fkey(full_name), task_comments(count)",
  );

  if (filters.locationId?.trim()) {
    q = q.eq("location_id", filters.locationId.trim());
  }
  if (filters.assigneeId?.trim()) {
    q = q.eq("assignee_id", filters.assigneeId.trim());
  }

  q = q.order("created_at", { ascending: false });

  const { data, error } = await q;

  if (error) {
    console.error("[useGlobalTasks] property_tasks:", error);
    throw error;
  }

  return (data as RowWithEmbeds[] | null)?.map(mapGlobalRow) ?? [];
}

export function useGlobalTasks(filters: GlobalTasksFilters = DEFAULT_FILTERS, enabled: boolean = true) {
  return useQuery({
    queryKey: globalTasksQueryKey(filters),
    queryFn: () => fetchGlobalTasks(filters),
    select: (rows) => applySort(rows, filters.sortBy),
    enabled,
    staleTime: STALE_MS,
    gcTime: GC_MS,
    refetchOnMount: "always",
  });
}
