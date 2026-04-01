import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import {
  CheckCircle2,
  ChevronsUpDown,
  Circle,
  Loader2,
  MessageSquare,
  Plus,
} from "lucide-react";
import { useAllTasks, type GlobalTaskRow } from "@/hooks/useGlobalTasks";
import {
  useCreateTask,
  useUpdateTaskStatus,
  nextCyclicTaskStatus,
  type CreatePropertyTaskInput,
} from "@/hooks/usePropertyTasks";
import { useProperties, usePropertyAdministrators } from "@/hooks/useProperties";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import type { TaskPriority, TaskStatus } from "@/types/propertyTasks";

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Niski",
  medium: "Średni",
  urgent: "Pilny",
};

type StatusFilter = "all" | "todo" | "in_progress";

function formatTaskDate(iso: string): string {
  try {
    return format(parseISO(iso), "d MMM yyyy, HH:mm", { locale: pl });
  } catch {
    return iso;
  }
}

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

function GlobalTasksPageSkeleton() {
  return (
    <div className="flex flex-1 flex-col space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-10 w-40" />
      </div>
      <Skeleton className="h-10 w-full max-w-md" />
      <div className="space-y-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-border/60 bg-card px-3 py-2.5">
            <Skeleton className="h-9 w-9 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4 max-w-lg" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-6 w-14" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Tasks() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [newOpen, setNewOpen] = useState(false);

  const tasksQuery = useAllTasks(true);
  const propertiesQuery = useProperties(true);
  const createTask = useCreateTask();
  const updateStatus = useUpdateTaskStatus();

  useEffect(() => {
    if (!tasksQuery.isError || !tasksQuery.error) return;
    const msg =
      tasksQuery.error instanceof Error
        ? tasksQuery.error.message
        : "Nie udało się wczytać zadań.";
    toast.error(msg);
    console.error("[Tasks] tasks query:", tasksQuery.error);
  }, [tasksQuery.isError, tasksQuery.error]);

  const filteredTasks = useMemo(() => {
    const list = tasksQuery.data ?? [];
    if (filter === "all") return list;
    if (filter === "todo") return list.filter((t) => t.status === "todo");
    return list.filter((t) => t.status === "in_progress");
  }, [tasksQuery.data, filter]);

  function handleStatusClick(task: GlobalTaskRow) {
    const next = nextCyclicTaskStatus(task.status);
    updateStatus.mutate({ taskId: task.id, nextStatus: next, locationId: task.location_id });
  }

  const hasProperties = (propertiesQuery.data?.length ?? 0) > 0;

  if (tasksQuery.isLoading) {
    return <GlobalTasksPageSkeleton />;
  }

  return (
    <div className="flex flex-1 flex-col space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">Wszystkie zadania</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Zadania ze wszystkich nieruchomości, do których masz dostęp w administracji.
          </p>
        </div>
        <Button
          type="button"
          className="shrink-0 gap-2"
          onClick={() => setNewOpen(true)}
          disabled={!hasProperties}
        >
          <Plus className="h-4 w-4" aria-hidden />
          Nowe zadanie
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ToggleGroup
          type="single"
          value={filter}
          onValueChange={(v) => {
            if (v) setFilter(v as StatusFilter);
          }}
          className="justify-start"
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="all" aria-label="Wszystkie zadania">
            Wszystkie
          </ToggleGroupItem>
          <ToggleGroupItem value="todo" aria-label="Do zrobienia">
            Do zrobienia
          </ToggleGroupItem>
          <ToggleGroupItem value="in_progress" aria-label="W trakcie">
            W trakcie
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {tasksQuery.isError ? (
        <p className="rounded-lg border border-dashed border-destructive/40 bg-destructive/5 px-4 py-6 text-center text-sm text-muted-foreground">
          Nie udało się wczytać listy zadań.{" "}
          <Button type="button" variant="link" className="h-auto p-0 align-baseline" onClick={() => tasksQuery.refetch()}>
            Odśwież
          </Button>
        </p>
      ) : filteredTasks.length === 0 ? (
        <div
          className="flex min-h-[200px] flex-col items-center justify-center rounded-lg border border-dashed border-border/80 bg-muted/10 px-4 py-12 text-center"
          role="status"
        >
          <p className="text-sm text-muted-foreground">
            {tasksQuery.data?.length === 0
              ? "Brak zadań dla Twoich nieruchomości."
              : "Brak zadań dla wybranego filtru."}
          </p>
        </div>
      ) : (
        <ul className="max-h-[min(640px,calc(100vh-240px))] space-y-1.5 overflow-y-auto pr-1" aria-label="Lista zadań">
          {filteredTasks.map((task) => {
            const buildingName = task.location?.name?.trim() || "—";
            return (
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
                    navigate(`/properties/${task.location_id}/tasks/${task.id}`);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate(`/properties/${task.location_id}/tasks/${task.id}`);
                    }
                  }}
                >
                  <button
                    type="button"
                    data-task-status-control
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-transparent transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStatusClick(task);
                    }}
                    disabled={updateStatus.isPending}
                    aria-label={statusAriaLabel(task.status)}
                  >
                    <TaskStatusIcon status={task.status} />
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-semibold text-sm text-foreground">{task.title}</p>
                      <Badge variant="secondary" className="max-w-[min(100%,200px)] shrink-0 truncate font-normal text-xs">
                        {buildingName}
                      </Badge>
                    </div>
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
            );
          })}
        </ul>
      )}

      <GlobalNewTaskDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        properties={propertiesQuery.data ?? []}
        createTask={createTask}
        canSubmit={hasProperties}
      />
    </div>
  );
}

