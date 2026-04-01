import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/supabase";
import type { PropertyTaskWithCommentCount } from "@/types/propertyTasks";

const STALE_MS = 0;
const GC_MS = 30_000;

export const globalTasksQueryKey = ["global-tasks"] as const;

type PropertyTaskRow = Database["public"]["Tables"]["property_tasks"]["Row"];

type RowWithEmbeds = PropertyTaskRow & {
  task_comments: { count: number | string }[] | null;
  location: { name: string | null } | null;
};

export type GlobalTaskRow = PropertyTaskWithCommentCount & {
  location: { name: string | null } | null;
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
  };
}

async function fetchAllTasks(): Promise<GlobalTaskRow[]> {
  const { data, error } = await supabase
    .from("property_tasks")
    .select("*, location:cleaning_locations(name), task_comments(count)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[useAllTasks] property_tasks:", error);
    throw error;
  }

  return (data as RowWithEmbeds[] | null)?.map(mapGlobalRow) ?? [];
}

export function useAllTasks(enabled: boolean = true) {
  return useQuery({
    queryKey: globalTasksQueryKey,
    queryFn: fetchAllTasks,
    enabled,
    staleTime: STALE_MS,
    gcTime: GC_MS,
    refetchOnMount: "always",
  });
}
