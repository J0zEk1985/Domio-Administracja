import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import { CheckCircle2, Circle, Loader2, MessageSquare, Plus, Search } from "lucide-react";
import {
  useCreateTask,
  usePropertyTasksCanEdit,
  useTasks,
  useUpdateTaskStatus,
  nextCyclicTaskStatus,
  type CreatePropertyTaskInput,
} from "@/hooks/usePropertyTasks";
import { usePropertyAdministrators, type PropertyAdministratorRow } from "@/hooks/useProperties";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { PropertyTaskWithCommentCount, TaskPriority, TaskStatus } from "@/types/propertyTasks";

function formatTaskDate(iso: string): string {
  try {
    return format(parseISO(iso), "d MMM yyyy, HH:mm", { locale: pl });
  } catch {
    return iso;
  }
}

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Niski",
  medium: "Średni",
  urgent: "Pilny",
};

const STATUS_FILTER_OPTIONS: { value: "all" | TaskStatus; label: string }[] = [
  { value: "all", label: "Wszystkie statusy" },
  { value: "todo", label: "Do zrobienia" },
  { value: "in_progress", label: "W toku" },
  { value: "done", label: "Ukończone" },
];

function TaskStatusIcon({ status, className }: { status: TaskStatus; className?: string }) {
  if (status === "done") {
    return <CheckCircle2 className={cn("h-5 w-5 text-emerald-600", className)} aria-hidden />;
  }
  if (status === "in_progress") {
    return <Loader2 className={cn("h-5 w-5 animate-spin text-muted-foreground", className)} aria-hidden />;
  }
  return <Circle className={cn("h-5 w-5 text-muted-foreground", className)} aria-hidden />;
}

function statusAriaLabel(status: TaskStatus): string {
  if (status === "done") return "Ukończone — kliknij, aby zmienić status";
  if (status === "in_progress") return "W toku — kliknij, aby zmienić status";
  return "Do zrobienia — kliknij, aby zmienić status";
}

