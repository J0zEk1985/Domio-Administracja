import { useEffect, useState } from "react";
import { pl } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAvailableResources, useResourceAvailability } from "@/hooks/useSharedResources";
import { formatBookingTimeRange, getBookingStatusLabel } from "@/lib/sharedResourcesHelpers";
import { datesFromKeys, uniqueMonthBookings } from "@/lib/resourceAvailability";
import type { BookingStatus } from "@/types/sharedResources";

interface AvailabilityCalendarViewProps {
  communityId: string;
}

export function AvailabilityCalendarView({ communityId }: AvailabilityCalendarViewProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [visibleMonth, setVisibleMonth] = useState<Date>(new Date());
  const [selectedResourceId, setSelectedResourceId] = useState<string>("");

  const { data: resources } = useAvailableResources({
    communityId,
    resourceType: "community_managed",
  });

  useEffect(() => {
    if (!selectedResourceId && resources?.[0]) {
      setSelectedResourceId(resources[0].id);
    }
  }, [resources, selectedResourceId]);

  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth() + 1;
  const availability = useResourceAvailability(selectedResourceId, year, month);
  const calendar = availability.data ?? [];
  const monthBookings = uniqueMonthBookings(calendar);
  const bookedDates = datesFromKeys(
    calendar.filter((day) => day.slots.length > 0).map((day) => day.date),
  );
  const freeDates = datesFromKeys(
    calendar.filter((day) => day.slots.length === 0).map((day) => day.date),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kalendarz dostępności</CardTitle>
        <CardDescription>Przegląd rezerwacji na wybrany miesiąc</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <Label>Zasób</Label>
          <Select value={selectedResourceId} onValueChange={setSelectedResourceId}>
            <SelectTrigger>
              <SelectValue placeholder="Wybierz zasób" />
            </SelectTrigger>
            <SelectContent>
              {resources?.map((resource) => (
                <SelectItem key={resource.id} value={resource.id}>
                  {resource.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedResourceId ? (
          <div className="space-y-4 rounded-lg border p-4">
            <Calendar
              mode="single"
              month={visibleMonth}
              onMonthChange={setVisibleMonth}
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
              locale={pl}
              className="mx-auto"
              modifiers={{ booked: bookedDates, free: freeDates }}
              modifiersClassNames={{
                booked:
                  "relative after:pointer-events-none after:absolute after:bottom-0.5 after:left-1/2 after:h-1.5 after:w-1.5 after:-translate-x-1/2 after:rounded-full after:bg-red-500",
                free:
                  "relative after:pointer-events-none after:absolute after:bottom-0.5 after:left-1/2 after:h-1.5 after:w-1.5 after:-translate-x-1/2 after:rounded-full after:bg-green-500",
              }}
            />
            <div className="space-y-2">
              <h4 className="font-medium">Legenda:</h4>
              <div className="flex flex-wrap gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded-full bg-green-500" />
                  <span>Dostępny</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded-full bg-red-500" />
                  <span>Zarezerwowany</span>
                </div>
              </div>
            </div>

            <div className="space-y-2 border-t pt-4">
              <h4 className="font-medium">Rezerwacje w tym miesiącu</h4>
              {availability.isLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : availability.isError ? (
                <p className="text-sm text-destructive">Nie udało się pobrać rezerwacji.</p>
              ) : monthBookings.length === 0 ? (
                <p className="text-sm text-muted-foreground">Brak rezerwacji w tym miesiącu.</p>
              ) : (
                <ul className="space-y-2">
                  {monthBookings.map((booking) => (
                    <li key={booking.bookingId} className="rounded-md border px-3 py-2 text-sm">
                      <p className="font-medium">
                        {formatBookingTimeRange(booking.startsAt, booking.endsAt)}
                      </p>
                      <p className="text-muted-foreground">
                        {getBookingStatusLabel(booking.status as BookingStatus)}
                        {booking.unitNumber ? ` · Lokal ${booking.unitNumber}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border-2 border-dashed p-8 text-center">
            <CalendarIcon className="mx-auto h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-sm text-muted-foreground">Wybierz zasób aby zobaczyć kalendarz</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
