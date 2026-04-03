import { useEffect, useState } from "react";
import { Mail, MoreHorizontal, Pencil, Phone, Plus, Trash2 } from "lucide-react";

import { ContractDialog } from "@/components/contracts/ContractDialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeleteContract, usePropertyContracts } from "@/hooks/usePropertyContracts";
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

function contractTypeDisplayLabel(row: PropertyContractWithCompany): string {
  if (row.type === "other") {
    const custom = row.custom_type_name?.trim();
    return custom && custom.length > 0 ? custom : PROPERTY_CONTRACT_TYPE_LABELS.other;
  }
  return PROPERTY_CONTRACT_TYPE_LABELS[row.type];
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
        <Skeleton className="h-8 w-8 rounded-md" />
      </div>
    </div>
  );
}

function apiErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err && "message" in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === "string" && m.length > 0) return m;
  }
  return "Operacja nie powiodła się.";
}

function ContractCard({
  row,
  onEdit,
  onDelete,
  deletePending,
}: {
  row: PropertyContractWithCompany;
  onEdit: () => void;
  onDelete: () => void;
  deletePending: boolean;
}) {
  const company = row.company;
  const name = company?.name?.trim() || "—";
  const email = company?.email?.trim();
  const phone = company?.phone?.trim();
  const typeLabel = contractTypeDisplayLabel(row);

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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              aria-label="Akcje umowy"
              disabled={deletePending}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem className="gap-2" onClick={onEdit}>
              <Pencil className="h-4 w-4" aria-hidden />
              Edytuj
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2 text-destructive focus:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              Usuń
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function PropertyContractsTab({ locationId }: { locationId: string }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<PropertyContractWithCompany | null>(null);
  const contractsQuery = usePropertyContracts(locationId, { enabled: Boolean(locationId) });
  const deleteContract = useDeleteContract();

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

  function handleDialogOpenChange(next: boolean) {
    setDialogOpen(next);
    if (!next) {
      setEditingContract(null);
    }
  }

  function openAdd() {
    setEditingContract(null);
    setDialogOpen(true);
  }

  function openEdit(row: PropertyContractWithCompany) {
    setEditingContract(row);
    setDialogOpen(true);
  }

  function handleDelete(row: PropertyContractWithCompany) {
    if (!window.confirm("Czy na pewno usunąć tę umowę? Tej operacji nie można cofnąć.")) {
      return;
    }
    deleteContract.mutate(
      { id: row.id, locationId },
      {
        onSuccess: () => toast.success("Umowa została usunięta."),
        onError: (err) => {
          toast.error(apiErrorMessage(err));
          console.error("[PropertyContractsTab] delete:", err);
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Umowy i przeglądy</h2>
          <p className="text-sm text-muted-foreground">Aktywne umowy przypisane do tej nieruchomości.</p>
        </div>
        <Button type="button" size="sm" className="shrink-0 gap-1.5" onClick={openAdd}>
          <Plus className="h-4 w-4" aria-hidden />
          Dodaj umowę
        </Button>
      </div>

      <ContractDialog
        locationId={locationId}
        open={dialogOpen}
        onOpenChange={handleDialogOpenChange}
        contract={editingContract ?? undefined}
      />

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
            <ContractCard
              key={row.id}
              row={row}
              onEdit={() => openEdit(row)}
              onDelete={() => handleDelete(row)}
              deletePending={
                deleteContract.isPending && deleteContract.variables?.id === row.id
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
