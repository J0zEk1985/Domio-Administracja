import { useEffect, useMemo, useState } from "react";
import { format, isValid, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import { Link } from "react-router-dom";
import { AlertTriangle, ExternalLink, Plus } from "lucide-react";

import { InsurancePolicyForm } from "@/components/property/InsurancePolicyForm";
import { PropertyContractsListCard } from "@/components/property/PropertyContractsListCard";
import { AddInspectionDialog } from "@/components/inspections/AddInspectionDialog";
import {
  inspectionBuildingOptionLabel,
  type InspectionBuildingOption,
} from "@/components/inspections/InspectionBuildingScope";
import { CKobSyncButton } from "@/components/inspections/CKobSyncButton";
import { InspectionCKobStatusCell } from "@/components/inspections/columns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { usePropertyPolicies } from "@/hooks/usePropertyPolicies";
import { usePropertyContracts, type PropertyResourceScopeOptions } from "@/hooks/usePropertyContracts";
import {
  usePropertyInspections,
  type PropertyInspectionsScopeOptions,
} from "@/hooks/usePropertyInspections";
import type { PropertyInspectionWithCompany } from "@/hooks/usePropertyInspections";
import {
  INSPECTION_STATUSES,
  INSPECTION_STATUS_LABELS,
  INSPECTION_TYPES,
  INSPECTION_TYPE_LABELS,
  type InspectionStatus,
  type InspectionType,
} from "@/schemas/inspectionSchema";
import { policyScopeDisplayLabel } from "@/schemas/policySchema";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

const plnFormatter = new Intl.NumberFormat("pl-PL", {
  style: "currency",
  currency: "PLN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatIsoDateLabel(iso: string | null | undefined): string {
  if (iso == null || String(iso).trim() === "") {
    return "—";
  }
  const s = String(iso).slice(0, 10);
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

function formatCkobLastSyncLabel(iso: string): string {
  try {
    const d = parseISO(iso);
    if (!isValid(d)) return iso;
    return format(d, "d MMM yyyy, HH:mm", { locale: pl });
  } catch {
    return iso;
  }
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

function executionDateMs(iso: string): number {
  const s = iso.slice(0, 10);
  const [y, m, d] = s.split("-").map((x) => Number(x));
  if (!y || !m || !d) {
    const t = Date.parse(iso);
    return Number.isFinite(t) ? t : 0;
  }
  return new Date(y, m - 1, d).getTime();
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

function PoliciesTableSkeleton() {
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[7rem]">Zakres</TableHead>
            <TableHead className="min-w-[8rem]">Numer</TableHead>
            <TableHead className="min-w-[10rem]">Ubezpieczyciel</TableHead>
            <TableHead className="min-w-[8rem] whitespace-nowrap">Składka</TableHead>
            <TableHead className="min-w-[9rem]">Obowiązuje</TableHead>
            <TableHead className="w-[72px] text-right">PDF</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[1, 2, 3].map((i) => (
            <TableRow key={i}>
              <TableCell>
                <Skeleton className="h-5 w-20 rounded-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-28" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-36" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-24" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-40" />
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

function InspectionsTableSkeleton({ showBuilding }: { showBuilding: boolean }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {showBuilding ? <TableHead className="min-w-[10rem]">Nieruchomość</TableHead> : null}
            <TableHead className="min-w-[10rem]">Typ przeglądu</TableHead>
            <TableHead className="min-w-[10rem]">Wykonawca (firma)</TableHead>
            <TableHead className="min-w-[8rem]">Data wykonania</TableHead>
            <TableHead className="min-w-[8rem]">Ważne do</TableHead>
            <TableHead className="min-w-[8rem]">Status</TableHead>
            <TableHead className="min-w-[7rem]">c-KOB</TableHead>
            <TableHead className="w-[100px] text-right">Akcje</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[1, 2, 3].map((i) => (
            <TableRow key={i}>
              {showBuilding ? (
                <TableCell>
                  <Skeleton className="h-4 w-36" />
                </TableCell>
              ) : null}
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
              <TableCell>
                <Skeleton className="h-5 w-20" />
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

const DEFAULT_SECTIONS = { contracts: true, policies: true, inspections: true };

export function PropertyContractsTab({
  locationId,
  cKobBuildingId,
  resourceScope,
  inspectionsScope,
  sections = DEFAULT_SECTIONS,
  communityAssignOption,
  communityBuildings,
}: {
  locationId: string;
  cKobBuildingId: string | null;
  resourceScope?: PropertyResourceScopeOptions | null;
  inspectionsScope?: PropertyInspectionsScopeOptions | null;
  sections?: { contracts: boolean; policies: boolean; inspections: boolean };
  /** Checkbox „cała wspólnota” w formularzach dodawania (wymaga `communityId`). */
  communityAssignOption?: { communityId: string } | null;
  /** Used when adding an inspection from the community tab. */
  communityBuildings?: InspectionBuildingOption[] | null;
}) {
  const [policyDialogOpen, setPolicyDialogOpen] = useState(false);
  const [inspectionDialogOpen, setInspectionDialogOpen] = useState(false);
  const [inspectionTypeFilter, setInspectionTypeFilter] = useState<"all" | InspectionType>("all");
  const [inspectionStatusFilter, setInspectionStatusFilter] = useState<"all" | InspectionStatus>("all");
  const [hideHistoricalInspections, setHideHistoricalInspections] = useState(false);

  const contractsQuery = usePropertyContracts(locationId, {
    enabled: Boolean(locationId) && sections.contracts,
    scope: resourceScope ?? undefined,
  });
  const policiesQuery = usePropertyPolicies(locationId, {
    enabled: Boolean(locationId) && sections.policies,
    scope: resourceScope ?? undefined,
  });
  const inspectionsListEnabled =
    Boolean(locationId) &&
    sections.inspections &&
    (!inspectionsScope?.communityBuildingIds || inspectionsScope.communityBuildingIds.length > 0);
  const inspectionsQuery = usePropertyInspections(locationId, {
    enabled: inspectionsListEnabled,
    scope: inspectionsScope ?? undefined,
  });

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

  useEffect(() => {
    if (!policiesQuery.isError || !policiesQuery.error) return;
    const msg =
      policiesQuery.error instanceof Error
        ? policiesQuery.error.message
        : "Nie udało się wczytać polis.";
    toast.error(msg);
    console.error("[PropertyContractsTab] policies error:", policiesQuery.error);
  }, [policiesQuery.isError, policiesQuery.error]);

  const contractRows = contractsQuery.data ?? [];
  const policyRows = policiesQuery.data ?? [];
  const inspectionRows = inspectionsQuery.data ?? [];

  useEffect(() => {
    setInspectionTypeFilter("all");
    setInspectionStatusFilter("all");
    setHideHistoricalInspections(false);
  }, [locationId]);

  const inspectionTypesPresent = useMemo(() => {
    const seen = new Set<InspectionType>();
    for (const r of inspectionRows) {
      seen.add(r.type);
    }
    return INSPECTION_TYPES.filter((t) => seen.has(t));
  }, [inspectionRows]);

  useEffect(() => {
    if (inspectionTypeFilter !== "all" && !inspectionTypesPresent.includes(inspectionTypeFilter)) {
      setInspectionTypeFilter("all");
    }
  }, [inspectionTypeFilter, inspectionTypesPresent]);

  const maxExecutionMsByType = useMemo(() => {
    const m = new Map<InspectionType, number>();
    for (const r of inspectionRows) {
      const ms = executionDateMs(r.execution_date);
      const cur = m.get(r.type);
      if (cur === undefined || ms > cur) {
        m.set(r.type, ms);
      }
    }
    return m;
  }, [inspectionRows]);

  const filteredInspectionRows = useMemo(() => {
    let list = inspectionRows;
    if (inspectionTypeFilter !== "all") {
      list = list.filter((r) => r.type === inspectionTypeFilter);
    }
    if (inspectionStatusFilter !== "all") {
      list = list.filter((r) => r.status === inspectionStatusFilter);
    }
    if (hideHistoricalInspections) {
      list = list.filter((r) => {
        const maxMs = maxExecutionMsByType.get(r.type);
        return maxMs !== undefined && executionDateMs(r.execution_date) === maxMs;
      });
    }
    return list;
  }, [
    inspectionRows,
    inspectionTypeFilter,
    inspectionStatusFilter,
    hideHistoricalInspections,
    maxExecutionMsByType,
  ]);

  const showInspectionBuilding =
    Boolean(inspectionsScope?.communityBuildingIds && inspectionsScope.communityBuildingIds.length > 0);
  const inspectionColumnCount = showInspectionBuilding ? 8 : 7;

  const latestCkobSyncAt = useMemo(() => {
    let best: string | null = null;
    let bestMs = -Infinity;
    for (const r of inspectionRows) {
      const raw = r.c_kob_last_sync_at?.trim();
      if (!raw) continue;
      const ms = Date.parse(raw);
      if (Number.isFinite(ms) && ms >= bestMs) {
        bestMs = ms;
        best = raw;
      }
    }
    return best;
  }, [inspectionRows]);

  return (
    <div className="space-y-6">
      {sections.contracts ? (
        <PropertyContractsListCard
          locationId={locationId}
          contractRows={contractRows}
          isLoading={contractsQuery.isLoading}
          communityAssignOption={communityAssignOption}
        />
      ) : null}

      {sections.policies ? (
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="text-base">Ubezpieczenia</CardTitle>
            <CardDescription>Polisy przypisane do tej nieruchomości.</CardDescription>
          </div>
          <Button type="button" size="sm" className="shrink-0 gap-1.5" onClick={() => setPolicyDialogOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Dodaj polisę
          </Button>
        </CardHeader>
        <CardContent>
          <InsurancePolicyForm
            locationId={locationId}
            open={policyDialogOpen}
            onOpenChange={setPolicyDialogOpen}
            communityAssignOption={communityAssignOption ?? undefined}
          />

          {policiesQuery.isLoading ? (
            <PoliciesTableSkeleton />
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[7rem]">Zakres</TableHead>
                    <TableHead className="min-w-[8rem]">Numer</TableHead>
                    <TableHead className="min-w-[10rem]">Ubezpieczyciel</TableHead>
                    <TableHead className="min-w-[8rem] whitespace-nowrap">Składka</TableHead>
                    <TableHead className="min-w-[9rem]">Obowiązuje</TableHead>
                    <TableHead className="w-[72px] text-right">PDF</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {policyRows.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={6} className="h-36 text-center align-middle">
                        <p className="text-sm text-muted-foreground">Brak zapisanych polis dla tego budynku.</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    policyRows.map((row) => {
                      const companyName = row.company?.name?.trim() ?? "";
                      const scopeLabel = policyScopeDisplayLabel(row.policy_scope ?? "majątkowe");
                      const docUrl = row.document_url?.trim();

                      return (
                        <TableRow key={row.id}>
                          <TableCell>
                            <Badge variant="secondary" className="font-normal">
                              {scopeLabel}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium tabular-nums text-foreground">
                            {row.policy_number?.trim() || "—"}
                          </TableCell>
                          <TableCell>
                            <CompanyNameLink companyId={row.company_id} name={companyName} />
                          </TableCell>
                          <TableCell className="tabular-nums text-foreground">
                            {formatGrossDisplay(row.premium_amount)}
                          </TableCell>
                          <TableCell className="text-sm tabular-nums text-foreground">
                            <span className="whitespace-nowrap">{formatIsoDateLabel(row.start_date)}</span>
                            <span className="mx-1 text-muted-foreground">→</span>
                            <span className="whitespace-nowrap">{formatIsoDateLabel(row.end_date)}</span>
                          </TableCell>
                          <TableCell className="text-right">
                            {docUrl ? (
                              <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                                <a
                                  href={docUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label="Otwórz PDF polisy"
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
      ) : null}

      {sections.inspections ? (
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="flex flex-col gap-3 space-y-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1.5">
              <CardTitle className="text-base">Oś czasu przeglądów (Compliance)</CardTitle>
              <CardDescription>
                Protokoły techniczne i terminy ważności — jedno zapytanie z firmą wykonawcy.
              </CardDescription>
            </div>
            <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-2 sm:w-auto sm:max-w-[min(100%,42rem)]">
              {!inspectionsQuery.isLoading && inspectionRows.length > 0 ? (
                <>
                  <Select
                    value={inspectionTypeFilter}
                    onValueChange={(v) => setInspectionTypeFilter(v as "all" | InspectionType)}
                  >
                    <SelectTrigger className="h-8 w-[min(100%,11rem)] text-xs" aria-label="Filtr typu przeglądu">
                      <SelectValue placeholder="Typ" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-xs">
                        Wszystkie typy
                      </SelectItem>
                      {inspectionTypesPresent.map((t) => (
                        <SelectItem key={t} value={t} className="text-xs">
                          {INSPECTION_TYPE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={inspectionStatusFilter}
                    onValueChange={(v) => setInspectionStatusFilter(v as "all" | InspectionStatus)}
                  >
                    <SelectTrigger className="h-8 w-[min(100%,10rem)] text-xs" aria-label="Filtr statusu protokołu">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-xs">
                        Wszystkie statusy
                      </SelectItem>
                      {INSPECTION_STATUSES.map((s) => (
                        <SelectItem key={s} value={s} className="text-xs">
                          {INSPECTION_STATUS_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-1.5">
                    <Switch
                      id="hide-historical-inspections"
                      checked={hideHistoricalInspections}
                      onCheckedChange={setHideHistoricalInspections}
                      className="scale-90"
                    />
                    <Label
                      htmlFor="hide-historical-inspections"
                      className="cursor-pointer whitespace-nowrap text-xs font-normal text-muted-foreground"
                    >
                      Ukryj historyczne
                    </Label>
                  </div>
                </>
              ) : null}
              {cKobBuildingId ? <CKobSyncButton locationId={locationId} cKobBuildingId={cKobBuildingId} /> : null}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="shrink-0 gap-1.5"
                onClick={() => setInspectionDialogOpen(true)}
              >
                <Plus className="h-4 w-4" aria-hidden />
                Dodaj własny
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <AddInspectionDialog
            locationId={locationId}
            open={inspectionDialogOpen}
            onOpenChange={setInspectionDialogOpen}
            communityBuildings={showInspectionBuilding ? communityBuildings : null}
          />

          {inspectionsQuery.isLoading ? (
            <InspectionsTableSkeleton showBuilding={showInspectionBuilding} />
          ) : inspectionRows.length === 0 ? (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {showInspectionBuilding ? (
                      <TableHead className="min-w-[10rem]">Nieruchomość</TableHead>
                    ) : null}
                    <TableHead className="min-w-[10rem]">Typ przeglądu</TableHead>
                    <TableHead className="min-w-[10rem]">Wykonawca (firma)</TableHead>
                    <TableHead className="min-w-[8rem]">Data wykonania</TableHead>
                    <TableHead className="min-w-[8rem]">Ważne do</TableHead>
                    <TableHead className="min-w-[8rem]">Status</TableHead>
                    <TableHead className="min-w-[7rem]">c-KOB</TableHead>
                    <TableHead className="w-[100px] text-right">Akcje</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={inspectionColumnCount} className="h-36 text-center align-middle">
                      <p className="text-sm text-muted-foreground">Brak zapisanych przeglądów dla tej nieruchomości.</p>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          ) : (
            <>
              {filteredInspectionRows.length === 0 ? (
                <div className="flex min-h-[200px] flex-col items-center justify-center rounded-lg border border-dashed border-border/80 bg-muted/10 px-4 py-10 text-center">
                  <p className="text-sm font-medium text-foreground">Brak przeglądów spełniających kryteria</p>
                  <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                    Zmień filtry albo wyłącz opcję ukrywania starszych wpisów dla tego samego typu (wg daty wykonania).
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {showInspectionBuilding ? (
                          <TableHead className="min-w-[10rem]">Nieruchomość</TableHead>
                        ) : null}
                        <TableHead className="min-w-[10rem]">Typ przeglądu</TableHead>
                        <TableHead className="min-w-[10rem]">Wykonawca (firma)</TableHead>
                        <TableHead className="min-w-[8rem]">Data wykonania</TableHead>
                        <TableHead className="min-w-[8rem]">Ważne do</TableHead>
                        <TableHead className="min-w-[8rem]">Status</TableHead>
                        <TableHead className="min-w-[7rem]">c-KOB</TableHead>
                        <TableHead className="w-[100px] text-right">Akcje</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredInspectionRows.map((row: PropertyInspectionWithCompany) => {
                      const companyName = row.company?.name?.trim() ?? "";
                      const typeLabel = INSPECTION_TYPE_LABELS[row.type] ?? row.type;
                      const statusLabel = INSPECTION_STATUS_LABELS[row.status] ?? row.status;
                      const docUrl = row.document_url?.trim();

                      const location = row.location ?? null;
                      const buildingLabel = location
                        ? inspectionBuildingOptionLabel({
                            id: row.location_id,
                            name: location.name ?? "",
                            address: location.address ?? "",
                          })
                        : "—";

                      return (
                        <TableRow key={row.id}>
                          {showInspectionBuilding ? (
                            <TableCell>
                              <Link to={`/properties/${row.location_id}`} className="font-medium text-primary hover:underline">
                                {buildingLabel}
                              </Link>
                            </TableCell>
                          ) : null}
                          <TableCell>
                            <Badge variant="outline" className="max-w-[240px] whitespace-normal font-normal leading-snug">
                              {typeLabel}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <CompanyNameLink companyId={row.company_id} name={companyName} />
                          </TableCell>
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
                          <TableCell>
                            <InspectionCKobStatusCell row={row} />
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
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            {latestCkobSyncAt
              ? `Ostatnia synchronizacja c-KOB (wg rekordów): ${formatCkobLastSyncLabel(latestCkobSyncAt)}.`
              : "Brak zapisanej daty synchronizacji c-KOB w załadowanych przeglądach."}
          </p>
        </CardContent>
      </Card>
      ) : null}
    </div>
  );
}
