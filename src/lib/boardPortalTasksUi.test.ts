import { describe, expect, it } from "vitest";
import type { BoardPortalTask } from "@/lib/boardPortalSnapshot";
import {
  filterTasksByPriority,
  groupTasksByPriority,
  taskPriorityLabel,
  validateCompletedDateRange,
} from "@/lib/boardPortalTasksUi";

function task(partial: Partial<BoardPortalTask> & Pick<BoardPortalTask, "id" | "priority">): BoardPortalTask {
  return {
    title: partial.title ?? partial.id,
    status: partial.status ?? "todo",
    created_at: partial.created_at ?? "2026-10-01T10:00:00.000Z",
    completed_at: partial.completed_at ?? null,
    location_name: partial.location_name ?? null,
    comments: partial.comments ?? [],
    ...partial,
  };
}

describe("boardPortalTasksUi", () => {
  it("filters and groups tasks by priority (high, medium, low)", () => {
    const tasks = [
      task({ id: "l", priority: "low" }),
      task({ id: "u", priority: "urgent" }),
      task({ id: "m", priority: "medium" }),
    ];
    expect(filterTasksByPriority(tasks, "medium").map((t) => t.id)).toEqual(["m"]);
    expect(groupTasksByPriority(tasks).map((g) => g.priority)).toEqual(["urgent", "medium", "low"]);
    expect(taskPriorityLabel("urgent")).toBe("Wysoki");
  });

  it("validates completed-task date range without fetching", () => {
    expect(validateCompletedDateRange("", "2026-10-05").ok).toBe(false);
    expect(validateCompletedDateRange("2026-10-05", "2026-10-01").ok).toBe(false);
    expect(validateCompletedDateRange("2025-01-01", "2026-12-31").ok).toBe(false);
    expect(validateCompletedDateRange("2026-09-01", "2026-10-05")).toEqual({
      ok: true,
      from: "2026-09-01",
      to: "2026-10-05",
    });
  });
});
