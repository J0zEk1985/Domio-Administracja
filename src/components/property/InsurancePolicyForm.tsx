import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { PolicyInsurerCombobox } from "@/components/property/PolicyInsurerCombobox";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAddPropertyPolicy } from "@/hooks/usePropertyPolicies";
import {
  insurancePolicyFormSchema,
  type InsurancePolicyFormValues,
  POLICY_SCOPE_LABELS,
  POLICY_SCOPE_VALUES,
} from "@/schemas/policySchema";
import { toast } from "@/components/ui/sonner";

function apiErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err && "message" in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === "string" && m.length > 0) return m;
  }
  return "Nie udało się zapisać polisy.";
}

const DEFAULT_VALUES: InsurancePolicyFormValues = {
  policy_number: "",
  company_id: "",
  policy_scope: "majatkowe",
  premium_amount: 0,
  start_date: "",
  end_date: "",
  document_url: "",
};

export interface InsurancePolicyFormProps {
  locationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communityAssignOption?: { communityId: string } | null;
}

export function InsurancePolicyForm({
  locationId,
  open,
  onOpenChange,
  communityAssignOption,
}: InsurancePolicyFormProps) {
  const addPolicy = useAddPropertyPolicy();
  const [assignWholeCommunity, setAssignWholeCommunity] = useState(true);

  const form = useForm<InsurancePolicyFormValues>({
    resolver: zodResolver(insurancePolicyFormSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const { reset, control } = form;

  useEffect(() => {
    if (!open) return;
    reset(DEFAULT_VALUES);
    setAssignWholeCommunity(Boolean(communityAssignOption));
  }, [open, reset, communityAssignOption]);

  const isPending = addPolicy.isPending;

  function handleSubmit(values: InsurancePolicyFormValues) {
    addPolicy.mutate(
      {
        locationId,
        values,
        communityId:
          assignWholeCommunity && communityAssignOption ? communityAssignOption.communityId : null,
      },
      {
        onSuccess: () => {
          toast.success("Polisa została zapisana.");
          onOpenChange(false);
        },
        onError: (err) => {
          toast.error(apiErrorMessage(err));
          console.error("[InsurancePolicyForm] save:", err);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-lg font-semibold tracking-tight">Nowa polisa</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Dane podstawowe — zapis od razu aktualizuje listę na karcie budynku.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5">
            {communityAssignOption ? (
              <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                <Checkbox
                  id="policy-community-scope"
                  checked={assignWholeCommunity}
                  onCheckedChange={(v) => setAssignWholeCommunity(v === true)}
                  disabled={isPending}
                />
                <div className="space-y-1">
                  <Label htmlFor="policy-community-scope" className="cursor-pointer font-medium leading-snug">
                    Przypisz do całej Wspólnoty (zalecane)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Polisa przypisana do budynku, widoczna także w kontekście wspólnoty.
                  </p>
                </div>
              </div>
            ) : null}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={control}
                name="policy_number"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel className="text-xs font-medium text-muted-foreground">Numer</FormLabel>
                    <FormControl>
                      <Input {...field} autoComplete="off" disabled={isPending} placeholder="np. POL/2026/01" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={control}
                name="company_id"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel className="text-xs font-medium text-muted-foreground">Ubezpieczyciel</FormLabel>
                    <FormControl>
                      <PolicyInsurerCombobox
                        value={field.value}
                        onChange={field.onChange}
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={control}
              name="policy_scope"
              render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel className="text-xs font-medium text-muted-foreground">Zakres</FormLabel>
                  <FormControl>
                    <ToggleGroup
                      type="single"
                      value={field.value}
                      onValueChange={(v) => {
                        if (v) field.onChange(v);
                      }}
                      disabled={isPending}
                      variant="outline"
                      size="sm"
                      className="flex w-full flex-wrap justify-stretch gap-1.5 sm:gap-2"
                    >
                      {POLICY_SCOPE_VALUES.map((scope) => (
                        <ToggleGroupItem
                          key={scope}
                          value={scope}
                          className="min-h-9 flex-1 px-2 text-xs font-medium data-[state=on]:bg-foreground data-[state=on]:text-background"
                        >
                          {POLICY_SCOPE_LABELS[scope]}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={control}
                name="premium_amount"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel className="text-xs font-medium text-muted-foreground">Składka</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="0.01"
                          className="pr-14"
                          disabled={isPending}
                          name={field.name}
                          onBlur={field.onBlur}
                          ref={field.ref}
                          value={field.value}
                          onChange={(e) => {
                            const v = e.target.value;
                            field.onChange(v === "" ? 0 : Number(v));
                          }}
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium tabular-nums text-muted-foreground">
                          PLN
                        </span>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={control}
                name="document_url"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel className="text-xs font-medium text-muted-foreground">PDF (opcjonalnie)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        type="url"
                        inputMode="url"
                        autoComplete="off"
                        disabled={isPending}
                        placeholder="https://…"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={control}
                name="start_date"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel className="text-xs font-medium text-muted-foreground">Od</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" disabled={isPending} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name="end_date"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel className="text-xs font-medium text-muted-foreground">Do</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" disabled={isPending} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="ghost"
                disabled={isPending}
                onClick={() => onOpenChange(false)}
              >
                Anuluj
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Zapisywanie…" : "Zapisz"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
