import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/sonner";
import { getOrgAndActor, hasLocationAdministrationAccess } from "@/lib/orgAccess";
import { GLOBAL_TASKS_QUERY_ROOT, type GlobalTaskRow } from "@/hooks/useGlobalTasks";
import type { Database } from "@/types/supabase";
import type {
  PropertyTaskWithCommentCount,
  TaskPriority,
  TaskStatus,
  TaskVisibility,
} from "@/types/propertyTasks";
import type { PropertyResourceScopeOptions } from "@/hooks/usePropertyContracts";

const STALE_MS = 0;
const GC_MS = 30_000;

function tasksScopeCacheKey(scope?: PropertyResourceScopeOptions | null): string {
  if (!scope?.communityScope) {
    return scope?.parentCommunityId ? `h:${scope.parentCommunityId}` : "default";
  }
  const { communityId, buildingIds } = scope.communityScope;
  return `c:${communityId}:${[...buildingIds].sort().join(",")}`;
}

export const propertyTasksQueryKey = (locationId: string, scope?: PropertyResourceScopeOptions | null) =>
  ["property-tasks", locationId, tasksScopeCacheKey(scope)] as const;

type PropertyTaskRow = Database["public"]["Tables"]["property_tasks"]["Row"];

type PropertyTaskRowWithCount = PropertyTaskRow & {
  task_comments: { count: number | string }[] | null;
};

function parseCommentCount(raw: PropertyTaskRowWithCount["task_comments"]): number {
  if (!raw || !Array.isArray(raw) || raw.length === 0) return 0;
  const n = raw[0]?.count;
  if (typeof n === "number" && Number.isFinite(n)) return n;
  if (typeof n === "string") {
    const parsed = Number(n);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function mapRow(row: PropertyTaskRowWithCount): PropertyTaskWithCommentCount {
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
  };
}

async function fetchTasksForLocation(
  locationId: string,
  scope?: PropertyResourceScopeOptions | null,
): Promise<PropertyTaskWithCommentCount[]> {
  let q = supabase.from("property_tasks").select("*, task_comments(count)");

  const cs = scope?.communityScope;
  if (cs && cs.communityId) {
    if (cs.buildingIds.length > 0) {
      q = q.or(`community_id.eq.${cs.communityId},location_id.in.(${cs.buildingIds.join(",")})`);
    } else {
      q = q.eq("community_id", cs.communityId);
    }
  } else if (scope?.parentCommunityId) {
    q = q.or(`location_id.eq.${locationId},community_id.eq.${scope.parentCommunityId}`);
  } else {
    q = q.eq("location_id", locationId);
  }

  const { data, error } = await q.order("created_at", { ascending: false });

  if (error) {
    console.error("[useTasks] property_tasks:", error);
    throw error;
  }

  return (data as PropertyTaskRowWithCount[] | null)?.map(mapRow) ?? [];
}

export function useTasks(
  locationId: string | undefined,
  enabled: boolean = true,
  scope?: PropertyResourceScopeOptions | null,
) {
  return useQuery({
    queryKey: locationId ? propertyTasksQueryKey(locationId, scope ?? undefined) : ["property-tasks", "none"],
    queryFn: () => fetchTasksForLocation(locationId!, scope ?? undefined),
    enabled: Boolean(locationId && enabled),
    staleTime: STALE_MS,
    gcTime: GC_MS,
    refetchOnMount: "always",
  });
}

export type CreatePropertyTaskInput = {
  locationId: string;
  title: string;
  priority: TaskPriority;
  visibility: TaskVisibility;
  assignee_id: string | null;
  /** Oznacza zadanie jako dotyczące całej wspólnoty (w kontekście budynku). */
  communityId?: string | null;
};

export function useCreateTask() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreatePropertyTaskInput) => {
      if (!input.locationId?.trim()) throw new Error("Brak identyfikatora nieruchomości.");

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
      if (userErr) {
        console.error("[useCreateTask] getUser:", userErr);
        throw userErr;
      }
      if (!user?.id) throw new Error("Brak zalogowanego użytkownika.");

      const { error } = await supabase.from("property_tasks").insert({
        location_id: input.locationId,
        community_id: input.communityId ?? null,
        title: input.title.trim(),
        priority: input.priority,
        visibility: input.visibility,
        assignee_id: input.assignee_id,
        created_by: user.id,
        status: "todo",
      });

      if (error) {
        console.error("[useCreateTask] insert:", error);
        throw error;
      }
    },
    onSuccess: async (_data, variables) => {
      await qc.invalidateQueries({ queryKey: ["property-tasks", variables.locationId] });
      await qc.invalidateQueries({ queryKey: [GLOBAL_TASKS_QUERY_ROOT] });
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : "Nie udało się utworzyć zadania.";
      toast.error(msg);
      console.error("[useCreateTask]", err);
    },
  });
}

