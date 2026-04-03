import { useEffect, useState } from "react";
import { Mail, Phone, Plus } from "lucide-react";

import { AddContractDialog } from "@/components/contracts/AddContractDialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePropertyContracts } from "@/hooks/usePropertyContracts";
import { PROPERTY_CONTRACT_TYPE_LABELS } from "@/schemas/contractSchema";
import { toast } from "@/components/ui/sonner";
import type { PropertyContractWithCompany } from "@/hooks/usePropertyContracts";

const plnFormatter = new Intl.NumberFormat("pl-PL", {
  style: "currency",
  currency: "PLN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function telHref(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : "#";
}

function ContractRowSkeleton() {
  return (
    <div className="flex gap-4 py-4">
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-5 w-48 max-w-full" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="flex shrink-0 gap-1 pt-0.5">
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-8 w-8 rounded-md" />
      </div>
    </div>
  );
}

function ContractCard({ row }: { row: PropertyContractWithCompany }) {
  const company = row.company;
  const name = company?.name?.trim() || "—";
  const email = company?.email?.trim();
  const phone = company?.phone?.trim();
  const typeLabel = PROPERTY_CONTRACT_TYPE_LABELS[row.type];

  return (
    <div className="flex gap-4 py-4">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-xs text-muted-foreground">{typeLabel}</p>
        <p className="text-sm font-medium leading-snug">{name}</p>
        <p className="text-sm tabular-nums text-muted-foreground">{plnFormatter.format(row.net_value)}</p>
      </div>
      <div className="flex shrink-0 items-start gap-0.5 pt-0.5">
        {phone ? (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" asChild>
            <a href={telHref(phone)} aria-label={`Zadzwoń: ${phone}`}>
              <Phone className="h-4 w-4" />
            </a>
          </Button>
        ) : null}
        {email ? (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" asChild>
            <a href={`mailto:${email}`} aria-label={`Napisz e-mail: ${email}`}>
              <Mail className="h-4 w-4" />
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function PropertyContractsTab({ locationId }: { locationId: string }) {
  const [addOpen, setAddOpen] = useState(false);
  const contractsQuery = usePropertyContracts(locationId, { enabled: Boolean(locationId) });

  useEffect(() => {
    if (!contractsQuery.isError || !contractsQuery.error) return;
    const msg =
      contractsQuery.error instanceof Error
        ? contractsQuery.error.message
        : "Nie udało się wczytać umów.";
    toast.error(msg);
    console.error("[PropertyContractsTab] contracts error:", contractsQuery.error);
  }, [contractsQuery.isError, contractsQuery.error]);

  const rows = contractsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Umowy i przeglądy</h2>
          <p className="text-sm text-muted-foreground">Aktywne umowy przypisane do tej nieruchomości.</p>
        </div>
        <Button type="button" size="sm" className="shrink-0 gap-1.5" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          Dodaj umowę
        </Button>
      </div>

      <AddContractDialog locationId={locationId} open={addOpen} onOpenChange={setAddOpen} />

      {contractsQuery.isLoading ? (
        <div className="divide-y divide-border/60">
          {[1, 2, 3].map((i) => (
            <ContractRowSkeleton key={i} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Brak aktywnych umów dla tego budynku.</p>
      ) : (
        <div className="divide-y divide-border/60">
          {rows.map((row) => (
            <ContractCard key={row.id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}
