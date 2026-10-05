import type { BoardPortalTask } from "@/lib/boardPortalSnapshot";

export type BoardPortalPriorityFilter = "all" | "low" | "medium" | "urgent";

export const BOARD_PORTAL_PRIORITY_ORDER: Exclude<BoardPortalPriorityFilter, "all">[] = [
  "urgent",
  "medium",
  "low",
];

export function taskStatusLabel(status: string): string {
  if (status === "todo") return "Do zrobienia";
  if (status === "in_progress") return "W toku";
  if (status === "done") return "Zakończone";
  return status;
}

export function taskPriorityLabel(priority: string): string {
  if (priority === "low") return "Niski";
  if (priority === "medium") return "Średni";
  if (priority === "urgent") return "Wysoki";
  return priority;
}

export function filterTasksByPriority(
  tasks: BoardPortalTask[],
  filter: BoardPortalPriorityFilter,
): BoardPortalTask[] {
  if (filter === "all") return tasks;
  return tasks.filter((task) => task.priority === filter);
}

export function groupTasksByPriority(
  tasks: BoardPortalTask[],
): { priority: Exclude<BoardPortalPriorityFilter, "all">; label: string; tasks: BoardPortalTask[] }[] {
  return BOARD_PORTAL_PRIORITY_ORDER.flatMap((priority) => {
    const group = tasks.filter((task) => task.priority === priority);
    if (group.length === 0) return [];
    return [{ priority, label: taskPriorityLabel(priority), tasks: group }];
  });
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const COMPLETED_TASKS_MAX_RANGE_DAYS = 366;

export type CompletedDateRange =
  | { ok: true; from: string; to: string }
  | { ok: false; message: string };

function parseIsoDateUtc(value: string): Date | null {
  if (!ISO_DATE_RE.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  if (d.toISOString().slice(0, 10) !== value) return null;
  return d;
}

export function validateCompletedDateRange(fromRaw: string, toRaw: string): CompletedDateRange {
  const from = fromRaw.trim();
  const to = toRaw.trim();
  if (!from || !to) {
    return { ok: false, message: "Podaj datę od i datę do." };
  }
  const fromDate = parseIsoDateUtc(from);
  const toDate = parseIsoDateUtc(to);
  if (!fromDate || !toDate) {
    return { ok: false, message: "Daty są nieprawidłowe." };
  }
  if (toDate < fromDate) {
    return { ok: false, message: "Data końcowa nie może być wcześniejsza niż data początkowa." };
  }
  const days = Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000);
  if (days > COMPLETED_TASKS_MAX_RANGE_DAYS) {
    return { ok: false, message: "Maksymalny przedział to 366 dni." };
  }
  return { ok: true, from, to };
}
