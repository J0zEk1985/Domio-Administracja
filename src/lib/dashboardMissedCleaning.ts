import type { Database } from "@/types/supabase";

type TaskType = Database["public"]["Enums"]["task_type"];

type SectionName = { name: string | null };

export type MissedCleaningNameSource = {
  task_type: TaskType;
  coordinator_notes: string | null;
  section: SectionName | null;
  checklist: unknown;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function itemActivityName(item: Record<string, unknown>): string | null {
  const name = typeof item.name === "string" ? item.name.trim() : "";
  const taskName = typeof item.task_name === "string" ? item.task_name.trim() : "";
  return name || taskName || null;
}

/** SOP / extra tasks store the activity label on the first checklist item (`name` or `task_name`). */
export function firstChecklistActivityName(checklist: unknown): string | null {
  if (!checklist) return null;
  if (Array.isArray(checklist)) {
    for (const entry of checklist) {
      if (!isPlainObject(entry)) continue;
      const name = itemActivityName(entry);
      if (name) return name;
    }
    return null;
  }
  if (isPlainObject(checklist) && Array.isArray(checklist.items)) {
    return firstChecklistActivityName(checklist.items);
  }
  if (isPlainObject(checklist)) {
    return itemActivityName(checklist);
  }
  return null;
}

export function formatCleaningTaskType(t: TaskType): string {
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

/**
 * Detail line for missed cleaning: section + specific activity (checklist), not just the generic SOP type.
 */
export function formatMissedCleaningDetail(row: MissedCleaningNameSource): string {
  const section = row.section?.name?.trim() || null;
  const activity =
    firstChecklistActivityName(row.checklist) || row.coordinator_notes?.trim() || null;
  const parts: string[] = [];
  if (section) parts.push(section);
  if (activity && activity !== section) parts.push(activity);
  if (parts.length > 0) return parts.join(" · ");
  return formatCleaningTaskType(row.task_type);
}
