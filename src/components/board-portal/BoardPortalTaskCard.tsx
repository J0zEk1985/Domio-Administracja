import { useState } from "react";
import { format, isValid, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import { Loader2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAddBoardPortalTaskComment, type BoardPortalTask } from "@/hooks/useBoardPortal";
import { taskPriorityLabel, taskStatusLabel } from "@/lib/boardPortalTasksUi";

function formatWhen(iso: string | null | undefined): string {
  if (!iso?.trim()) return "";
  try {
    const d = parseISO(iso);
    if (!isValid(d)) return "";
    return format(d, "d MMM yyyy, HH:mm", { locale: pl });
  } catch {
    return "";
  }
}

export function BoardPortalTaskCard({
  token,
  task,
  allowComment = true,
}: {
  token: string;
  task: BoardPortalTask;
  allowComment?: boolean;
}) {
  const [body, setBody] = useState("");
  const addComment = useAddBoardPortalTaskComment(token);
  const doneAt = formatWhen(task.completed_at);
  const createdAt = formatWhen(task.created_at);

  return (
    <li className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <header className="border-b border-border bg-muted/70 px-4 py-3">
        <h3 className="text-base font-semibold leading-snug tracking-tight text-foreground">
          {task.title}
          {task.location_name?.trim() ? (
            <span className="ml-2 text-sm font-normal text-muted-foreground">{task.location_name}</span>
          ) : null}
        </h3>
        <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span>{taskStatusLabel(task.status)}</span>
          <span>·</span>
          <span>{taskPriorityLabel(task.priority)}</span>
          {task.status === "done" && doneAt ? (
            <>
              <span>·</span>
              <span>Zakończono {doneAt}</span>
            </>
          ) : createdAt ? (
            <>
              <span>·</span>
              <span>{createdAt}</span>
            </>
          ) : null}
        </div>
      </header>

      <div className="flex flex-col gap-3 p-4">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Komentarze</p>
          {task.comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak komentarzy.</p>
          ) : (
            <ul className="space-y-2">
              {task.comments.map((c) => (
                <li key={c.id} className="rounded-md bg-muted/40 px-3 py-2">
                  <div className="mb-0.5 flex flex-wrap items-baseline gap-x-2">
                    <span className="text-xs font-medium text-foreground">{c.author_name}</span>
                    {formatWhen(c.created_at) ? (
                      <time className="text-xs text-muted-foreground" dateTime={c.created_at}>
                        {formatWhen(c.created_at)}
                      </time>
                    ) : null}
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm text-foreground/90">{c.content}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {allowComment ? (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              const t = body.trim();
              if (!t || addComment.isPending) return;
              addComment.mutate(
                { taskId: task.id, content: t },
                {
                  onSuccess: () => {
                    setBody("");
                    toast.success("Komentarz został dodany.");
                  },
                  onError: (err) => {
                    toast.error(err instanceof Error ? err.message : "Nie udało się dodać komentarza.");
                  },
                },
              );
            }}
          >
            <label htmlFor={`board-task-comment-${task.id}`} className="sr-only">
              Nowy komentarz
            </label>
            <Textarea
              id={`board-task-comment-${task.id}`}
              placeholder="Napisz komentarz jako Zarząd…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={addComment.isPending}
              rows={3}
              maxLength={4000}
              className="min-h-[72px] resize-y"
            />
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={addComment.isPending || !body.trim()}>
                {addComment.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                    Wysyłanie…
                  </>
                ) : (
                  "Dodaj komentarz"
                )}
              </Button>
            </div>
          </form>
        ) : null}
      </div>
    </li>
  );
}
