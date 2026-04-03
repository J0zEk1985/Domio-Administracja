import { useEffect, useState } from "react";
import { Headphones, Mail, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";

import { ContractDialog } from "@/components/contracts/ContractDialog";
import { contractTypeDisplayLabel } from "@/components/contracts/columns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDeleteContract, usePropertyContracts } from "@/hooks/usePropertyContracts";
import type { PropertyContractWithCompany } from "@/hooks/usePropertyContracts";
import { toast } from "@/components/ui/sonner";

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

function formatEndDateLabel(endDate: string | null | undefined): string {
  if (endDate == null || String(endDate).trim() === "") {
    return "";
  }
  const s = String(endDate).slice(0, 10);
  const [y, m, d] = s.split("-").map((x) => Number(x));
  if (!y || !m || !d) return s;
  return new Date(y, m - 1, d).toLocaleDateString("pl-PL");
}

function formatGrossDisplay(gross: number | null | undefined): string {
  if (gross == null || Number.isNaN(Number(gross))) {
    return "—";
  }
  return plnFormatter.format(Number(gross));
}

function apiErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err && "message" in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === "string" && m.length > 0) return m;
  }
  return "Operacja nie powiodła się.";
}

function ContractsTableSkeleton() {
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[8rem]">Typ umowy</TableHead>
            <TableHead className="min-w-[10rem]">Nazwa firmy</TableHead>
            <TableHead className="min-w-[8rem] whitespace-nowrap">Kwota brutto (PLN)</TableHead>
            <TableHead className="min-w-[8rem]">Data zakończenia</TableHead>
            <TableHead className="w-[120px] text-right">Akcje</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[1, 2, 3].map((i) => (
            <TableRow key={i}>
              <TableCell>
                <Skeleton className="h-5 w-24 rounded-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-40" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-28" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-24" />
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-0.5">
                  <Skeleton className="h-8 w-8 rounded-md" />
                  <Skeleton className="h-8 w-8 rounded-md" />
                  <Skeleton className="h-8 w-8 rounded-md" />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
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
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Umowy i przeglądy</CardTitle>
          <CardDescription>Aktywne umowy przypisane do tej nieruchomości.</CardDescription>
        </div>
        <Button type="button" size="sm" className="shrink-0 gap-1.5" onClick={openAdd}>
          <Plus className="h-4 w-4" aria-hidden />
          Dodaj umowę
        </Button>
      </CardHeader>
      <CardContent>
        <ContractDialog
          locationId={locationId}
          open={dialogOpen}
          onOpenChange={handleDialogOpenChange}
          contract={editingContract ?? undefined}
        />

        {contractsQuery.isLoading ? (
          <ContractsTableSkeleton />
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[8rem]">Typ umowy</TableHead>
                  <TableHead className="min-w-[10rem]">Nazwa firmy</TableHead>
                  <TableHead className="min-w-[8rem] whitespace-nowrap">Kwota brutto (PLN)</TableHead>
                  <TableHead className="min-w-[8rem]">Data zakończenia</TableHead>
                  <TableHead className="w-[120px] text-right">Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={5} className="h-36 text-center align-middle">
                      <p className="text-sm text-muted-foreground">Brak aktywnych umów dla tego budynku.</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => {
                    const company = row.company;
                    const name = company?.name?.trim() || "—";
                    const email = company?.email?.trim();
                    const phone = company?.phone?.trim();
                    const typeLabel = contractTypeDisplayLabel(row);
                    const endRaw = row.end_date;
                    const hasEnd = endRaw != null && String(endRaw).trim() !== "";
                    const deletePending =
                      deleteContract.isPending && deleteContract.variables?.id === row.id;

                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <Badge variant="outline" className="font-normal">
                            {typeLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-semibold text-foreground">{name}</TableCell>
                        <TableCell className="tabular-nums text-foreground">
                          {formatGrossDisplay(row.gross_value)}
                        </TableCell>
                        <TableCell>
                          {hasEnd ? (
                            <span className="tabular-nums text-foreground">{formatEndDateLabel(endRaw)}</span>
                          ) : (
                            <span className="text-muted-foreground">Czas nieokreślony</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-0.5">
                            {phone ? (
                              <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                                <a href={telHref(phone)} aria-label={`Zadzwoń: ${phone}`}>
                                  <Headphones className="h-4 w-4" aria-hidden />
                                </a>
                              </Button>
                            ) : null}
                            {email ? (
                              <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                                <a href={`mailto:${email}`} aria-label={`Napisz e-mail: ${email}`}>
                                  <Mail className="h-4 w-4" aria-hidden />
                                </a>
                              </Button>
                            ) : null}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  aria-label="Więcej akcji"
                                  disabled={deletePending}
                                >
                                  <MoreHorizontal className="h-4 w-4" aria-hidden />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem className="gap-2" onClick={() => openEdit(row)}>
                                  <Pencil className="h-4 w-4" aria-hidden />
                                  Edytuj umowę
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="gap-2 text-destructive focus:text-destructive"
                                  onClick={() => handleDelete(row)}
                                >
                                  <Trash2 className="h-4 w-4" aria-hidden />
                                  Usuń umowę
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
