import { useMemo, useState } from "react";
import { format } from "date-fns";
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

export function MemberLeaveTab({ member }: Props) {
  const { data: leaves, isLoading: leavesLoading } = useMemberLeaves(member.membershipId, true);
  const { data: substitutes = [] } = useAdminTeamPickList(member.userId, member.orgId, true);
  const createLeave = useCreateStaffLeave(member.membershipId);

  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
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
    if (!dateFrom || !dateTo || !substituteId) return;
    const from = toIsoDate(dateFrom);
    const to = toIsoDate(dateTo);
    if (from > to) {
      toast.error("Data „do” nie może być wcześniejsza niż „od”.");
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
          setDateFrom(undefined);
          setDateTo(undefined);
          setSubstituteId("");
        },
      },
    );
  }

  const rangeInvalid = dateFrom && dateTo && toIsoDate(dateFrom) > toIsoDate(dateTo);

  return (
    <div className="space-y-6">
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Zgłoś urlop</CardTitle>
          <CardDescription>
            Zakres dat i zastępstwo są zapisywane w <code className="text-xs">location_holidays</code> (pole{" "}
            <code className="text-xs">description</code> — format JSON zgodny z panelem Administracja).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-lg">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Data od</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !dateFrom && "text-muted-foreground",
                      )}
                      disabled={createLeave.isPending}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                      {dateFrom ? format(dateFrom, "d MMM yyyy", { locale: pl }) : "Wybierz datę"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus locale={pl} />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Data do</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !dateTo && "text-muted-foreground",
                      )}
                      disabled={createLeave.isPending}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                      {dateTo ? format(dateTo, "d MMM yyyy", { locale: pl }) : "Wybierz datę"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus locale={pl} />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            {rangeInvalid && <p className="text-sm text-destructive">Data „do” nie może być wcześniejsza niż „od”.</p>}
            <div className="space-y-2">
              <Label>Zastępstwo</Label>
              <Select value={substituteId} onValueChange={setSubstituteId} disabled={createLeave.isPending}>
                <SelectTrigger>
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
                !dateFrom ||
                !dateTo ||
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
          <CardTitle className="text-base">Zaplanowane urlopy</CardTitle>
          <CardDescription>Historia wpisów dla tego pracownika.</CardDescription>
        </CardHeader>
        <CardContent>
          {leavesLoading ? (
            <p className="text-sm text-muted-foreground">Ładowanie…</p>
          ) : !leaves || leaves.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak zapisanych urlopów.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Od</TableHead>
                    <TableHead>Do</TableHead>
                    <TableHead>Zastępstwo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaves.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.payload.date_from}</TableCell>
                      <TableCell>{row.payload.date_to}</TableCell>
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
