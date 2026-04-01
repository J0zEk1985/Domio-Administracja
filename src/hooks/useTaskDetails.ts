import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/sonner";
import { propertyTasksQueryKey } from "@/hooks/usePropertyTasks";
import type { Database } from "@/types/supabase";
import type { TaskPriority, TaskStatus, TaskVisibility } from "@/types/propertyTasks";

const STALE_MS = 0;
const GC_MS = 30_000;

export const taskDetailsQueryKey = (taskId: string) => ["property-task", taskId] as const;

export const taskCommentsQueryKey = (taskId: string) => ["property-task-comments", taskId] as const;

/** Embedded profile from Supabase join (schema uses full_name, not split first/last). */
export type TaskProfileEmbed = {
  id: string;
  full_name: string | null;
};

export type PropertyTaskDetails = Database["public"]["Tables"]["property_tasks"]["Row"] & {
  creator: TaskProfileEmbed | null;
  assignee: TaskProfileEmbed | null;
};

export type TaskCommentWithAuthor = Database["public"]["Tables"]["task_comments"]["Row"] & {
  author: TaskProfileEmbed | null;
};

const TASK_SELECT_EMBEDS = `
  *,
  creator:profiles!property_tasks_created_by_fkey(id, full_name),
  assignee:profiles!property_tasks_assignee_id_fkey(id, full_name)
`;

async function fetchTaskDetails(taskId: string): Promise<PropertyTaskDetails> {
  const { data, error } = await supabase
    .from("property_tasks")
    .select(TASK_SELECT_EMBEDS)
    .eq("id", taskId)
    .maybeSingle();

  if (error) {
    console.error("[useTaskDetails] property_tasks:", error);
    throw error;
  }
  if (!data) {
    throw new Error("TASK_NOT_FOUND");
  }

  return data as PropertyTaskDetails;
}

export function useTaskDetails(taskId: string | undefined, enabled: boolean = true) {
  return useQuery({
    queryKey: taskId ? taskDetailsQueryKey(taskId) : ["property-task", "none"],
    queryFn: () => fetchTaskDetails(taskId!),
    enabled: Boolean(taskId && enabled),
    staleTime: STALE_MS,
    gcTime: GC_MS,
    refetchOnMount: "always",
    retry: (failureCount, err) => {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : "";
      if (msg === "TASK_NOT_FOUND") return false;
      return failureCount < 2;
    },
  });
}

const COMMENT_SELECT = `
  *,
  author:profiles!task_comments_author_id_fkey(id, full_name)
`;

async function fetchTaskComments(taskId: string): Promise<TaskCommentWithAuthor[]> {
  const { data, error } = await supabase
    .from("task_comments")
    .select(COMMENT_SELECT)
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[useTaskComments] task_comments:", error);
    throw error;
  }

  return (data as TaskCommentWithAuthor[] | null) ?? [];
}

export function useTaskComments(taskId: string | undefined, enabled: boolean = true) {
  return useQuery({
    queryKey: taskId ? taskCommentsQueryKey(taskId) : ["property-task-comments", "none"],
    queryFn: () => fetchTaskComments(taskId!),
    enabled: Boolean(taskId && enabled),
    staleTime: STALE_MS,
    gcTime: GC_MS,
    refetchOnMount: "always",
  });
}

export type CreateTaskCommentInput = {
  content: string;
  /** Required to invalidate property task list counters. */
  locationId: string;
};

export function useCreateTaskComment(taskId: string | undefined) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateTaskCommentInput) => {
      if (!taskId) throw new Error("Brak identyfikatora zadania.");

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
      if (userErr) {
        console.error("[useCreateTaskComment] getUser:", userErr);
        throw userErr;
      }
      if (!user?.id) throw new Error("Brak zalogowanego użytkownika.");

      const { error } = await supabase.from("task_comments").insert({
        task_id: taskId,
        author_id: user.id,
        content: input.content.trim(),
      });

      if (error) {
        console.error("[useCreateTaskComment] insert:", error);
        throw error;
      }
    },
    onSuccess: async (_data, variables) => {
      if (taskId) {
        await qc.invalidateQueries({ queryKey: taskCommentsQueryKey(taskId) });
        await qc.invalidateQueries({ queryKey: taskDetailsQueryKey(taskId) });
      }
      await qc.invalidateQueries({ queryKey: propertyTasksQueryKey(variables.locationId) });
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : "Nie udało się dodać komentarza.";
      toast.error(msg);
      console.error("[useCreateTaskComment]", err);
    },
  });
}

export type UpdateTaskPatch = {
  status?: TaskStatus;
  priority?: TaskPriority;
  assignee_id?: string | null;
  visibility?: TaskVisibility;
};

export function useUpdateTask(taskId: string | undefined, locationId: string | undefined) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (patch: UpdateTaskPatch) => {
      if (!taskId) throw new Error("Brak identyfikatora zadania.");

      const { error } = await supabase.from("property_tasks").update(patch).eq("id", taskId);
      if (error) {
        console.error("[useUpdateTask] update:", error);
        throw error;
      }
    },
    onSuccess: async () => {
      if (taskId) {
        await qc.invalidateQueries({ queryKey: taskDetailsQueryKey(taskId) });
        await qc.invalidateQueries({ queryKey: taskCommentsQueryKey(taskId) });
      }
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
            : "Nie udało się zapisać zmian zadania.";
      toast.error(msg);
      console.error("[useUpdateTask]", err);
    },
  });
}
