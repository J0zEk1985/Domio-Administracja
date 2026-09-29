import { useState } from "react";
import { format, isValid, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import { Loader2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAddBoardPortalTaskComment, type BoardPortalTask } from "@/hooks/useBoardPortal";

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

function taskStatusLabel(s: string): string {
  if (s === "todo") return "Do zrobienia";
  if (s === "in_progress") return "W toku";
  return s;
}

function taskPriorityLabel(p: string): string {
  if (p === "low") return "Niski";
  if (p === "medium") return "Średni";
  if (p === "urgent") return "Pilny";
  return p;
}

export function BoardPortalTaskCard({ token, task }: { token: string; task: BoardPortalTask }) {
  const [body, setBody] = useState("");
  const addComment = useAddBoardPortalTaskComment(token);

  return (
    <li className="flex flex-col gap-3 rounded-md border border-border/60 p-3">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">
          {task.title}
          {task.location_name?.trim() ? (
            <span className="ml-2 text-xs font-normal text-muted-foreground">{task.location_name}</span>
          ) : null}
        </p>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span>{taskStatusLabel(task.status)}</span>
          <span>·</span>
          <span>{taskPriorityLabel(task.priority)}</span>
          {formatWhen(task.created_at) ? (
            <>
              <span>·</span>
              <span>{formatWhen(task.created_at)}</span>
            </>
          ) : null}
        </div>
      </div>

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
    </li>
  );
}
