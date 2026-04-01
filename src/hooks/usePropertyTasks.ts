import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/sonner";
import { getOrgAndActor, hasLocationAdministrationAccess } from "@/lib/orgAccess";
import type { Database } from "@/types/supabase";
import type {
  PropertyTaskWithCommentCount,
  TaskPriority,
  TaskStatus,
  TaskVisibility,
} from "@/types/propertyTasks";

const STALE_MS = 0;
const GC_MS = 30_000;

export const propertyTasksQueryKey = (locationId: string) => ["property-tasks", locationId] as const;

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

async function fetchTasksForLocation(locationId: string): Promise<PropertyTaskWithCommentCount[]> {
  const { data, error } = await supabase
    .from("property_tasks")
    .select("*, task_comments(count)")
    .eq("location_id", locationId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[useTasks] property_tasks:", error);
    throw error;
  }

  return (data as PropertyTaskRowWithCount[] | null)?.map(mapRow) ?? [];
}

export function useTasks(locationId: string | undefined, enabled: boolean = true) {
  return useQuery({
    queryKey: locationId ? propertyTasksQueryKey(locationId) : ["property-tasks", "none"],
    queryFn: () => fetchTasksForLocation(locationId!),
    enabled: Boolean(locationId && enabled),
    staleTime: STALE_MS,
    gcTime: GC_MS,
    refetchOnMount: "always",
  });
}

export type CreatePropertyTaskInput = {
  title: string;
  priority: TaskPriority;
  visibility: TaskVisibility;
  assignee_id: string | null;
};

export function useCreateTask(locationId: string | undefined) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreatePropertyTaskInput) => {
      if (!locationId) throw new Error("Brak identyfikatora nieruchomości.");

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
        location_id: locationId,
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
    onSuccess: async () => {
      if (locationId) {
        await qc.invalidateQueries({ queryKey: propertyTasksQueryKey(locationId) });
      }
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
};

export function useUpdateTaskStatus(locationId: string | undefined) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, nextStatus }: UpdateTaskStatusVars) => {
      const { error } = await supabase.from("property_tasks").update({ status: nextStatus }).eq("id", taskId);
      if (error) {
        console.error("[useUpdateTaskStatus] update:", error);
        throw error;
      }
    },
    onMutate: async ({ taskId, nextStatus }) => {
      if (!locationId) return {};

      await qc.cancelQueries({ queryKey: propertyTasksQueryKey(locationId) });
      const previous = qc.getQueryData<PropertyTaskWithCommentCount[]>(propertyTasksQueryKey(locationId));

      if (previous) {
        qc.setQueryData(
          propertyTasksQueryKey(locationId),
          previous.map((t) => (t.id === taskId ? { ...t, status: nextStatus } : t)),
        );
      }

      return { previous };
    },
    onError: (err: unknown, _vars, context) => {
      if (locationId && context?.previous !== undefined) {
        qc.setQueryData(propertyTasksQueryKey(locationId), context.previous);
      }
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : "Nie udało się zaktualizować statusu zadania.";
      toast.error(msg);
      console.error("[useUpdateTaskStatus]", err);
    },
    onSettled: async () => {
      if (locationId) {
        await qc.invalidateQueries({ queryKey: propertyTasksQueryKey(locationId) });
      }
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