type PropertyRow = { id: string; name: string; address: string };

function GlobalNewTaskDialog({
  open,
  onOpenChange,
  properties,
  createTask,
  canSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  properties: PropertyRow[];
  createTask: ReturnType<typeof useCreateTask>;
  canSubmit: boolean;
}) {
  const [locationId, setLocationId] = useState("");
  const [propertyOpen, setPropertyOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [assigneeId, setAssigneeId] = useState<string>("__none__");
  const [boardVisible, setBoardVisible] = useState(false);

  const adminsQuery = usePropertyAdministrators(locationId || undefined, Boolean(open && locationId));

  useEffect(() => {
    if (!open) {
      setLocationId("");
      setTitle("");
      setPriority("medium");
      setAssigneeId("__none__");
      setBoardVisible(false);
      setPropertyOpen(false);
    }
  }, [open]);

  useEffect(() => {
    setAssigneeId("__none__");
  }, [locationId]);

  const selectedProperty = useMemo(
    () => properties.find((p) => p.id === locationId),
    [properties, locationId],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !locationId) {
      toast.error("Wybierz nieruchomość.");
      return;
    }
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
            Wybierz budynek, potem uzupełnij szczegóły. Zadanie zapisze się na liście globalnej i na karcie nieruchomości.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Nieruchomość</Label>
            <Popover open={propertyOpen} onOpenChange={setPropertyOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={propertyOpen}
                  className="w-full justify-between font-normal"
                  disabled={pending || !canSubmit}
                >
                  {selectedProperty ? (
                    <span className="truncate text-left">
                      {selectedProperty.name}
                      <span className="ml-1 text-muted-foreground">— {selectedProperty.address}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Wybierz nieruchomość…</span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Szukaj budynku…" />
                  <CommandList className="max-h-[min(60vh,280px)]">
                    <CommandEmpty>Brak wyników.</CommandEmpty>
                    <CommandGroup heading="Twoje nieruchomości">
                      {properties.map((p) => (
                        <CommandItem
                          key={p.id}
                          value={`${p.name} ${p.address}`}
                          onSelect={() => {
                            setLocationId(p.id);
                            setPropertyOpen(false);
                          }}
                        >
                          <span className="font-medium">{p.name}</span>
                          <span className="ml-1 text-muted-foreground">— {p.address}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label htmlFor="global-task-title">Tytuł</Label>
            <Input
              id="global-task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Np. Przegląd instalacji"
              disabled={pending}
              autoComplete="off"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="global-task-priority">Priorytet</Label>
            <Select
              value={priority}
              onValueChange={(v) => setPriority(v as TaskPriority)}
              disabled={pending}
            >
              <SelectTrigger id="global-task-priority">
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
            <Label htmlFor="global-task-assignee">Przypisz do</Label>
            <Select
              value={assigneeId}
              onValueChange={setAssigneeId}
              disabled={pending || !locationId || adminsQuery.isLoading}
            >
              <SelectTrigger id="global-task-assignee">
                <SelectValue placeholder={locationId ? "Wybierz administratora" : "Najpierw wybierz budynek"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Nie przypisuj</SelectItem>
                {(adminsQuery.data ?? []).map((a) => (
                  <SelectItem key={a.userId} value={a.userId}>
                    {a.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="space-y-0.5">
              <Label htmlFor="global-task-visibility" className="text-sm font-medium">
                Widoczne dla Zarządu
              </Label>
              <p id="global-task-vis-desc" className="text-xs text-muted-foreground">
                Włączone: zadanie może być widoczne na tablicy wspólnoty. Wyłączone: tylko zespół administracji.
              </p>
            </div>
            <Switch
              id="global-task-visibility"
              checked={boardVisible}
              onCheckedChange={setBoardVisible}
              disabled={pending}
              aria-describedby="global-task-vis-desc"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Anuluj
            </Button>
            <Button type="submit" disabled={pending || !locationId || !canSubmit}>
              {pending ? "Zapisywanie…" : "Utwórz zadanie"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
