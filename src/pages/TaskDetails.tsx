import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  useCreateTaskComment,
  useTaskComments,
  useTaskDetails,
  useUpdateTask,
  type TaskCommentWithAuthor,
} from "@/hooks/useTaskDetails";
import { usePropertyAdministrators } from "@/hooks/useProperties";
import { usePropertyTasksCanEdit } from "@/hooks/usePropertyTasks";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { TaskPriority, TaskStatus, TaskVisibility } from "@/types/propertyTasks";

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: "low", label: "Niski" },
  { value: "medium", label: "Średni" },
  { value: "urgent", label: "Pilny" },
];

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "Do zrobienia" },
  { value: "in_progress", label: "W trakcie" },
  { value: "done", label: "Gotowe" },
];

function formatDetailDate(iso: string): string {
  try {
    return format(parseISO(iso), "d MMMM yyyy, HH:mm", { locale: pl });
  } catch {
    return iso;
  }
}

function formatCommentTime(iso: string): string {
  try {
    return format(parseISO(iso), "d MMM yyyy, HH:mm", { locale: pl });
  } catch {
    return iso;
  }
}

function initialsFromName(name: string | null | undefined): string {
  const t = name?.trim();
  if (!t) return "?";
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
  }
  return t.slice(0, 2).toUpperCase();
}

function TaskMainColumnSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-10 w-full max-w-2xl" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-16 w-full rounded-lg" />
            </div>
          </div>
        ))}
      </div>
      <Skeleton className="h-24 w-full rounded-lg" />
    </div>
  );
}

function TaskSidebarSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  );
}

