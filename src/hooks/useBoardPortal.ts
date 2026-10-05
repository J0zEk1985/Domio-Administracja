import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  parseBoardPortalCommentInsert,
  parseBoardPortalCompletedTasks,
  parseBoardPortalSnapshot,
  type BoardPortalAnnouncement,
  type BoardPortalContact,
  type BoardPortalIssue,
  type BoardPortalResult,
  type BoardPortalSnapshot,
  type BoardPortalTask,
  type BoardPortalTaskComment,
} from "@/lib/boardPortalSnapshot";

export type {
  BoardPortalAnnouncement,
  BoardPortalContact,
  BoardPortalIssue,
  BoardPortalResult,
  BoardPortalSnapshot,
  BoardPortalTask,
  BoardPortalTaskComment,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isBoardPortalToken(token: string | undefined): token is string {
  return Boolean(token && UUID_RE.test(token));
}

export function boardPortalQueryKey(token: string) {
  return ["board-portal", token] as const;
}

export function useBoardPortal(token: string | undefined) {
  const valid = isBoardPortalToken(token);
  return useQuery({
    queryKey: valid ? boardPortalQueryKey(token) : ["board-portal", "none"],
    enabled: valid,
    staleTime: 30_000,
    queryFn: async (): Promise<BoardPortalResult> => {
      const { data, error } = await supabase.rpc("get_board_portal_snapshot", {
        p_token: token as string,
      });
      if (error) {
        console.error("[useBoardPortal] get_board_portal_snapshot:", error);
        throw error;
      }
      return parseBoardPortalSnapshot(data);
    },
  });
}

export type BoardPortalCompletedRange = { from: string; to: string };

export function boardPortalCompletedQueryKey(token: string, range: BoardPortalCompletedRange) {
  return ["board-portal-completed", token, range.from, range.to] as const;
}

export function useBoardPortalCompletedTasks(
  token: string | undefined,
  range: BoardPortalCompletedRange | null,
) {
  const valid = isBoardPortalToken(token);
  return useQuery({
    queryKey:
      valid && range
        ? boardPortalCompletedQueryKey(token, range)
        : ["board-portal-completed", "none"],
    enabled: valid && range !== null,
    staleTime: 30_000,
    queryFn: async () => {
      if (!isBoardPortalToken(token) || !range) {
        throw new Error("Wyszukiwanie nie zostało uruchomione.");
      }
      const { data, error } = await supabase.rpc("get_board_portal_completed_tasks", {
        p_token: token,
        p_from: range.from,
        p_to: range.to,
      });
      if (error) {
        console.error("[useBoardPortalCompletedTasks] get_board_portal_completed_tasks:", error);
        throw error;
      }
      const parsed = parseBoardPortalCompletedTasks(data);
      if (!parsed.ok) {
        if (parsed.error === "invalid_range") {
          throw new Error("Podany przedział dat jest nieprawidłowy.");
        }
        if (parsed.error === "invalid_token" || parsed.error === "not_found") {
          throw new Error("Link jest nieprawidłowy.");
        }
        throw new Error("Nie udało się wczytać zakończonych zadań.");
      }
      return parsed.tasks;
    },
  });
}

export function useAddBoardPortalTaskComment(token: string | undefined) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { taskId: string; content: string }) => {
      if (!isBoardPortalToken(token)) {
        throw new Error("Link jest nieprawidłowy.");
      }
      const trimmed = input.content.trim();
      if (!trimmed) {
        throw new Error("Komentarz nie może być pusty.");
      }
      const { data, error } = await supabase.rpc("add_board_portal_task_comment", {
        p_token: token,
        p_task_id: input.taskId,
        p_content: trimmed,
      });
      if (error) {
        console.error("[useAddBoardPortalTaskComment] rpc:", error);
        throw error;
      }
      const comment = parseBoardPortalCommentInsert(data);
      if (!comment) {
        throw new Error("Nie udało się dodać komentarza.");
      }
      return comment;
    },
    onSuccess: async () => {
      if (isBoardPortalToken(token)) {
        await qc.invalidateQueries({ queryKey: boardPortalQueryKey(token) });
      }
    },
    onError: (err: unknown) => {
      console.error("[useAddBoardPortalTaskComment]", err);
    },
  });
}
