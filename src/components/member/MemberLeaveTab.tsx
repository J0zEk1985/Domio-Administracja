import { useMemo, useState } from "react";
import { format, isValid, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import { CalendarIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { MemberDetailsData } from "@/hooks/useMemberDetails";
import {
  useAdminTeamPickList,
  useCreateStaffLeave,
  useMemberLeaves,
} from "@/hooks/useMemberDetails";
import { toast } from "@/components/ui/sonner";

type Props = {
  member: MemberDetailsData;
};

function toIsoDate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function formatLeavePeriod(isoFrom: string, isoTo: string): string {
  try {
    const df = parseISO(isoFrom);
    const dt = parseISO(isoTo);
    if (!isValid(df) || !isValid(dt)) return `${isoFrom} - ${isoTo}`;
    return `${format(df, "dd.MM.yyyy")} - ${format(dt, "dd.MM.yyyy")}`;
  } catch {
    return `${isoFrom} - ${isoTo}`;
  }
}

export function MemberLeaveTab({ member }: Props) {
  const { data: leaves, isLoading: leavesLoading } = useMemberLeaves(member.membershipId, true);
  const { data: substitutes = [] } = useAdminTeamPickList(member.userId, member.orgId, true);
  const createLeave = useCreateStaffLeave(member.membershipId);

  const [dateStart, setDateStart] = useState<Date | undefined>(undefined);
  const [dateEnd, setDateEnd] = useState<Date | undefined>(undefined);
  const [substituteId, setSubstituteId] = useState<string>("");

  const nameByUserId = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of substitutes) {
      m.set(s.userId, s.fullName);
    }
    m.set(member.userId, member.fullName);
    return m;
  }, [substitutes, member.userId, member.fullName]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!dateStart || !dateEnd || !substituteId) return;
    const from = toIsoDate(dateStart);
    const to = toIsoDate(dateEnd);
    if (from > to) {
      toast.error("Data zakończenia nie może być wcześniejsza niż data rozpoczęcia.");
      return;
    }
    createLeave.mutate(
      {
        orgId: member.orgId,
        staffUserId: member.userId,
        payload: {
          staff_user_id: member.userId,
          substitute_user_id: substituteId,
          date_from: from,
          date_to: to,
        },
      },
      {
        onSuccess: () => {
          setDateStart(undefined);
          setDateEnd(undefined);
          setSubstituteId("");
        },
      },
    );
  }

  const rangeInvalid =
    dateStart && dateEnd && toIsoDate(dateStart) > toIsoDate(dateEnd);

  return (
    <div className="space-y-6">
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Zgłoś urlop</CardTitle>
          <CardDescription>
            Zakres dat oraz identyfikator zastępcy zapisywane są w polu <code className="text-xs">description</code>{" "}
            (format <code className="text-xs">DOMIO_ADMIN_LEAVE_V1</code>) oraz{" "}
            <code className="text-xs">holiday_date</code> ustawiane na datę rozpoczęcia.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-lg">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="leave-start">Data rozpoczęcia</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="leave-start"
                      type="button"
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !dateStart && "text-muted-foreground",
                      )}
                      disabled={createLeave.isPending}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                      {dateStart ? format(dateStart, "d MMM yyyy", { locale: pl }) : "Wybierz datę"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={dateStart} onSelect={setDateStart} initialFocus locale={pl} />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label htmlFor="leave-end">Data zakończenia</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="leave-end"
                      type="button"
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !dateEnd && "text-muted-foreground",
                      )}
                      disabled={createLeave.isPending}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                      {dateEnd ? format(dateEnd, "d MMM yyyy", { locale: pl }) : "Wybierz datę"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={dateEnd} onSelect={setDateEnd} initialFocus locale={pl} />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            {rangeInvalid && (
              <p className="text-sm text-destructive" role="alert">
                Data zakończenia nie może być wcześniejsza niż data rozpoczęcia.
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="leave-sub">Zastępstwo</Label>
              <Select value={substituteId} onValueChange={setSubstituteId} disabled={createLeave.isPending}>
                <SelectTrigger id="leave-sub">
                  <SelectValue placeholder="Wybierz pracownika administracji" />
                </SelectTrigger>
                <SelectContent>
                  {substitutes.map((s) => (
                    <SelectItem key={s.userId} value={s.userId}>
                      {s.fullName} ({s.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {substitutes.length === 0 && (
                <p className="text-xs text-muted-foreground">Brak innych pracowników administracji do wyboru.</p>
              )}
            </div>
            <Button
              type="submit"
              disabled={
                !dateStart ||
                !dateEnd ||
                !substituteId ||
                Boolean(rangeInvalid) ||
                createLeave.isPending
              }
              className="w-fit gap-2"
            >
              {createLeave.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Zapisywanie…
                </>
              ) : (
                "Zapisz urlop"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Historia urlopów</CardTitle>
          <CardDescription>Zaplanowane urlopy dla tego pracownika.</CardDescription>
        </CardHeader>
        <CardContent>
          {leavesLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !leaves || leaves.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak zapisanych urlopów.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Okres</TableHead>
                    <TableHead>Zastępstwo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaves.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium tabular-nums">
                        {formatLeavePeriod(row.payload.date_from, row.payload.date_to)}
                      </TableCell>
                      <TableCell>
                        {nameByUserId.get(row.payload.substitute_user_id) ?? row.payload.substitute_user_id}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
