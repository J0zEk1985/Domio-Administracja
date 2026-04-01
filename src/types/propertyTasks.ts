/**
 * Domain types for Property Tasks & Notes (entity-bound task management).
 * Keep in sync with Supabase enums and tables: property_tasks, task_comments.
 */

export type TaskStatus = "todo" | "in_progress" | "done";

export type TaskPriority = "low" | "medium" | "urgent";

export type TaskVisibility = "internal_only" | "board_visible";

export interface PropertyTask {
  id: string;
  location_id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  visibility: TaskVisibility;
  assignee_id?: string | null;
  created_by: string;
  created_at: string;
}

export interface TaskComment {
  id: string;
  task_id: string;
  author_id: string;
  content: string;
  created_at: string;
}

/** Row returned by list RPC / aggregate query with comment counts (avoids N+1). */
export interface PropertyTaskWithCommentCount extends PropertyTask {
  comments_count: number;
}
