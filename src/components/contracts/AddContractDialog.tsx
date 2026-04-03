import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";

import { CompanyComboBox } from "@/components/companies/CompanyComboBox";
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
import { useAddContract } from "@/hooks/usePropertyContracts";
import {
  addContractFormSchema,
  type AddContractFormValues,
  PROPERTY_CONTRACT_TYPES,
  PROPERTY_CONTRACT_TYPE_LABELS,
  VAT_RATE_OPTIONS,
} from "@/schemas/contractSchema";
import { toast } from "@/components/ui/sonner";

function computeGrossValue(net: number, vatPercent: number): number {
  if (!Number.isFinite(net) || !Number.isFinite(vatPercent)) return 0;
  return Math.round(net * (1 + vatPercent / 100) * 100) / 100;
}

const DEFAULT_VALUES: AddContractFormValues = {
  company_id: "",
  type: "cleaning",
  contract_number: "",
  start_date: "",
  end_date: "",
  net_value: 0,
  vat_rate: 23,
  gross_value: 0,
  custom_type_name: "",
  notice_period_months: undefined,
};

function apiErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err && "message" in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === "string" && m.length > 0) return m;
  }
  return "Nie udało się zapisać umowy.";
}

export interface AddContractDialogProps {
  locationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddContractDialog({ locationId, open, onOpenChange }: AddContractDialogProps) {
  const addContract = useAddContract();
  const [zeroVatVariant, setZeroVatVariant] = useState<"0" | "zw">("0");

  const form = useForm<AddContractFormValues>({
    resolver: zodResolver(addContractFormSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const { reset, control, setValue } = form;

  const netValue = useWatch({ control, name: "net_value", defaultValue: 0 });
  const vatRate = useWatch({ control, name: "vat_rate", defaultValue: 23 });
  const contractType = useWatch({ control, name: "type", defaultValue: "cleaning" });

  useEffect(() => {
    if (open) {
      reset(DEFAULT_VALUES);
      setZeroVatVariant("0");
    }
  }, [open, reset]);

  useEffect(() => {
    const gross = computeGrossValue(Number(netValue), Number(vatRate));
    setValue("gross_value", gross, { shouldValidate: true, shouldDirty: false });
  }, [netValue, vatRate, setValue]);

  function handleSubmit(values: AddContractFormValues) {
    addContract.mutate(
      { locationId, values },
      {
        onSuccess: () => {
          toast.success("Umowa została dodana.");
          onOpenChange(false);
        },
        onError: (err) => {
          toast.error(apiErrorMessage(err));
          console.error("[AddContractDialog] submit:", err);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nowa umowa</DialogTitle>
          <DialogDescription>
            Wypełnij dane umowy. Pola oznaczone jako wymagane muszą zostać uzupełnione przed zapisem.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="company_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Firma</FormLabel>
                  <FormControl>
                    <CompanyComboBox
                      value={field.value}
                      onChange={field.onChange}
                      disabled={addContract.isPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Typ umowy</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={addContract.isPending}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Wybierz typ" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PROPERTY_CONTRACT_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {PROPERTY_CONTRACT_TYPE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {contractType === "other" ? (
              <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                <FormField
                  control={form.control}
                  name="custom_type_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Podaj nazwę typu umowy</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          autoComplete="off"
                          disabled={addContract.isPending}
                          placeholder="np. Ochrona, Ogrzewanie…"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ) : null}

            <FormField
              control={form.control}
              name="contract_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Numer umowy</FormLabel>
                  <FormControl>
                    <Input {...field} autoComplete="off" disabled={addContract.isPending} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data rozpoczęcia</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" disabled={addContract.isPending} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data zakończenia</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        type="date"
                        disabled={addContract.isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="net_value"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kwota netto (PLN)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="0.01"
                          className="pr-14"
                          disabled={addContract.isPending}
                          name={field.name}
                          onBlur={field.onBlur}
                          ref={field.ref}
                          value={field.value}
                          onChange={(e) => {
                            const v = e.target.value;
                            field.onChange(v === "" ? 0 : Number(v));
                          }}
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                          PLN
                        </span>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="vat_rate"
                render={({ field }) => {
                  const displayValue = field.value === 0 ? zeroVatVariant : String(field.value);
                  return (
                    <FormItem>
                      <FormLabel>Stawka VAT</FormLabel>
                      <Select
                        value={displayValue}
                        onValueChange={(v) => {
                          if (v === "zw" || v === "0") {
                            setZeroVatVariant(v);
                            field.onChange(0);
                          } else {
                            field.onChange(Number(v));
                          }
                        }}
                        disabled={addContract.isPending}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="VAT" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {VAT_RATE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.selectValue} value={opt.selectValue}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              <FormField
                control={form.control}
                name="gross_value"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kwota brutto (PLN)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type="number"
                          inputMode="decimal"
                          readOnly
                          tabIndex={-1}
                          className="cursor-default bg-muted/40 pr-14"
                          name={field.name}
                          ref={field.ref}
                          value={field.value}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          aria-readonly="true"
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                          PLN
                        </span>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notice_period_months"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Okres wypowiedzenia (miesiące)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      disabled={addContract.isPending}
                      placeholder="Opcjonalnie"
                      name={field.name}
                      onBlur={field.onBlur}
                      ref={field.ref}
                      value={field.value === undefined || field.value === null ? "" : field.value}
                      onChange={(e) => {
                        const v = e.target.value;
                        field.onChange(v === "" ? undefined : Number(v));
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={addContract.isPending}
              >
                Anuluj
              </Button>
              <Button type="submit" disabled={addContract.isPending}>
                {addContract.isPending ? "Zapisywanie…" : "Zapisz umowę"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
