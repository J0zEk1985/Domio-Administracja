import { useMemo, useState } from "react";
import { ListTodo, Search } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { BoardPortalTaskCard } from "@/components/board-portal/BoardPortalTaskCard";
import {
  useBoardPortalCompletedTasks,
  type BoardPortalCompletedRange,
  type BoardPortalTask,
} from "@/hooks/useBoardPortal";
import {
  filterTasksByPriority,
  groupTasksByPriority,
  type BoardPortalPriorityFilter,
  validateCompletedDateRange,
} from "@/lib/boardPortalTasksUi";

function BoardPortalGroupedTaskList({
  token,
  tasks,
  allowComment,
  emptyMessage,
}: {
  token: string;
  tasks: BoardPortalTask[];
  allowComment: boolean;
  emptyMessage: string;
}) {
  const groups = groupTasksByPriority(tasks);
  if (tasks.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.priority} className="space-y-3">
          <h4 className="text-sm font-semibold tracking-tight text-foreground">
            Priorytet: {group.label}
            <span className="ml-2 text-xs font-normal text-muted-foreground">({group.tasks.length})</span>
          </h4>
          <ul className="space-y-5">
            {group.tasks.map((task) => (
              <BoardPortalTaskCard key={task.id} token={token} task={task} allowComment={allowComment} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function PriorityFilter({
  value,
  onChange,
}: {
  value: BoardPortalPriorityFilter;
  onChange: (value: BoardPortalPriorityFilter) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Priorytet</p>
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(next) => {
          if (next === "all" || next === "low" || next === "medium" || next === "urgent") {
            onChange(next);
          }
        }}
        className="flex flex-wrap justify-start gap-1"
        variant="outline"
        size="sm"
      >
        <ToggleGroupItem value="all" aria-label="Wszystkie priorytety">
          Wszystkie
        </ToggleGroupItem>
        <ToggleGroupItem value="low" aria-label="Priorytet niski">
          Niski
        </ToggleGroupItem>
        <ToggleGroupItem value="medium" aria-label="Priorytet średni">
          Średni
        </ToggleGroupItem>
        <ToggleGroupItem value="urgent" aria-label="Priorytet wysoki">
          Wysoki
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}

export function BoardPortalTasksCard({ token, openTasks }: { token: string; openTasks: BoardPortalTask[] }) {
  const [tab, setTab] = useState<"open" | "done">("open");
  const [priority, setPriority] = useState<BoardPortalPriorityFilter>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [submittedRange, setSubmittedRange] = useState<BoardPortalCompletedRange | null>(null);

  const completed = useBoardPortalCompletedTasks(token, tab === "done" ? submittedRange : null);
  const filteredOpen = useMemo(() => filterTasksByPriority(openTasks, priority), [openTasks, priority]);
  const filteredDone = useMemo(
    () => filterTasksByPriority(completed.data ?? [], priority),
    [completed.data, priority],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ListTodo className="h-4 w-4" aria-hidden />
          Zadania
        </CardTitle>
        <CardDescription>Tylko zadania oznaczone jako widoczne dla Zarządu.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v === "done" ? "done" : "open")}>
          <TabsList className="h-auto w-full flex-wrap justify-start">
            <TabsTrigger value="open">Bieżące</TabsTrigger>
            <TabsTrigger value="done">Zakończone</TabsTrigger>
          </TabsList>

          <div className="mt-4">
            <PriorityFilter value={priority} onChange={setPriority} />
          </div>

          <TabsContent value="open" className="mt-4">
            <BoardPortalGroupedTaskList
              token={token}
              tasks={filteredOpen}
              allowComment
              emptyMessage={
                openTasks.length === 0
                  ? "Brak zadań udostępnionych Zarządowi."
                  : "Brak bieżących zadań o wybranym priorytecie."
              }
            />
          </TabsContent>

          <TabsContent value="done" className="mt-4 space-y-4">
            <form
              className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                const parsed = validateCompletedDateRange(fromDate, toDate);
                if (!parsed.ok) {
                  toast.error(parsed.message);
                  return;
                }
                setSubmittedRange({ from: parsed.from, to: parsed.to });
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="board-completed-from">Data od</Label>
                <Input
                  id="board-completed-from"
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="board-completed-to">Data do</Label>
                <Input
                  id="board-completed-to"
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </div>
              <Button type="submit">
                <Search className="mr-2 h-4 w-4" aria-hidden />
                Wyszukaj
              </Button>
            </form>
            <p className="text-xs text-muted-foreground">
              Zakończone zadania są pobierane z bazy dopiero po kliknięciu „Wyszukaj”.
            </p>

            {submittedRange === null ? (
              <p className="text-sm text-muted-foreground">
                Wybierz przedział dat i kliknij „Wyszukaj”, aby zobaczyć zakończone zadania.
              </p>
            ) : completed.isPending ? (
              <div className="space-y-3" aria-busy="true">
                <p className="text-sm text-muted-foreground">Wyszukiwanie zakończonych zadań…</p>
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : completed.isError ? (
              <p className="text-sm text-destructive">
                {completed.error instanceof Error
                  ? completed.error.message
                  : "Nie udało się wczytać zakończonych zadań."}
              </p>
            ) : (
              <BoardPortalGroupedTaskList
                token={token}
                tasks={filteredDone}
                allowComment={false}
                emptyMessage={
                  (completed.data?.length ?? 0) === 0
                    ? "Brak zakończonych zadań w wybranym okresie."
                    : "Brak zakończonych zadań o wybranym priorytecie w tym okresie."
                }
              />
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