function CommentBubble({ comment }: { comment: TaskCommentWithAuthor }) {
  const name = comment.author?.full_name?.trim() || "Użytkownik";
  return (
    <div className="flex gap-3">
      <Avatar className="h-9 w-9 shrink-0 border border-border/60">
        <AvatarFallback className="text-xs font-medium">{initialsFromName(comment.author?.full_name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm font-medium text-foreground">{name}</span>
          <time className="text-xs text-muted-foreground" dateTime={comment.created_at}>
            {formatCommentTime(comment.created_at)}
          </time>
        </div>
        <div
          className={cn(
            "rounded-lg rounded-tl-none border border-border/60 bg-muted/30 px-3 py-2 text-sm text-foreground",
            "whitespace-pre-wrap break-words",
          )}
        >
          {comment.content}
        </div>
      </div>
    </div>
  );
}

export default function TaskDetails() {
  const { id: propertyId, taskId } = useParams<{ id: string; taskId: string }>();
  const navigate = useNavigate();

  const [commentBody, setCommentBody] = useState("");

  const taskQuery = useTaskDetails(taskId, Boolean(taskId));
  const commentsQuery = useTaskComments(taskId, Boolean(taskId));
  const canEditQuery = usePropertyTasksCanEdit(propertyId);
  const adminsQuery = usePropertyAdministrators(propertyId, Boolean(propertyId && taskQuery.isSuccess));

  const createComment = useCreateTaskComment(taskId);
  const updateTask = useUpdateTask(taskId, taskQuery.data?.location_id);

  const locationId = taskQuery.data?.location_id;
  const allowMutations = canEditQuery.data === true && !canEditQuery.isLoading;

  useEffect(() => {
    if (!taskQuery.isError || !taskQuery.error) return;
    const err = taskQuery.error;
    const msg =
      err instanceof Error && err.message === "TASK_NOT_FOUND"
        ? "Nie znaleziono zadania lub nie masz do niego dostępu."
        : err instanceof Error
          ? err.message
          : "Nie udało się wczytać zadania.";
    toast.error(msg);
    console.error("[TaskDetails] task query:", err);
  }, [taskQuery.isError, taskQuery.error]);

  useEffect(() => {
    if (!commentsQuery.isError || !commentsQuery.error) return;
    toast.error(
      commentsQuery.error instanceof Error
        ? commentsQuery.error.message
        : "Nie udało się wczytać komentarzy.",
    );
    console.error("[TaskDetails] comments query:", commentsQuery.error);
  }, [commentsQuery.isError, commentsQuery.error]);

  useEffect(() => {
    if (!canEditQuery.isError || !canEditQuery.error) return;
    toast.error(
      canEditQuery.error instanceof Error
        ? canEditQuery.error.message
        : "Nie udało się sprawdzić uprawnień.",
    );
    console.error("[TaskDetails] canEdit:", canEditQuery.error);
  }, [canEditQuery.isError, canEditQuery.error]);

  const creatorName = taskQuery.data?.creator?.full_name?.trim() || "—";

  const sortedComments = useMemo(() => commentsQuery.data ?? [], [commentsQuery.data]);

  if (!propertyId || !taskId) {
    return <Navigate to="/properties" replace />;
  }

  const isNotFound =
    taskQuery.isError &&
    taskQuery.error instanceof Error &&
    taskQuery.error.message === "TASK_NOT_FOUND";

  if (taskQuery.isError && isNotFound) {
    return (
      <div className="flex-1 space-y-4 p-6">
        <Button type="button" variant="ghost" size="sm" className="gap-2 -ml-2" onClick={() => navigate(`/properties/${propertyId}`)}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Wróć do budynku
        </Button>
        <Alert variant="destructive">
          <AlertDescription>
            Nie znaleziono zadania lub nie masz uprawnień do jego podglądu. Mogło zostać usunięte albo zostałeś odłączony
            od budynku.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (taskQuery.isError && !isNotFound) {
    return (
      <div className="flex-1 space-y-4 p-6">
        <Button type="button" variant="ghost" size="sm" className="gap-2 -ml-2" onClick={() => navigate(`/properties/${propertyId}`)}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Wróć do budynku
        </Button>
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <span>
              {taskQuery.error instanceof Error ? taskQuery.error.message : "Nie udało się wczytać zadania."}
            </span>
            <Button type="button" variant="link" className="h-auto p-0" onClick={() => taskQuery.refetch()}>
              Spróbuj ponownie
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const task = taskQuery.data;

  return (
    <div className="flex-1 space-y-6 p-6">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="gap-2 -ml-2"
        onClick={() => navigate(`/properties/${propertyId}`)}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Wróć do budynku
      </Button>

      <div className="grid gap-8 lg:grid-cols-3 lg:gap-10">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {taskQuery.isLoading ? (
            <TaskMainColumnSkeleton />
          ) : task ? (
            <>
              <header className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{task.title}</h1>
                <p className="text-sm text-muted-foreground">
                  Utworzone przez <span className="font-medium text-foreground/90">{creatorName}</span> dnia{" "}
                  {formatDetailDate(task.created_at)}
                </p>
              </header>

              <section className="space-y-4" aria-label="Komentarze">
                <h2 className="text-sm font-medium text-muted-foreground">Aktywność</h2>
                {commentsQuery.isLoading ? (
                  <div className="space-y-4">
                    {[1, 2].map((i) => (
                      <div key={i} className="flex gap-3">
                        <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-20 w-full rounded-lg" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : sortedComments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Brak komentarzy — zacznij wątek poniżej.</p>
                ) : (
                  <ul className="space-y-6">
                    {sortedComments.map((c) => (
                      <li key={c.id}>
                        <CommentBubble comment={c} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <div className="sticky bottom-0 border-t border-border/60 bg-background/95 pb-2 pt-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!allowMutations || !locationId) return;
                    const t = commentBody.trim();
                    if (!t) return;
                    createComment.mutate(
                      { content: t, locationId },
                      {
                        onSuccess: () => setCommentBody(""),
                      },
                    );
                  }}
                >
                  <Label htmlFor="task-comment" className="sr-only">
                    Nowy komentarz
                  </Label>
                  <Textarea
                    id="task-comment"
                    placeholder={allowMutations ? "Napisz komentarz…" : "Brak uprawnień do dodawania komentarzy."}
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    disabled={!allowMutations || createComment.isPending}
                    rows={3}
                    className="resize-y min-h-[80px]"
                  />
                  <div className="flex justify-end">
                    <Button type="submit" disabled={!allowMutations || createComment.isPending || !commentBody.trim()}>
                      {createComment.isPending ? (
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
              </div>
            </>
          ) : null}
        </div>

        <aside className="min-w-0 lg:col-span-1">
          {taskQuery.isLoading ? (
            <Card className="border-border/60 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Właściwości</CardTitle>
                <CardDescription>Ustawienia zadania</CardDescription>
              </CardHeader>
              <CardContent>
                <TaskSidebarSkeleton />
              </CardContent>
            </Card>
          ) : task ? (
            <Card className="border-border/60 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Właściwości</CardTitle>
                <CardDescription>Zmiany zapisują się od razu</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="task-status">Status</Label>
                  <Select
                    value={task.status}
                    onValueChange={(v) => updateTask.mutate({ status: v as TaskStatus })}
                    disabled={!allowMutations || updateTask.isPending}
                  >
                    <SelectTrigger id="task-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="task-assignee">Przypisano do</Label>
                  <Select
                    value={task.assignee_id ?? "__none__"}
                    onValueChange={(v) =>
                      updateTask.mutate({ assignee_id: v === "__none__" ? null : v })
                    }
                    disabled={!allowMutations || updateTask.isPending || adminsQuery.isLoading}
                  >
                    <SelectTrigger id="task-assignee">
                      <SelectValue placeholder="Wybierz osobę" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Nie przypisano</SelectItem>
                      {(adminsQuery.data ?? []).map((a) => (
                        <SelectItem key={a.userId} value={a.userId}>
                          {a.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="task-priority">Priorytet</Label>
                  <Select
                    value={task.priority}
                    onValueChange={(v) => updateTask.mutate({ priority: v as TaskPriority })}
                    disabled={!allowMutations || updateTask.isPending}
                  >
                    <SelectTrigger id="task-priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITY_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-muted/15 p-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="task-visibility" className="text-sm font-medium">
                      Widoczne dla Zarządu
                    </Label>
                    <p id="task-vis-desc" className="text-xs text-muted-foreground">
                      Gdy włączone, zadanie może być widoczne na tablicy wspólnoty.
                    </p>
                  </div>
                  <Switch
                    id="task-visibility"
                    checked={task.visibility === "board_visible"}
                    onCheckedChange={(checked) =>
                      updateTask.mutate({ visibility: checked ? "board_visible" : "internal_only" })
                    }
                    disabled={!allowMutations || updateTask.isPending}
                    aria-describedby="task-vis-desc"
                  />
                </div>

                {!allowMutations && !canEditQuery.isLoading && (
                  <p className="text-xs text-muted-foreground">Masz tylko podgląd — edycja jest zablokowana.</p>
                )}
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