export function nextCyclicTaskStatus(current: TaskStatus): TaskStatus {
  if (current === "todo") return "in_progress";
  if (current === "in_progress") return "done";
  return "todo";
}

export type UpdateTaskStatusVars = {
  taskId: string;
  nextStatus: TaskStatus;
  locationId: string;
  scope?: PropertyResourceScopeOptions | null;
};

type StatusMutationContext = {
  previous?: PropertyTaskWithCommentCount[];
  previousGlobalEntries?: [QueryKey, GlobalTaskRow[] | undefined][];
};

export function useUpdateTaskStatus() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, nextStatus }: UpdateTaskStatusVars) => {
      const { error } = await supabase.from("property_tasks").update({ status: nextStatus }).eq("id", taskId);
      if (error) {
        console.error("[useUpdateTaskStatus] update:", error);
        throw error;
      }
    },
    onMutate: async ({ taskId, nextStatus, locationId, scope }): Promise<StatusMutationContext> => {
      const taskKey = propertyTasksQueryKey(locationId, scope ?? undefined);
      await qc.cancelQueries({ queryKey: taskKey });
      await qc.cancelQueries({ queryKey: [GLOBAL_TASKS_QUERY_ROOT] });

      const previous = qc.getQueryData<PropertyTaskWithCommentCount[]>(taskKey);
      if (previous) {
        qc.setQueryData(
          taskKey,
          previous.map((t) => (t.id === taskId ? { ...t, status: nextStatus } : t)),
        );
      }

      const previousGlobalEntries = qc.getQueriesData<GlobalTaskRow[]>({
        queryKey: [GLOBAL_TASKS_QUERY_ROOT],
      });

      qc.setQueriesData<GlobalTaskRow[]>(
        { queryKey: [GLOBAL_TASKS_QUERY_ROOT] },
        (old) =>
          old ? old.map((t) => (t.id === taskId ? { ...t, status: nextStatus } : t)) : old,
      );

      return { previous, previousGlobalEntries };
    },
    onError: (err: unknown, vars, context) => {
      if (vars?.locationId && context?.previous !== undefined) {
        qc.setQueryData(propertyTasksQueryKey(vars.locationId, vars.scope ?? undefined), context.previous);
      }
      context?.previousGlobalEntries?.forEach(([key, data]) => {
        qc.setQueryData(key, data);
      });
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : "Nie udało się zaktualizować statusu zadania.";
      toast.error(msg);
      console.error("[useUpdateTaskStatus]", err);
    },
    onSettled: async (_d, _e, vars) => {
      if (vars?.locationId) {
        await qc.invalidateQueries({ queryKey: ["property-tasks", vars.locationId] });
      }
      await qc.invalidateQueries({ queryKey: [GLOBAL_TASKS_QUERY_ROOT] });
    },
  });
}

export function usePropertyTasksCanEdit(propertyId: string | undefined) {
  return useQuery({
    queryKey: ["property-tasks-can-edit", propertyId],
    queryFn: async () => {
      const actor = await getOrgAndActor();
      if (actor.isOwner) return true;
      if (!propertyId) return false;
      return hasLocationAdministrationAccess(actor.userId, propertyId);
    },
    enabled: Boolean(propertyId),
    staleTime: STALE_MS,
    gcTime: GC_MS,
  });
}
