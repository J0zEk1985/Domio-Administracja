import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ExternalLink,
  Headphones,
  Mail,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import { ContractDialog } from "@/components/contracts/ContractDialog";
import { contractTypeDisplayLabel } from "@/components/contracts/columns";
import { AddInspectionDialog } from "@/components/inspections/AddInspectionDialog";
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
import { usePropertyInspections } from "@/hooks/usePropertyInspections";
import type { PropertyInspectionWithCompany } from "@/hooks/usePropertyInspections";
import {
  INSPECTION_STATUS_LABELS,
  INSPECTION_TYPE_LABELS,
} from "@/schemas/inspectionSchema";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

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

function formatIsoDateLabel(iso: string | null | undefined): string {
  if (iso == null || String(iso).trim() === "") {
    return "—";
  }
  const s = String(iso).slice(0, 10);
  const [y, m, d] = s.split("-").map((x) => Number(x));
  if (!y || !m || !d) return s;
  return new Date(y, m - 1, d).toLocaleDateString("pl-PL");
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

/** Calendar days from local midnight today to `validUntil` (YYYY-MM-DD). */
function daysFromTodayToValidUntil(validUntil: string): number | null {
  const s = validUntil.slice(0, 10);
  const [y, m, d] = s.split("-").map((x) => Number(x));
  if (!y || !m || !d) return null;
  const end = new Date(y, m - 1, d);
  end.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - today.getTime()) / 86_400_000);
}

