import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
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
import { useGlobalActiveVendorPartnersForRouting } from "@/hooks/useGlobalActiveVendorPartnersForRouting";
import { formatInspectionCampaignSchedule } from "@/lib/formatInspectionCampaignSchedule";
import { cn } from "@/lib/utils";
import {
  createInspectionCampaignSchema,
  type CreateInspectionCampaignFormValues,
} from "@/schemas/inspectionCampaignSchema";

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
          <p className="text-sm text-muted-foreground">
            {formatInspectionCampaignSchedule(
              campaign.start_date,
              campaign.end_date,
              campaign.start_time,
              campaign.end_time,
            )}
          </p>
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

const defaultCampaignForm: CreateInspectionCampaignFormValues = {
  title: "",
  category: "local_inspection",
  startDate: "",
  endDate: "",
  startTime: "",
  endTime: "",
  vendorId: "__none__",
};

function CreateCampaignDialog({
  locationId,
  open,
  onOpenChange,
}: {
  locationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const vendorsQuery = useGlobalActiveVendorPartnersForRouting(open);
  const createMutation = useCreateInspectionCampaign();

  const form = useForm<CreateInspectionCampaignFormValues>({
    resolver: zodResolver(createInspectionCampaignSchema),
    defaultValues: defaultCampaignForm,
  });

  const defaultValues = useMemo(() => defaultCampaignForm, []);

  useEffect(() => {
    if (open) {
      form.reset(defaultValues);
    }
  }, [open, defaultValues, form]);

  function onSubmit(values: CreateInspectionCampaignFormValues) {
    const st = values.startTime?.trim() ?? "";
    const et = values.endTime?.trim() ?? "";
    createMutation.mutate(
      {
        locationId,
        title: values.title.trim(),
        category: values.category.trim() || "local_inspection",
        startDate: values.startDate,
        endDate: values.endDate,
        startTime: st && et ? st : null,
        endTime: st && et ? et : null,
        vendorId: values.vendorId === "__none__" ? null : values.vendorId,
      },
      {
        onSuccess: () => {
          toast.success("Kampania została utworzona.");
          form.reset(defaultCampaignForm);
          onOpenChange(false);
        },
        onError: (err) => {
          console.error("[CreateCampaignDialog]", err);
          toast.error(err instanceof Error ? err.message : "Nie udało się utworzyć kampanii.");
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          form.reset(defaultCampaignForm);
        }
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>Nowa kampania przeglądu</DialogTitle>
              <DialogDescription>
                Utwórz kampanię przeglądów lokalowych dla tego budynku. Listę mieszkań dodasz w szczegółach
                kampanii.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tytuł</FormLabel>
                    <FormControl>
                      <Input placeholder="np. Przegląd gazowy" autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kategoria (wewnętrzna)</FormLabel>
                    <FormControl>
                      <Input placeholder="local_inspection" autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data od</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data do</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="startTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Godzina rozpoczęcia</FormLabel>
                      <FormControl>
                        <Input type="time" step={60} {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="endTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Godzina zakończenia</FormLabel>
                      <FormControl>
                        <Input type="time" step={60} {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="vendorId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Wykonawca</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={vendorsQuery.isLoading}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={vendorsQuery.isLoading ? "Ładowanie…" : "Opcjonalnie"}
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">— brak —</SelectItem>
                        {(vendorsQuery.data ?? []).map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
        </Form>
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
