import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useApproveBooking, useRejectBooking } from "@/hooks/useSharedResources";
import { formatBookingTimeRange, formatPrice } from "@/lib/sharedResourcesHelpers";
import { supabase } from "@/lib/supabase";

interface PendingBookingRow {
  id: string;
  resource_name: string;
  unit_number: string | null;
  starts_at: string;
  ends_at: string;
  calculated_price: number;
  booking_notes: string | null;
}

interface PendingBookingsViewProps {
  communityId: string;
}

async function fetchPendingBookings(communityId: string): Promise<PendingBookingRow[]> {
  const { data, error } = await supabase.rpc("get_community_pending_bookings", {
    p_community_id: communityId,
  });

  if (error) {
    console.error("[getCommunityPendingBookings] Error:", error);
    throw error;
  }

  return (data ?? []) as PendingBookingRow[];
}

export function PendingBookingsView({ communityId }: PendingBookingsViewProps) {
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const approveBooking = useApproveBooking();
  const rejectBooking = useRejectBooking();

  const bookingsQuery = useQuery({
    queryKey: ["community-pending-bookings", communityId],
    queryFn: () => fetchPendingBookings(communityId),
    enabled: Boolean(communityId),
  });

  const handleReject = async () => {
    if (!rejectingId) return;
    try {
      await rejectBooking.mutateAsync({
        bookingId: rejectingId,
        reason: rejectionReason.trim() || "Odrzucono przez zarządcę",
      });
      setRejectingId(null);
      setRejectionReason("");
    } catch (error) {
      console.error("[PendingBookingsView] reject:", error);
      toast.error("Nie udało się odrzucić rezerwacji");
    }
  };

  const rows = bookingsQuery.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Oczekujące rezerwacje</CardTitle>
        <CardDescription>Zatwierdź albo odrzuć rezerwacje, które wymagają akceptacji</CardDescription>
      </CardHeader>
      <CardContent>
        {bookingsQuery.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : bookingsQuery.isError ? (
          <p className="text-sm text-destructive">Nie udało się pobrać oczekujących rezerwacji.</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Zasób</TableHead>
                  <TableHead>Lokal</TableHead>
                  <TableHead>Termin</TableHead>
                  <TableHead>Cena</TableHead>
                  <TableHead className="w-[140px]">Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                      Brak oczekujących rezerwacji
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">{row.resource_name}</div>
                        {row.booking_notes ? (
                          <div className="text-xs text-muted-foreground">{row.booking_notes}</div>
                        ) : null}
                      </TableCell>
                      <TableCell>{row.unit_number ?? "—"}</TableCell>
                      <TableCell>{formatBookingTimeRange(row.starts_at, row.ends_at)}</TableCell>
                      <TableCell>{formatPrice(Number(row.calculated_price) || 0)}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="icon"
                            variant="outline"
                            aria-label="Zatwierdź rezerwację"
                            disabled={approveBooking.isPending}
                            onClick={() => approveBooking.mutate(row.id)}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="outline"
                            aria-label="Odrzuć rezerwację"
                            onClick={() => setRejectingId(row.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={Boolean(rejectingId)} onOpenChange={(open) => !open && setRejectingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Odrzuć rezerwację</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="rejection-reason">Powód</Label>
            <Textarea
              id="rejection-reason"
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
              placeholder="Napisz, dlaczego rezerwacja została odrzucona"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRejectingId(null)}>
              Anuluj
            </Button>
            <Button type="button" onClick={handleReject} disabled={rejectBooking.isPending}>
              Odrzuć
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
