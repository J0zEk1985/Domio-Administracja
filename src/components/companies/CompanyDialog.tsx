import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

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
import { useUpsertCompany } from "@/hooks/useCompanies";
import {
  companyFormDefaultValues,
  companyFormSchema,
  type CompanyFormValues,
  COMPANY_CATEGORIES,
  COMPANY_CATEGORY_LABELS,
  parseCompanySearchSeed,
} from "@/schemas/companySchema";
import { toast } from "@/components/ui/sonner";

function apiErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err && "message" in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === "string" && m.length > 0) return m;
  }
  return "Nie udało się zapisać firmy.";
}

export interface CompanyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSearchQuery?: string;
  onSuccess: (newCompanyId: string) => void;
}

export function CompanyDialog({
  open,
  onOpenChange,
  initialSearchQuery,
  onSuccess,
}: CompanyDialogProps) {
  const upsert = useUpsertCompany();

  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(companyFormSchema),
    defaultValues: companyFormDefaultValues,
  });

  const { reset } = form;

  useEffect(() => {
    if (!open) return;
    reset({
      ...companyFormDefaultValues,
      ...parseCompanySearchSeed(initialSearchQuery),
    });
  }, [open, initialSearchQuery, reset]);

  async function handleSubmit(values: CompanyFormValues) {
    try {
      const company = await upsert.mutateAsync({
        name: values.name.trim(),
        tax_id: values.tax_id,
        category: values.category,
        email: values.email ?? null,
        phone: values.phone ?? null,
        address: values.address ?? null,
      });
      onSuccess(company.id);
      onOpenChange(false);
      reset(companyFormDefaultValues);
    } catch (err) {
      toast.error(apiErrorMessage(err));
      console.error("[CompanyDialog] upsert:", err);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="pointer-events-auto sm:max-w-md"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Nowa firma</DialogTitle>
          <DialogDescription>
            Dane zapisują się w globalnym katalogu firm (unikalność po NIP). Po zapisie firma zostanie wybrana w
            formularzu.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nazwa</FormLabel>
                  <FormControl>
                    <Input {...field} autoComplete="organization" disabled={upsert.isPending} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="tax_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>NIP</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="10 cyfr"
                      disabled={upsert.isPending}
                      onChange={(e) => field.onChange(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    />
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
                  <FormLabel>Kategoria</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={upsert.isPending}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {COMPANY_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {COMPANY_CATEGORY_LABELS[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefon</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      type="tel"
                      autoComplete="tel"
                      disabled={upsert.isPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-mail</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      type="email"
                      autoComplete="email"
                      disabled={upsert.isPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Adres</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      autoComplete="street-address"
                      disabled={upsert.isPending}
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
                disabled={upsert.isPending}
              >
                Anuluj
              </Button>
              <Button type="submit" disabled={upsert.isPending}>
                {upsert.isPending ? "Zapisywanie…" : "Zapisz firmę"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
