import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import { ChevronsUpDown, MessageSquare, Plus } from "lucide-react";
import { useGlobalTasks, type GlobalTaskRow } from "@/hooks/useGlobalTasks";
import {
  useCreateTask,
  useUpdateTaskStatus,
  nextCyclicTaskStatus,
  type CreatePropertyTaskInput,
} from "@/hooks/usePropertyTasks";
import { useProperties, usePropertyAdministrators } from "@/hooks/useProperties";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useIsOrgOwner } from "@/hooks/useIsOrgOwner";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { cn } from "@/lib/utils";
import type { TaskPriority, TaskStatus } from "@/types/propertyTasks";

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Niski",
  medium: "Średni",
  urgent: "Pilny",
};

const BUILDING_FILTER_ALL = "__all__";
const ASSIGNEE_FILTER_ALL = "__all__";
const PRIORITY_FILTER_ALL = "__all_priority__";

function formatTaskDate(iso: string): string {
  try {
    return format(parseISO(iso), "d MMM yyyy, HH:mm", { locale: pl });
  } catch {
    return iso;
  }
}

function initialsFromFullName(name: string | null | undefined): string {
  const n = name?.trim();
  if (!n) return "?";
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0]![0];
    const b = parts[parts.length - 1]![0];
    return `${a}${b}`.toUpperCase();
  }
  return n.slice(0, 2).toUpperCase();
}

function statusAriaLabel(status: TaskStatus): string {
  if (status === "done") return "Ukończone — kliknij, aby zmienić status";
  if (status === "in_progress") return "W toku — kliknij, aby zmienić status";
  return "Do zrobienia — kliknij, aby zmienić status";
}

function checkboxCheckedState(status: TaskStatus): boolean | "indeterminate" {
  if (status === "done") return true;
  if (status === "in_progress") return "indeterminate";
  return false;
}

