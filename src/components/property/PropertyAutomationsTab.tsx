import { useMemo, useState } from "react";
import { Loader2, Trash2, Zap, Waypoints } from "lucide-react";

import { ISSUE_CATEGORY_OPTIONS } from "@/lib/issueCategoryOptions";
import {
  useAddRoutingRule,
  useDeleteRoutingRule,
  useLocationRoutingRules,
} from "@/hooks/useLocationRouting";
import { VendorPartnerCombobox } from "@/components/triage/VendorPartnerCombobox";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
export type PropertyAutomationsTabProps = {
  locationId: string;
};

export function PropertyAutomationsTab({ locationId }: PropertyAutomationsTabProps) {
  const { data: rules = [], isLoading, isError } = useLocationRoutingRules(locationId);
  const addMut = useAddRoutingRule();
  const delMut = useDeleteRoutingRule();

  const [category, setCategory] = useState<string>("");
  const [vendorId, setVendorId] = useState("");

  const usedCategories = useMemo(() => new Set(rules.map((r) => r.issue_category)), [rules]);

  const categoryChoices = useMemo(
    () => ISSUE_CATEGORY_OPTIONS.filter((o) => !usedCategories.has(o.value)),
    [usedCategories],
  );

  const pending = addMut.isPending || delMut.isPending;
  const canSubmit =
    Boolean(category.trim()) && Boolean(vendorId.trim()) && categoryChoices.some((c) => c.value === category);

  return (
    <div className="space-y-8 max-w-2xl">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Waypoints className="h-5 w-5 text-muted-foreground" aria-hidden />
          <h2 className="text-lg font-semibold tracking-tight">Routing Usterek (Auto-Dispatch)</h2>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Reguły przypisujące nowe zgłoszenia z wybranych kategorii bezpośrednio do zewnętrznych
          podwykonawców, z pominięciem ręcznego Triage&apos;u.
        </p>
      </header>

      <section className="space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Aktywne reguły</h3>

        {isLoading ? (
          <div className="space-y-0 divide-y divide-border/80 rounded-lg border border-border/60">
            <Skeleton className="h-12 w-full rounded-none border-0" />
            <Skeleton className="h-12 w-full rounded-none border-0" />
          </div>
        ) : isError ? (
          <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            Nie udało się wczytać reguł routingu.
          </p>
        ) : rules.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/80 bg-muted/15 px-6 py-12 text-center">
            <Zap className="mx-auto h-10 w-10 text-muted-foreground/50" aria-hidden />
            <p className="mt-3 text-sm text-muted-foreground">
              Ten budynek nie ma jeszcze skonfigurowanych automatyzacji.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/80 rounded-lg border border-border/60 bg-card/20">
            {rules.map((rule) => {
              const vendorName = rule.vendor?.name?.trim() || "—";
              const deleting =
                delMut.isPending && delMut.variables?.ruleId === rule.id;
              return (
                <li
                  key={rule.id}
                  className="flex items-center gap-3 px-3 py-3 text-sm sm:px-4"
                >
                  <Zap className="h-4 w-4 shrink-0 text-amber-500/90" aria-hidden />
                  <span className="min-w-0 flex-1 leading-snug">
                    <span className="text-foreground">Kategoria: {rule.issue_category}</span>
                    <span className="text-muted-foreground"> ➔ </span>
                    <span className="text-foreground">Firma: {vendorName}</span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label="Usuń regułę"
                    disabled={pending}
                    onClick={() => delMut.mutate({ ruleId: rule.id, locationId })}
                  >
                    {deleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Trash2 className="h-4 w-4" aria-hidden />
                    )}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-4 rounded-xl border border-border/60 bg-muted/10 p-4 sm:p-5">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Nowa reguła</h3>
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="space-y-1.5 min-w-[12rem] flex-1">
            <label className="text-xs text-muted-foreground" htmlFor="routing-category">
              Kategoria
            </label>
            <Select
              value={category || undefined}
              onValueChange={setCategory}
              disabled={pending || categoryChoices.length === 0}
            >
              <SelectTrigger id="routing-category" className="h-9 w-full">
                <SelectValue placeholder="Wybierz kategorię" />
              </SelectTrigger>
              <SelectContent>
                {categoryChoices.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-sm">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 min-w-[12rem] flex-1">
            <span className="text-xs text-muted-foreground block">Podwykonawca</span>
            <VendorPartnerCombobox
              mode="routing"
              value={vendorId}
              disabled={pending}
              placeholder="Wybierz firmę…"
              onPick={(v) => setVendorId(v.id)}
            />
          </div>
          <Button
            type="button"
            className="w-full sm:w-auto"
            disabled={!canSubmit || pending}
            onClick={() => {
              addMut.mutate(
                { locationId, issueCategory: category, vendorId },
                {
                  onSuccess: () => {
                    setCategory("");
                    setVendorId("");
                  },
                },
              );
            }}
          >
            Dodaj regułę
          </Button>
        </div>
        {categoryChoices.length === 0 && rules.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            Wszystkie zdefiniowane kategorie mają już przypisaną regułę.
          </p>
        ) : null}
      </section>
    </div>
  );
}
