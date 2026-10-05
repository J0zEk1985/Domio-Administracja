import { useEffect, useState } from "react";
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
import { LegalEntityNipField } from "@/components/legal-entity/LegalEntityNipField";
import { useUpdateCompany } from "@/hooks/useCompanies";
import { supabase } from "@/lib/supabase";
import { COMPANY_KINDS } from "@/lib/legalEntityMessages";
import type { LegalEntityPublic } from "@/lib/legalEntityApi";
import type { Company, CompanyCategory } from "@/types/contracts";
import {
  companyFormDefaultValues,
  companyFormSchema,
  companyRowToFormValues,
  type CompanyFormValues,
  COMPANY_CATEGORIES,
  COMPANY_CATEGORY_LABELS,
} from "@/schemas/companySchema";
import { toast } from "@/components/ui/sonner";
import { getOrgAndActor } from "@/lib/orgAccess";

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
  mode?: "create" | "edit";
  company?: Company | null;
  initialSearchQuery?: string;
  /** Used when creating from a context that already knows the catalog role. */
  defaultCategory?: CompanyCategory;
  lockCategory?: boolean;
  onSuccess: (companyId: string) => void;
}

export function CompanyDialog({
  open,
  onOpenChange,
  mode = "create",
  company,
  defaultCategory = "contractor",
  lockCategory = false,
  onSuccess,
}: CompanyDialogProps) {
  const update = useUpdateCompany();
  const isEdit = mode === "edit" && Boolean(company?.id);
  const [createOrgId, setCreateOrgId] = useState<string | null>(null);
  const [createEntity, setCreateEntity] = useState<LegalEntityPublic | null>(null);
  const [createCategory, setCreateCategory] = useState<CompanyCategory>(defaultCategory);
  const [creating, setCreating] = useState(false);
  const saving = update.isPending || creating;

  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(companyFormSchema),
    defaultValues: companyFormDefaultValues,
  });

  const { reset } = form;

  useEffect(() => {
    if (!open) return;
    if (isEdit && company) {
      reset(companyRowToFormValues(company));
      return;
    }
    setCreateEntity(null);
    setCreateCategory(defaultCategory);
    void getOrgAndActor()
      .then(({ orgId }) => setCreateOrgId(orgId))
      .catch((err) => {
        console.error("[CompanyDialog] org:", err);
        toast.error("Brak kontekstu organizacji.");
      });
  }, [open, reset, isEdit, company, defaultCategory]);

  async function handleEdit(values: CompanyFormValues) {
    if (!isEdit || !company?.id) return;
    try {
      const row = await update.mutateAsync({
        id: company.id,
        name: values.name.trim(),
        tax_id: company.tax_id,
        category: values.category,
        email: values.email ?? null,
        phone: values.phone ?? null,
        address: values.address ?? null,
      });
      onSuccess(row.id);
      onOpenChange(false);
      reset(companyFormDefaultValues);
    } catch (err) {
      toast.error(apiErrorMessage(err));
      console.error("[CompanyDialog] save:", err);
    }
  }

  async function handleCreate() {
    if (!createEntity) {
      toast.error("Sprawdź NIP w GUS i dodaj firmę do Domio.");
      return;
    }
    setCreating(true);
    try {
      const { data: row, error } = await supabase
        .from("companies")
        .select("id")
        .eq("tax_id", createEntity.nip)
        .maybeSingle();
      if (error) throw error;
      if (!row?.id) {
        throw new Error("Firma powstała w rejestrze, ale nie pojawiła się w katalogu. Odśwież listę.");
      }
      const updated = await update.mutateAsync({
        id: row.id,
        name: createEntity.legalName,
        tax_id: createEntity.nip,
        category: createCategory,
        email: null,
        phone: null,
        address: createEntity.seatFullAddress,
      });
      onSuccess(updated.id);
      onOpenChange(false);
      setCreateEntity(null);
    } catch (err) {
      toast.error(apiErrorMessage(err));
      console.error("[CompanyDialog] create:", err);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="pointer-events-auto flex max-h-[90dvh] w-[calc(100vw-2rem)] min-w-0 flex-col overflow-y-auto overflow-x-hidden sm:max-w-lg"
        onCloseAutoFocus={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.stopPropagation()}
        onInteractOutside={(e) => e.stopPropagation()}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>{isEdit ? "Edycja firmy" : "Nowa firma"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Kategoria i kontakt są lokalne. NIP należy do globalnego rejestru DOMIO."
              : "Zacznij od NIP. Dane rejestrowe pobieramy z GUS."}
          </DialogDescription>
        </DialogHeader>
        {isEdit ? (
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleEdit)}
              className="flex min-h-0 min-w-0 flex-1 flex-col"
            >
              <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden pr-1">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nazwa</FormLabel>
                    <FormControl>
                      <Input {...field} autoComplete="organization" disabled={saving} />
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
                      <Input {...field} disabled />
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
                    <Select value={field.value} onValueChange={field.onChange} disabled={saving}>
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
                      <Input {...field} value={field.value ?? ""} type="tel" disabled={saving} />
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
                      <Input {...field} value={field.value ?? ""} type="email" disabled={saving} />
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
                      <Input {...field} value={field.value ?? ""} disabled={saving} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              </div>
              <DialogFooter className="mt-4 shrink-0 gap-2 sm:gap-0">
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
                  Anuluj
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Zapisywanie…" : "Zapisz zmiany"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        ) : (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden pr-1">
            {createOrgId ? (
              <LegalEntityNipField
                orgId={createOrgId}
                value={createEntity}
                onChange={setCreateEntity}
                allowedKinds={COMPANY_KINDS}
                flags={{ isAdmin: true }}
                required
              />
            ) : (
              <p className="text-sm text-muted-foreground">Ładowanie organizacji…</p>
            )}
            <div className="grid min-w-0 gap-2">
              <p className="text-sm font-medium">Kategoria w katalogu</p>
              <Select
                value={createCategory}
                onValueChange={(v) => setCreateCategory(v as CompanyCategory)}
                disabled={saving || lockCategory}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPANY_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {COMPANY_CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            </div>
            <DialogFooter className="mt-4 shrink-0 gap-2 sm:gap-0">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
                Anuluj
              </Button>
              <Button type="button" onClick={() => void handleCreate()} disabled={saving || !createEntity}>
                {saving ? "Zapisywanie…" : "Zapisz firmę"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
