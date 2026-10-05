import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";

import { CompanyComboBox } from "@/components/companies/CompanyComboBox";
import { InspectionDateField, ValidityPresetButtons } from "@/components/inspections/InspectionDateFields";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import { useAddInspection } from "@/hooks/usePropertyInspections";
import {
  addInspectionFormSchema,
  type AddInspectionFormValues,
  INSPECTION_STATUSES,
  INSPECTION_STATUS_LABELS,
  INSPECTION_TYPES,
  INSPECTION_TYPE_LABELS,
} from "@/schemas/inspectionSchema";

function apiErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err && "message" in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === "string" && m.length > 0) return m;
  }
  return "Nie udało się zapisać przeglądu.";
}

const DEFAULT_VALUES: AddInspectionFormValues = {
  company_id: "",
  type: "building",
  status: "positive",
  execution_date: "",
  valid_until: "",
  protocol_number: "",
  notes: "",
};

export interface AddInspectionDialogProps {
  locationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddInspectionDialog({ locationId, open, onOpenChange }: AddInspectionDialogProps) {
  const addInspection = useAddInspection();

  const form = useForm<AddInspectionFormValues>({
    resolver: zodResolver(addInspectionFormSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const { reset, control, handleSubmit, setValue } = form;
  const executionDate = useWatch({ control, name: "execution_date" });

  useEffect(() => {
    if (!open) return;
    reset(DEFAULT_VALUES);
  }, [open, reset]);

  const isPending = addInspection.isPending;

  function onSubmit(values: AddInspectionFormValues) {
    addInspection.mutate(
      { locationId, values },
      {
        onSuccess: () => {
          toast.success("Przegląd został dodany.");
          onOpenChange(false);
        },
        onError: (err) => {
          toast.error(apiErrorMessage(err));
          console.error("[AddInspectionDialog] insert:", err);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-2rem)] min-w-0 flex-col overflow-x-hidden sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <DialogTitle>Nowy przegląd techniczny</DialogTitle>
          <DialogDescription>
            Zapis protokołu przeglądu dla tej nieruchomości. Pola wymagane muszą być uzupełnione przed zatwierdzeniem.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit(onSubmit)} className="min-w-0 space-y-4">
            <FormField
              control={control}
              name="company_id"
              render={({ field }) => (
                <FormItem className="min-w-0">
                  <FormLabel>Firma</FormLabel>
                  <FormControl>
                    <CompanyComboBox value={field.value} onChange={field.onChange} disabled={isPending} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Typ przeglądu</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange} disabled={isPending}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Wybierz typ" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {INSPECTION_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {INSPECTION_TYPE_LABELS[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status z protokołu</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange} disabled={isPending}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Wybierz status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {INSPECTION_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {INSPECTION_STATUS_LABELS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
              <InspectionDateField control={control} name="execution_date" label="Data wykonania" disabled={isPending} />
              <div className="flex min-w-0 flex-col gap-2">
                <InspectionDateField control={control} name="valid_until" label="Data ważności" disabled={isPending} />
                <ValidityPresetButtons
                  executionDate={executionDate ?? ""}
                  disabled={isPending}
                  onSelect={(isoDate) =>
                    setValue("valid_until", isoDate, { shouldDirty: true, shouldValidate: true })
                  }
                />
              </div>
            </div>

            <FormField
              control={control}
              name="protocol_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Numer protokołu</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      autoComplete="off"
                      disabled={isPending}
                      placeholder="Opcjonalnie"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Uwagi</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value ?? ""}
                      disabled={isPending}
                      placeholder="Opcjonalnie"
                      rows={3}
                      className="resize-none"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" disabled={isPending} onClick={() => onOpenChange(false)}>
                Anuluj
              </Button>
              <Button type="submit" disabled={isPending}>
                Zapisz przegląd
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
