import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Headphones, Mail, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";

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
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/sonner";
import {
  useDeleteContract,
  type PropertyContractWithCompany,
} from "@/hooks/usePropertyContracts";
import {
  filterAndSortPropertyContracts,
  isContractOutdated,
  nextPropertyContractSort,
  type PropertyContractSortDir,
  type PropertyContractSortKey,
} from "@/lib/propertyContractsTable";
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

function CompanyNameLink({
  companyId,
  name,
}: {
  companyId: string | null | undefined;
  name: string;
}) {
  const label = name.trim();
  if (companyId && label.length > 0) {
    return (
      <Link
        to={`/companies/${companyId}`}
        className="font-medium text-primary transition-colors hover:underline"
      >
        {label}
      </Link>
    );
  }
  return <span className="text-muted-foreground">{label.length > 0 ? label : "—"}</span>;
}

function SortableColumnHeader({
  label,
  sortKey,
  currentKey,
  direction,
  onSort,
  className,
}: {
  label: string;
  sortKey: PropertyContractSortKey;
  currentKey: PropertyContractSortKey | null;
  direction: PropertyContractSortDir;
  onSort: (key: PropertyContractSortKey) => void;
  className?: string;
}) {
  const active = currentKey === sortKey;
  const ariaSort = !active ? "none" : direction === "asc" ? "ascending" : "descending";

  return (
    <TableHead className={className} aria-sort={ariaSort}>
      <Button
        type="button"
        variant="ghost"
        className="-ml-3 h-8 gap-1 px-3 font-medium text-muted-foreground hover:text-foreground"
        onClick={() => onSort(sortKey)}
        aria-label={`Sortuj według: ${label}`}
      >
        {label}
        {active && direction === "desc" ? (
          <ArrowDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
        ) : active && direction === "asc" ? (
          <ArrowUp className="h-3.5 w-3.5 shrink-0" aria-hidden />
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
        )}
      </Button>
    </TableHead>
  );
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

export function PropertyContractsListCard({
  locationId,
  contractRows,
  isLoading,
  communityAssignOption,
}: {
  locationId: string;
  contractRows: PropertyContractWithCompany[];
  isLoading: boolean;
  communityAssignOption?: { communityId: string } | null;
}) {
  const [contractDialogOpen, setContractDialogOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<PropertyContractWithCompany | null>(null);
  const [hideOutdated, setHideOutdated] = useState(false);
  const [sortKey, setSortKey] = useState<PropertyContractSortKey | null>(null);
  const [sortDir, setSortDir] = useState<PropertyContractSortDir>("asc");
  const deleteContract = useDeleteContract();

  useEffect(() => {
    setHideOutdated(false);
    setSortKey(null);
    setSortDir("asc");
  }, [locationId]);

  const visibleRows = useMemo(
    () =>
      filterAndSortPropertyContracts(contractRows, {
        hideOutdated,
        sortKey,
        sortDir,
      }),
    [contractRows, hideOutdated, sortKey, sortDir],
  );

  const outdatedCount = useMemo(
    () => contractRows.filter((row) => isContractOutdated(row.end_date)).length,
    [contractRows],
  );

  function handleSort(key: PropertyContractSortKey) {
    const next = nextPropertyContractSort(sortKey, sortDir, key);
    setSortKey(next.sortKey);
    setSortDir(next.sortDir);
  }

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
          console.error("[PropertyContractsListCard] delete contract:", err);
        },
      },
    );
  }

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Umowy</CardTitle>
          <CardDescription>Umowy przypisane do tej nieruchomości.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {!isLoading && contractRows.length > 0 ? (
            <div className="flex items-center gap-1.5">
              <Switch
                id="hide-outdated-contracts"
                checked={hideOutdated}
                onCheckedChange={setHideOutdated}
                className="scale-90"
              />
              <Label
                htmlFor="hide-outdated-contracts"
                className="cursor-pointer whitespace-nowrap text-xs font-normal text-muted-foreground"
              >
                Ukryj nieaktualne{outdatedCount > 0 ? ` (${outdatedCount})` : ""}
              </Label>
            </div>
          ) : null}
          <Button type="button" size="sm" className="shrink-0 gap-1.5" onClick={openAddContract}>
            <Plus className="h-4 w-4" aria-hidden />
            Dodaj umowę
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ContractDialog
          locationId={locationId}
          open={contractDialogOpen}
          onOpenChange={handleContractDialogOpenChange}
          contract={editingContract ?? undefined}
          communityAssignOption={communityAssignOption ?? undefined}
        />

        {isLoading ? (
          <ContractsTableSkeleton />
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableColumnHeader
                    label="Typ umowy"
                    sortKey="type"
                    currentKey={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                    className="min-w-[8rem]"
                  />
                  <SortableColumnHeader
                    label="Nazwa firmy"
                    sortKey="company"
                    currentKey={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                    className="min-w-[10rem]"
                  />
                  <SortableColumnHeader
                    label="Kwota brutto (PLN)"
                    sortKey="gross"
                    currentKey={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                    className="min-w-[8rem] whitespace-nowrap"
                  />
                  <SortableColumnHeader
                    label="Data zakończenia"
                    sortKey="endDate"
                    currentKey={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                    className="min-w-[8rem]"
                  />
                  <TableHead className="w-[120px] text-right">Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contractRows.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={5} className="h-36 text-center align-middle">
                      <p className="text-sm text-muted-foreground">Brak umów dla tego budynku.</p>
                    </TableCell>
                  </TableRow>
                ) : visibleRows.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={5} className="h-36 text-center align-middle">
                      <p className="text-sm text-muted-foreground">
                        Brak aktualnych umów. Wyłącz „Ukryj nieaktualne”, aby zobaczyć wygasłe.
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleRows.map((row) => {
                    const company = row.company;
                    const name = company?.name?.trim() ?? "";
                    const email = company?.email?.trim();
                    const phone = company?.phone?.trim();
                    const typeLabel = contractTypeDisplayLabel(row);
                    const endRaw = row.end_date;
                    const hasEnd = endRaw != null && String(endRaw).trim() !== "";
                    const outdated = isContractOutdated(endRaw);
                    const deletePending =
                      deleteContract.isPending && deleteContract.variables?.id === row.id;

                    return (
                      <TableRow
                        key={row.id}
                        title={outdated ? "Umowa nieaktualna" : undefined}
                        className={cn(
                          outdated &&
                            "bg-red-50/90 hover:bg-red-100/80 dark:bg-red-950/30 dark:hover:bg-red-950/45",
                        )}
                      >
                        <TableCell>
                          <Badge variant="outline" className="font-normal">
                            {typeLabel}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <CompanyNameLink companyId={row.company_id} name={name} />
                        </TableCell>
                        <TableCell className="tabular-nums text-foreground">
                          {formatGrossDisplay(row.gross_value)}
                        </TableCell>
                        <TableCell>
                          {hasEnd ? (
                            <span
                              className={cn(
                                "tabular-nums",
                                outdated ? "font-medium text-destructive" : "text-foreground",
                              )}
                            >
                              {formatEndDateLabel(endRaw)}
                            </span>
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
  );
}
