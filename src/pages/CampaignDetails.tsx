import { useState } from "react";
import { format, isValid, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import { ArrowLeft, ListPlus } from "lucide-react";
import { Link, Navigate, useParams } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/sonner";
import {
  countCampaignFinishedUnits,
  useCampaignRecords,
  useGenerateUnitRecords,
  useInspectionCampaign,
} from "@/hooks/useInspectionCampaigns";
import { parseUnitRangeInput } from "@/lib/parseUnitRange";
import { unitInspectionStatusBadgeClass, unitInspectionStatusLabel } from "@/lib/unitInspectionUi";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/supabase";

type UnitInspectionStatus = Database["public"]["Enums"]["unit_inspection_status"];

function formatCampaignDates(startIso: string, endIso: string): string {
  const a = parseISO(startIso);
  const b = parseISO(endIso);
  if (!isValid(a) || !isValid(b)) {
    return "—";
  }
  return `${format(a, "d MMM yyyy", { locale: pl })} — ${format(b, "d MMM yyyy", { locale: pl })}`;
}

function GenerateUnitsDialog({
  open,
  onOpenChange,
  campaignId,
  locationId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  locationId: string;
}) {
  const [raw, setRaw] = useState("");
  const generateMutation = useGenerateUnitRecords();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const units = parseUnitRangeInput(raw);
    if (units.length === 0) {
      toast.error('Wpisz zakres (np. "1-50") lub numery oddzielone przecinkami.');
      return;
    }
    generateMutation.mutate(
      { campaignId, locationId, unitsArray: units },
      {
        onSuccess: () => {
          toast.success(`Dodano ${units.length} lokali.`);
          setRaw("");
          onOpenChange(false);
        },
        onError: (err) => {
          console.error("[GenerateUnitsDialog]", err);
          toast.error(err instanceof Error ? err.message : "Nie udało się dodać lokali.");
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Generuj listę mieszkań</DialogTitle>
            <DialogDescription>
              Podaj zakres numerów (np. <span className="font-mono text-xs">1-50</span>) lub listę oddzieloną przecinkami.
              Rekordy zostaną dodane ze statusem „Oczekuje”.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-4">
            <Label htmlFor="unit-range">Numery lokali</Label>
            <Input
              id="unit-range"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder='np. 1-50 lub 1, 2, 3, 10-12'
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Anuluj
            </Button>
            <Button type="submit" disabled={generateMutation.isPending}>
              {generateMutation.isPending ? "Zapisywanie…" : "Generuj"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function CampaignDetails() {
  const { id: locationId, campaignId } = useParams<{ id: string; campaignId: string }>();
  const [generateOpen, setGenerateOpen] = useState(false);

  const campaignQuery = useInspectionCampaign(campaignId, { enabled: Boolean(campaignId) });
  const recordsQuery = useCampaignRecords(campaignId ?? "", { enabled: Boolean(campaignId) });

  if (!locationId || !campaignId) {
    return <Navigate to="/properties" replace />;
  }

  if (campaignQuery.isLoading) {
    return (
      <div className="flex-1 space-y-6 p-6">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-32 w-full max-w-3xl" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (campaignQuery.isError || !campaignQuery.data) {
    return (
      <div className="flex-1 space-y-4 p-6">
        <Button type="button" variant="ghost" size="sm" className="gap-2 -ml-2" asChild>
          <Link to={`/properties/${locationId}`}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Wróć do nieruchomości
          </Link>
        </Button>
        <p className="text-sm text-destructive">
          {campaignQuery.error instanceof Error
            ? campaignQuery.error.message
            : "Nie udało się wczytać kampanii."}
        </p>
      </div>
    );
  }

  const campaign = campaignQuery.data;
  const records = recordsQuery.data ?? [];
  const { done, total } = countCampaignFinishedUnits(records);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const vendorName = campaign.vendor?.name?.trim() || "—";

  return (
    <div className="flex-1 space-y-8 p-6">
      <div className="flex flex-col gap-4">
        <Button type="button" variant="ghost" size="sm" className="gap-2 -ml-2 w-fit" asChild>
          <Link to={`/properties/${locationId}`}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Wróć do nieruchomości
          </Link>
        </Button>

        <div className="space-y-6 rounded-xl border border-border/60 bg-card/50 p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-2">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">{campaign.title}</h1>
              <p className="text-sm text-muted-foreground">{formatCampaignDates(campaign.start_date, campaign.end_date)}</p>
              <p className="text-sm text-muted-foreground">
                Wykonawca: <span className="text-foreground">{vendorName}</span>
              </p>
            </div>
            <div className="w-full max-w-sm space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Postęp</span>
                <span className="tabular-nums text-foreground">
                  Zrealizowano: {done} / {total} lokali
                </span>
              </div>
              <Progress value={pct} className="h-2.5" />
            </div>
          </div>
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-medium text-foreground">Lokale</h2>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-2 self-end sm:self-auto"
            onClick={() => setGenerateOpen(true)}
          >
            <ListPlus className="h-4 w-4" aria-hidden />
            Generuj listę mieszkań
          </Button>
        </div>

        {recordsQuery.isLoading ? (
          <Skeleton className="h-48 w-full rounded-md" />
        ) : recordsQuery.isError ? (
          <p className="text-sm text-destructive">
            {recordsQuery.error instanceof Error
              ? recordsQuery.error.message
              : "Nie udało się wczytać lokali."}
          </p>
        ) : records.length === 0 ? (
          <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            Brak lokali w tej kampanii. Użyj „Generuj listę mieszkań”, aby dodać numery.
          </p>
        ) : (
          <div className="rounded-md border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Lokal</TableHead>
                  <TableHead className="w-[160px]">Status</TableHead>
                  <TableHead>Uwagi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((row) => {
                  const st = row.status as UnitInspectionStatus;
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium tabular-nums">{row.unit_number}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("font-normal", unitInspectionStatusBadgeClass(st))}>
                          {unitInspectionStatusLabel(st)}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[480px] text-muted-foreground">
                        {row.notes?.trim() ? row.notes : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <GenerateUnitsDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        campaignId={campaignId}
        locationId={locationId}
      />
    </div>
  );
}
