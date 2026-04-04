import { useState } from "react";
import { format, isValid, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import { ClipboardList, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import {
  countCampaignFinishedUnits,
  useCampaigns,
  useCreateInspectionCampaign,
  type InspectionCampaignWithVendorAndRecords,
} from "@/hooks/useInspectionCampaigns";
import { useVendorPartners } from "@/hooks/useVendorPartners";
import { cn } from "@/lib/utils";

function formatCampaignDates(startIso: string, endIso: string): string {
  const a = parseISO(startIso);
  const b = parseISO(endIso);
  if (!isValid(a) || !isValid(b)) {
    return "—";
  }
  return `${format(a, "d MMM yyyy", { locale: pl })} — ${format(b, "d MMM yyyy", { locale: pl })}`;
}

function CampaignCard({
  campaign,
  onOpen,
}: {
  campaign: InspectionCampaignWithVendorAndRecords;
  onOpen: () => void;
}) {
  const { done, total } = countCampaignFinishedUnits(campaign.unit_inspection_records);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const vendorName = campaign.vendor?.name?.trim() || "—";

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "w-full rounded-lg border border-border/60 bg-card text-left shadow-sm transition-colors",
        "hover:border-border hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0 space-y-1">
          <p className="font-medium leading-snug text-foreground">{campaign.title}</p>
          <p className="text-sm text-muted-foreground">{formatCampaignDates(campaign.start_date, campaign.end_date)}</p>
          <p className="text-xs text-muted-foreground">
            Wykonawca: <span className="text-foreground/90">{vendorName}</span>
          </p>
        </div>
        <div className="w-full shrink-0 space-y-2 sm:max-w-[220px]">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Postęp</span>
            <span className="tabular-nums text-foreground">
              Zrealizowano: {done} / {total} lokali
            </span>
          </div>
          <Progress value={pct} className="h-2" />
        </div>
      </div>
    </button>
  );
}

function CreateCampaignDialog({
  locationId,
  open,
  onOpenChange,
}: {
  locationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const vendorsQuery = useVendorPartners(open);
  const createMutation = useCreateInspectionCampaign();

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("local_inspection");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [vendorId, setVendorId] = useState<string>("__none__");

  const reset = () => {
    setTitle("");
    setCategory("local_inspection");
    setStartDate("");
    setEndDate("");
    setVendorId("__none__");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) {
      toast.error("Podaj tytuł kampanii.");
      return;
    }
    if (!startDate || !endDate) {
      toast.error("Wybierz daty rozpoczęcia i zakończenia.");
      return;
    }
    createMutation.mutate(
      {
        locationId,
        title: t,
        category: category.trim() || "local_inspection",
        startDate,
        endDate,
        vendorId: vendorId === "__none__" ? null : vendorId,
      },
      {
        onSuccess: () => {
          toast.success("Kampania została utworzona.");
          reset();
          onOpenChange(false);
        },
        onError: (err) => {
          console.error("[CreateCampaignDialog]", err);
          toast.error(err instanceof Error ? err.message : "Nie udało się utworzyć kampanii.");
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Nowa kampania przeglądu</DialogTitle>
            <DialogDescription>
              Utwórz kampanię przeglądów lokalowych dla tego budynku. Listę mieszkań dodasz w szczegółach kampanii.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="campaign-title">Tytuł</Label>
              <Input
                id="campaign-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="np. Przegląd gazowy"
                autoComplete="off"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="campaign-category">Kategoria (wewnętrzna)</Label>
              <Input
                id="campaign-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="local_inspection"
                autoComplete="off"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="campaign-start">Data od</Label>
                <Input
                  id="campaign-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="campaign-end">Data do</Label>
                <Input id="campaign-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Wykonawca</Label>
              <Select value={vendorId} onValueChange={setVendorId} disabled={vendorsQuery.isLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={vendorsQuery.isLoading ? "Ładowanie…" : "Opcjonalnie"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— brak —</SelectItem>
                  {(vendorsQuery.data ?? []).map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Anuluj
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Zapisywanie…" : "Utwórz"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PropertyLocalInspectionsTab({ locationId }: { locationId: string }) {
  const navigate = useNavigate();
  const campaignsQuery = useCampaigns(locationId);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="space-y-6">
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base inline-flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-muted-foreground" aria-hidden />
              Przeglądy lokalowe
            </CardTitle>
            <CardDescription>
              Kampanie przeglądów według lokali (gaz, kominy itd.). Wybierz kampanię, aby zarządzać listą mieszkań.
            </CardDescription>
          </div>
          <Button type="button" className="shrink-0 gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Nowa Kampania
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {campaignsQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
            </div>
          ) : campaignsQuery.isError ? (
            <p className="rounded-md border border-dashed p-4 text-sm text-destructive">
              {campaignsQuery.error instanceof Error
                ? campaignsQuery.error.message
                : "Nie udało się wczytać kampanii."}
            </p>
          ) : (campaignsQuery.data ?? []).length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Brak kampanii. Utwórz pierwszą kampanię przeglądu dla tego budynku.
            </p>
          ) : (
            <ul className="space-y-3">
              {(campaignsQuery.data ?? []).map((c) => (
                <li key={c.id}>
                  <CampaignCard
                    campaign={c}
                    onOpen={() => navigate(`/properties/${locationId}/inspection-campaigns/${c.id}`)}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <CreateCampaignDialog locationId={locationId} open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