function ValidUntilCell({ validUntil }: { validUntil: string }) {
  const delta = daysFromTodayToValidUntil(validUntil);
  const label = formatIsoDateLabel(validUntil);

  if (delta === null) {
    return <span className="tabular-nums text-muted-foreground">{label}</span>;
  }

  if (delta < 0) {
    return (
      <span className="inline-flex items-center gap-1.5 tabular-nums font-medium text-destructive">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        {label}
      </span>
    );
  }

  if (delta <= 30) {
    return (
      <span className="tabular-nums font-medium text-orange-600 dark:text-orange-400">{label}</span>
    );
  }

  return <span className="tabular-nums text-foreground">{label}</span>;
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

function InspectionsTableSkeleton() {
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[10rem]">Typ przeglądu</TableHead>
            <TableHead className="min-w-[10rem]">Wykonawca (firma)</TableHead>
            <TableHead className="min-w-[8rem]">Data wykonania</TableHead>
            <TableHead className="min-w-[8rem]">Ważne do</TableHead>
            <TableHead className="min-w-[8rem]">Status</TableHead>
            <TableHead className="w-[100px] text-right">Akcje</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[1, 2, 3].map((i) => (
            <TableRow key={i}>
              <TableCell>
                <Skeleton className="h-5 w-32 rounded-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-36" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-24" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-24" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-28 rounded-full" />
              </TableCell>
              <TableCell className="text-right">
                <Skeleton className="ml-auto h-8 w-8 rounded-md" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function PropertyContractsTab({ locationId }: { locationId: string }) {
  const [contractDialogOpen, setContractDialogOpen] = useState(false);
  const [inspectionDialogOpen, setInspectionDialogOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<PropertyContractWithCompany | null>(null);

  const contractsQuery = usePropertyContracts(locationId, { enabled: Boolean(locationId) });
  const inspectionsQuery = usePropertyInspections(locationId, { enabled: Boolean(locationId) });
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

  useEffect(() => {
    if (!inspectionsQuery.isError || !inspectionsQuery.error) return;
    const msg =
      inspectionsQuery.error instanceof Error
        ? inspectionsQuery.error.message
        : "Nie udało się wczytać przeglądów.";
    toast.error(msg);
    console.error("[PropertyContractsTab] inspections error:", inspectionsQuery.error);
  }, [inspectionsQuery.isError, inspectionsQuery.error]);

  const contractRows = contractsQuery.data ?? [];
  const inspectionRows = inspectionsQuery.data ?? [];

  function handleContractDialogOpenChange(next: boolean) {
    setContractDialogOpen(next);
    if (!next) {
      setEditingContract(null);
    }
  }

  function openAddContract() {
    setEditingContract(null);
    setContractDialogOpen(true);
  }

  function openEditContract(row: PropertyContractWithCompany) {
    setEditingContract(row);
    setContractDialogOpen(true);
  }

  function handleDeleteContract(row: PropertyContractWithCompany) {
    if (!window.confirm("Czy na pewno usunąć tę umowę? Tej operacji nie można cofnąć.")) {
      return;
    }
    deleteContract.mutate(
      { id: row.id, locationId },
      {
        onSuccess: () => toast.success("Umowa została usunięta."),
        onError: (err) => {
          toast.error(apiErrorMessage(err));
          console.error("[PropertyContractsTab] delete contract:", err);
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="text-base">Umowy</CardTitle>
            <CardDescription>Aktywne umowy przypisane do tej nieruchomości.</CardDescription>
          </div>
          <Button type="button" size="sm" className="shrink-0 gap-1.5" onClick={openAddContract}>
            <Plus className="h-4 w-4" aria-hidden />
            Dodaj umowę
          </Button>
        </CardHeader>
        <CardContent>
          <ContractDialog
            locationId={locationId}
            open={contractDialogOpen}
            onOpenChange={handleContractDialogOpenChange}
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
                  {contractRows.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={5} className="h-36 text-center align-middle">
                        <p className="text-sm text-muted-foreground">Brak aktywnych umów dla tego budynku.</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    contractRows.map((row) => {
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
                                  <DropdownMenuItem className="gap-2" onClick={() => openEditContract(row)}>
                                    <Pencil className="h-4 w-4" aria-hidden />
                                    Edytuj umowę
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="gap-2 text-destructive focus:text-destructive"
                                    onClick={() => handleDeleteContract(row)}
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

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="text-base">Oś czasu przeglądów (Compliance)</CardTitle>
            <CardDescription>
              Protokoły techniczne i terminy ważności — jedno zapytanie z firmą wykonawcy.
            </CardDescription>
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="shrink-0 gap-1.5"
            onClick={() => setInspectionDialogOpen(true)}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Dodaj przegląd
          </Button>
        </CardHeader>
        <CardContent>
          <AddInspectionDialog
            locationId={locationId}
            open={inspectionDialogOpen}
            onOpenChange={setInspectionDialogOpen}
          />

          {inspectionsQuery.isLoading ? (
            <InspectionsTableSkeleton />
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[10rem]">Typ przeglądu</TableHead>
                    <TableHead className="min-w-[10rem]">Wykonawca (firma)</TableHead>
                    <TableHead className="min-w-[8rem]">Data wykonania</TableHead>
                    <TableHead className="min-w-[8rem]">Ważne do</TableHead>
                    <TableHead className="min-w-[8rem]">Status</TableHead>
                    <TableHead className="w-[100px] text-right">Akcje</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inspectionRows.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={6} className="h-36 text-center align-middle">
                        <p className="text-sm text-muted-foreground">Brak zapisanych przeglądów dla tej nieruchomości.</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    inspectionRows.map((row: PropertyInspectionWithCompany) => {
                      const companyName = row.company?.name?.trim() || "—";
                      const typeLabel = INSPECTION_TYPE_LABELS[row.type] ?? row.type;
                      const statusLabel = INSPECTION_STATUS_LABELS[row.status] ?? row.status;
                      const docUrl = row.document_url?.trim();

                      return (
                        <TableRow key={row.id}>
                          <TableCell>
                            <Badge variant="outline" className="max-w-[240px] whitespace-normal font-normal leading-snug">
                              {typeLabel}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium text-foreground">{companyName}</TableCell>
                          <TableCell className="tabular-nums text-foreground">
                            {formatIsoDateLabel(row.execution_date)}
                          </TableCell>
                          <TableCell>
                            <ValidUntilCell validUntil={row.valid_until} />
                          </TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                "text-sm",
                                row.status === "negative" && "font-medium text-destructive",
                              )}
                            >
                              {statusLabel}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            {docUrl ? (
                              <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                                <a
                                  href={docUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label="Otwórz dokument"
                                >
                                  <ExternalLink className="h-4 w-4" aria-hidden />
                                </a>
                              </Button>
                            ) : (
                              <span className="text-sm text-muted-foreground">—</span>
                            )}
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
    </div>
  );
}