function PropertyTasksListSkeleton() {
  return (
    <div className="space-y-2" role="status" aria-label="Ładowanie zadań">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg border border-border/60 bg-card px-3 py-2.5"
        >
          <Skeleton className="h-9 w-9 shrink-0 rounded-md" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 max-w-sm w-[min(100%,20rem)]" />
            <Skeleton className="h-3 w-40" />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Skeleton className="h-6 w-14" />
            <Skeleton className="h-6 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

type NewTaskDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locationId: string;
  administrators: PropertyAdministratorRow[];
  createTask: ReturnType<typeof useCreateTask>;
  canEdit: boolean;
};

function NewPropertyTaskDialog({
  open,
  onOpenChange,
  locationId,
  administrators,
  createTask,
  canEdit,
}: NewTaskDialogProps) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [assigneeId, setAssigneeId] = useState<string>("__none__");
  const [boardVisible, setBoardVisible] = useState(false);

  useEffect(() => {
    if (!open) {
      setTitle("");
      setPriority("medium");
      setAssigneeId("__none__");
      setBoardVisible(false);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error("Podaj tytuł zadania.");
      return;
    }

    const input: CreatePropertyTaskInput = {
      locationId,
      title: trimmed,
      priority,
      visibility: boardVisible ? "board_visible" : "internal_only",
      assignee_id: assigneeId === "__none__" ? null : assigneeId,
    };

    try {
      await createTask.mutateAsync(input);
      toast.success("Dodano zadanie.");
      onOpenChange(false);
    } catch {
      /* toast w hooku */
    }
  }

  const pending = createTask.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nowe zadanie</DialogTitle>
          <DialogDescription>
            Zadanie jest przypisane do tej nieruchomości. Widoczność na tablicy wspólnoty możesz włączyć poniżej.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task-title">Tytuł</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Np. Przegląd instalacji"
              disabled={pending || !canEdit}
              autoComplete="off"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-priority">Priorytet</Label>
            <Select
              value={priority}
              onValueChange={(v) => setPriority(v as TaskPriority)}
              disabled={pending || !canEdit}
            >
              <SelectTrigger id="task-priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PRIORITY_LABELS) as TaskPriority[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-assignee">Przypisz do</Label>
            <Select value={assigneeId} onValueChange={setAssigneeId} disabled={pending || !canEdit}>
              <SelectTrigger id="task-assignee">
                <SelectValue placeholder="Wybierz administratora" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Nie przypisuj</SelectItem>
                {administrators.map((a) => (
                  <SelectItem key={a.userId} value={a.userId}>
                    {a.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="space-y-0.5">
              <Label htmlFor="task-visibility" className="text-sm font-medium">
                Widoczne na tablicy wspólnoty
              </Label>
              <p id="task-visibility-desc" className="text-xs text-muted-foreground">
                Włączone: zadanie może być widoczne dla mieszkańców (zgodnie z modułem tablicy). Wyłączone: tylko zespół
                administracji.
              </p>
            </div>
            <Switch
              id="task-visibility"
              checked={boardVisible}
              onCheckedChange={setBoardVisible}
              disabled={pending || !canEdit}
              aria-describedby="task-visibility-desc"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Anuluj
            </Button>
            <Button type="submit" disabled={pending || !canEdit}>
              {pending ? "Zapisywanie…" : "Utwórz zadanie"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export type PropertyTasksTabProps = {
  locationId: string;
  /** Gdy false — lista tylko do odczytu (bez tworzenia i zmiany statusu). */
  canEdit: boolean;
  /** Gdy true — uprawnienia do edycji są jeszcze weryfikowane; mutacje pozostają zablokowane. */
  editPermissionPending?: boolean;
};

export function PropertyTasksTab({ locationId, canEdit, editPermissionPending = false }: PropertyTasksTabProps) {
  const navigate = useNavigate();
  const allowMutations = canEdit && !editPermissionPending;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | TaskStatus>("all");
  const [newOpen, setNewOpen] = useState(false);

  const tasksQuery = useTasks(locationId, true);
  const adminsQuery = usePropertyAdministrators(locationId, Boolean(locationId));
  const createTask = useCreateTask();
  const updateStatus = useUpdateTaskStatus();

  useEffect(() => {
    if (!tasksQuery.isError || !tasksQuery.error) return;
    const msg =
      tasksQuery.error instanceof Error
        ? tasksQuery.error.message
        : "Nie udało się wczytać zadań dla tej nieruchomości.";
    toast.error(msg);
    console.error("[PropertyTasksTab] tasks query:", tasksQuery.error);
  }, [tasksQuery.isError, tasksQuery.error]);

  const filteredTasks = useMemo(() => {
    const list = tasksQuery.data ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (q && !t.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tasksQuery.data, search, statusFilter]);

  function handleStatusClick(task: PropertyTaskWithCommentCount) {
    if (!allowMutations) return;
    const next = nextCyclicTaskStatus(task.status);
    updateStatus.mutate({ taskId: task.id, nextStatus: next, locationId });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1 max-w-md">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              placeholder="Szukaj po tytule…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              aria-label="Filtruj zadania po tytule"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | TaskStatus)}>
            <SelectTrigger className="w-full sm:w-[200px]" aria-label="Filtr statusu zadania">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          className="shrink-0 gap-2"
          onClick={() => setNewOpen(true)}
          disabled={!allowMutations}
          aria-disabled={!allowMutations}
        >
          <Plus className="h-4 w-4" aria-hidden />
          Nowe zadanie
        </Button>
      </div>

      {editPermissionPending && (
        <p className="text-xs text-muted-foreground" role="status">
          Sprawdzanie uprawnień do edycji…
        </p>
      )}
      {!allowMutations && !editPermissionPending && (
        <p className="text-xs text-muted-foreground" role="status">
          Masz dostęp tylko do podglądu zadań dla tego budynku.
        </p>
      )}

      {tasksQuery.isLoading ? (
        <PropertyTasksListSkeleton />
      ) : tasksQuery.isError ? (
        <p className="rounded-lg border border-dashed border-destructive/40 bg-destructive/5 px-4 py-6 text-center text-sm text-muted-foreground">
          Nie udało się wczytać listy zadań.{" "}
          <Button type="button" variant="link" className="h-auto p-0 align-baseline" onClick={() => tasksQuery.refetch()}>
            Odśwież
          </Button>
        </p>
      ) : filteredTasks.length === 0 ? (
        <div
          className="flex min-h-[160px] flex-col items-center justify-center rounded-lg border border-dashed border-border/80 bg-muted/10 px-4 py-10 text-center"
          role="status"
        >
          <p className="text-sm text-muted-foreground">
            {tasksQuery.data?.length === 0
              ? "Brak zadań dla tej nieruchomości."
              : "Brak wyników dla wybranych filtrów."}
          </p>
        </div>
      ) : (
        <ul
          className="max-h-[min(560px,calc(100vh-280px))] space-y-1.5 overflow-y-auto pr-1"
          aria-label="Lista zadań nieruchomości"
        >
          {filteredTasks.map((task) => (
            <li key={task.id}>
              <div
                role="link"
                tabIndex={0}
                aria-label={`Otwórz zadanie: ${task.title}`}
                className={cn(
                  "group flex cursor-pointer items-center gap-3 rounded-lg border border-border/60 bg-card px-3 py-2.5 shadow-sm transition-colors",
                  "hover:border-border hover:bg-muted/20",
                )}
                onClick={(e) => {
                  const t = e.target as HTMLElement;
                  if (t.closest("[data-task-status-control]")) return;
                  navigate(`/properties/${locationId}/tasks/${task.id}`);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate(`/properties/${locationId}/tasks/${task.id}`);
                  }
                }}
              >
                <button
                  type="button"
                  data-task-status-control
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-transparent transition-colors",
                    allowMutations && "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    !allowMutations && "cursor-default opacity-80",
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStatusClick(task);
                  }}
                  disabled={!allowMutations || updateStatus.isPending}
                  aria-label={statusAriaLabel(task.status)}
                >
                  <TaskStatusIcon status={task.status} />
                </button>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-sm text-foreground">{task.title}</p>
                  <p className="text-xs text-muted-foreground">Utworzono {formatTaskDate(task.created_at)}</p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1 rounded-md bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground"
                    title="Liczba komentarzy"
                  >
                    <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                    <span>{task.comments_count}</span>
                  </span>

                  <Badge
                    variant="outline"
                    className={cn(
                      "gap-1.5 border-0 bg-transparent px-1.5 font-normal text-muted-foreground",
                      task.priority === "urgent" && "text-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        task.priority === "urgent" && "bg-red-500",
                        task.priority === "medium" && "bg-amber-500",
                        task.priority === "low" && "bg-slate-400",
                      )}
                      aria-hidden
                    />
                    {PRIORITY_LABELS[task.priority]}
                  </Badge>

                  {task.visibility === "board_visible" ? (
                    <Badge variant="secondary" className="text-[10px] font-medium uppercase tracking-wide">
                      Tablica
                    </Badge>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <NewPropertyTaskDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        locationId={locationId}
        administrators={adminsQuery.data ?? []}
        createTask={createTask}
        canEdit={allowMutations}
      />
    </div>
  );
}

/** Wrapper ładujący uprawnienia do edycji zadań (Owner lub location_access administration). */
export function PropertyTasksTabWithAccess({ locationId }: { locationId: string }) {
  const canEditQuery = usePropertyTasksCanEdit(locationId);

  useEffect(() => {
    if (!canEditQuery.isError || !canEditQuery.error) return;
    toast.error(
      canEditQuery.error instanceof Error
        ? canEditQuery.error.message
        : "Nie udało się sprawdzić uprawnień do zadań.",
    );
    console.error("[PropertyTasksTabWithAccess] canEdit:", canEditQuery.error);
  }, [canEditQuery.isError, canEditQuery.error]);

  if (canEditQuery.isError) {
    return (
      <p className="text-sm text-destructive">
        Nie udało się sprawdzić uprawnień.{" "}
        <Button type="button" variant="link" className="h-auto p-0" onClick={() => canEditQuery.refetch()}>
          Spróbuj ponownie
        </Button>
      </p>
    );
  }

  return (
    <PropertyTasksTab
      locationId={locationId}
      canEdit={canEditQuery.data === true}
      editPermissionPending={canEditQuery.isLoading}
    />
  );
}