function GlobalTasksPageSkeleton() {
  return (
    <div className="flex flex-1 flex-col space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-10 w-40" />
      </div>
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-10 w-[200px]" />
        <Skeleton className="h-10 w-[200px]" />
        <Skeleton className="h-10 w-[200px]" />
      </div>
      <div className="space-y-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-border/60 bg-card px-3 py-2.5">
            <Skeleton className="h-9 w-9 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4 max-w-lg" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Tasks() {
  const navigate = useNavigate();
  const [newOpen, setNewOpen] = useState(false);
  const [buildingFilter, setBuildingFilter] = useState<string>(BUILDING_FILTER_ALL);
  const [assigneeFilter, setAssigneeFilter] = useState<string>(ASSIGNEE_FILTER_ALL);
  const [priorityFilter, setPriorityFilter] = useState<string>(PRIORITY_FILTER_ALL);

  const { data: ownerAccess } = useIsOrgOwner();
  const isOwner = ownerAccess?.isOwner === true;
  const teamQuery = useTeamMembers(isOwner);

  const filters = useMemo(
    () => ({
      locationId: buildingFilter === BUILDING_FILTER_ALL ? undefined : buildingFilter,
      assigneeId: !isOwner || assigneeFilter === ASSIGNEE_FILTER_ALL ? undefined : assigneeFilter,
      priorityFilter:
        priorityFilter === PRIORITY_FILTER_ALL ? undefined : (priorityFilter as TaskPriority),
    }),
    [buildingFilter, assigneeFilter, priorityFilter, isOwner],
  );

  const tasksQuery = useGlobalTasks(filters, true);
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

  function handleStatusClick(task: GlobalTaskRow) {
    const next = nextCyclicTaskStatus(task.status);
    updateStatus.mutate({ taskId: task.id, nextStatus: next, locationId: task.location_id });
  }

  const list = tasksQuery.data ?? [];
  const hasProperties = (propertiesQuery.data?.length ?? 0) > 0;

  if (tasksQuery.isLoading) {
    return <GlobalTasksPageSkeleton />;
  }

  return (
    <div className="flex flex-1 flex-col space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">Zadania</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Globalna skrzynka zadań ze wszystkich nieruchomości, do których masz dostęp w administracji.
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

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
        <div className="grid w-full gap-3 sm:grid-cols-2 lg:flex lg:max-w-none lg:flex-1 lg:flex-wrap lg:items-end lg:gap-4">
          <div className="space-y-2 min-w-[200px]">
            <Label htmlFor="tasks-filter-building" className="text-xs text-muted-foreground">
              Budynek
            </Label>
            <Select value={buildingFilter} onValueChange={setBuildingFilter}>
              <SelectTrigger id="tasks-filter-building" className="w-full sm:w-[220px]">
                <SelectValue placeholder="Wszystkie budynki" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={BUILDING_FILTER_ALL}>Wszystkie budynki</SelectItem>
                {(propertiesQuery.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 min-w-[200px]">
            <Label htmlFor="tasks-priority-filter" className="text-xs text-muted-foreground">
              Filtrowanie: Priorytet
            </Label>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger id="tasks-priority-filter" className="w-full sm:w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={PRIORITY_FILTER_ALL}>Wszystkie priorytety</SelectItem>
                <SelectItem value="low">{PRIORITY_LABELS.low}</SelectItem>
                <SelectItem value="medium">{PRIORITY_LABELS.medium}</SelectItem>
                <SelectItem value="urgent">{PRIORITY_LABELS.urgent}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isOwner ? (
            <div className="space-y-2 min-w-[200px]">
              <Label htmlFor="tasks-filter-assignee" className="text-xs text-muted-foreground">
                Pracownik
              </Label>
              <Select
                value={assigneeFilter}
                onValueChange={setAssigneeFilter}
                disabled={teamQuery.isLoading}
              >
                <SelectTrigger id="tasks-filter-assignee" className="w-full sm:w-[220px]">
                  <SelectValue placeholder="Wszyscy" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ASSIGNEE_FILTER_ALL}>Wszyscy</SelectItem>
                  {(teamQuery.data ?? []).map((m) => (
                    <SelectItem key={m.userId} value={m.userId}>
                      {m.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
      </div>

      {tasksQuery.isError ? (
        <p className="rounded-lg border border-dashed border-destructive/40 bg-destructive/5 px-4 py-6 text-center text-sm text-muted-foreground">
          Nie udało się wczytać listy zadań.{" "}
          <Button type="button" variant="link" className="h-auto p-0 align-baseline" onClick={() => tasksQuery.refetch()}>
            Odśwież
          </Button>
        </p>
      ) : list.length === 0 ? (
        <div
          className="flex min-h-[200px] flex-col items-center justify-center rounded-lg border border-dashed border-border/80 bg-muted/10 px-4 py-12 text-center"
          role="status"
        >
          <p className="text-sm text-muted-foreground">
            Brak zadań dla wybranych filtrów lub nie masz jeszcze żadnych zadań.
          </p>
        </div>
      ) : (
        <ul
          className="max-h-[min(640px,calc(100vh-280px))] space-y-1.5 overflow-y-auto pr-1"
          aria-label="Lista zadań"
        >
          {list.map((task) => {
            const buildingName = task.location?.name?.trim() || "—";
            const assigneeName = task.assignee?.full_name?.trim();
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
                  <div
                    data-task-status-control
                    role="button"
                    tabIndex={0}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-transparent transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStatusClick(task);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        handleStatusClick(task);
                      }
                    }}
                    aria-label={statusAriaLabel(task.status)}
                  >
                    <Checkbox
                      checked={checkboxCheckedState(task.status)}
                      disabled={updateStatus.isPending}
                      className="pointer-events-none"
                      aria-hidden
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-semibold text-sm text-foreground">{task.title}</p>
                      <Badge
                        variant="secondary"
                        className="max-w-[min(100%,220px)] shrink-0 truncate font-normal text-xs"
                      >
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

                    {task.assignee_id ? (
                      <Avatar className="h-8 w-8 border border-border/60" title={assigneeName || undefined}>
                        <AvatarFallback className="text-[10px] font-medium">
                          {initialsFromFullName(assigneeName)}
                        </AvatarFallback>
                      </Avatar>
                    ) : null}

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

  const formEnabled = Boolean(locationId.trim());
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
      <DialogContent className="w-[calc(100vw-2rem)] max-w-full sm:max-w-screen-md">
        <DialogHeader>
          <DialogTitle>Nowe zadanie</DialogTitle>
          <DialogDescription>
            Najpierw wybierz budynek — potem uzupełnij szczegóły. Zadanie pojawi się na liście globalnej i na karcie
            nieruchomości.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>
              Nieruchomość <span className="text-destructive">*</span>
            </Label>
            <Popover open={propertyOpen} onOpenChange={setPropertyOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={propertyOpen}
                  className="h-auto min-w-0 w-full max-w-full justify-between gap-2 overflow-hidden py-2 font-normal"
                  disabled={pending || !canSubmit}
                >
                  {selectedProperty ? (
                    <span
                      className="min-w-0 flex-1 truncate text-left"
                      title={`${selectedProperty.name} — ${selectedProperty.address}`}
                    >
                      <span className="text-foreground">{selectedProperty.name}</span>
                      <span className="text-muted-foreground"> — {selectedProperty.address}</span>
                    </span>
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-left text-muted-foreground">
                      Wybierz nieruchomość…
                    </span>
                  )}
                  <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
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
                          className="min-w-0"
                          title={`${p.name} — ${p.address}`}
                          onSelect={() => {
                            setLocationId(p.id);
                            setPropertyOpen(false);
                          }}
                        >
                          <span className="min-w-0 flex-1 truncate">
                            <span className="font-medium">{p.name}</span>
                            <span className="text-muted-foreground"> — {p.address}</span>
                          </span>
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
              disabled={pending || !formEnabled}
              autoComplete="off"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="global-task-priority">Priorytet</Label>
            <Select
              value={priority}
              onValueChange={(v) => setPriority(v as TaskPriority)}
              disabled={pending || !formEnabled}
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
              disabled={pending || !formEnabled || adminsQuery.isLoading}
            >
              <SelectTrigger id="global-task-assignee">
                <SelectValue
                  placeholder={
                    formEnabled ? "Wybierz administratora" : "Najpierw wybierz budynek"
                  }
                />
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
              disabled={pending || !formEnabled}
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
