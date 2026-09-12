import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SUCCESSION_MODE_LABEL, SUCCESSION_STATUS_LABEL } from "@/lib/mandateApi";
import type { SuccessionEvent } from "@/types/mandates";

type CommunitySuccessionEventsCardProps = {
  canManage: boolean;
  loading: boolean;
  events: SuccessionEvent[];
  acceptPending: boolean;
  cancelPending: boolean;
  rejectPending: boolean;
  completePending: boolean;
  onAccept: (successionId: string) => void;
  onCancel: (successionId: string) => void;
  onReject: (successionId: string) => void;
  onComplete: (successionId: string) => void;
};

export function CommunitySuccessionEventsCard({
  canManage,
  loading,
  events,
  acceptPending,
  cancelPending,
  rejectPending,
  completePending,
  onAccept,
  onCancel,
  onReject,
  onComplete,
}: CommunitySuccessionEventsCardProps) {
  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Procesy sukcesji</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak zgłoszonych sukcesji.</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tryb</TableHead>
                  <TableHead>Status</TableHead>
                  {canManage ? <TableHead className="text-right">Akcje</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{SUCCESSION_MODE_LABEL[row.mode]}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{SUCCESSION_STATUS_LABEL[row.status]}</Badge>
                    </TableCell>
                    {canManage ? (
                      <TableCell className="text-right space-x-2">
                        {row.status === "proposed" ? (
                          <>
                            <Button type="button" size="sm" disabled={acceptPending} onClick={() => onAccept(row.id)}>
                              Akceptuj
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={cancelPending}
                              onClick={() => onCancel(row.id)}
                            >
                              Anuluj
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={rejectPending}
                              onClick={() => onReject(row.id)}
                            >
                              Odrzuć
                            </Button>
                          </>
                        ) : null}
                        {row.status === "accepted" ? (
                          <Button type="button" size="sm" disabled={completePending} onClick={() => onComplete(row.id)}>
                            Zakończ
                          </Button>
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
