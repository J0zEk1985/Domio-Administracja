import { useMemo } from "react";
import { ExternalLink, FileText, ListChecks } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useCleaningScopeDocument,
  usePartnerCleaningWorkScope,
  useSetCleaningScopeContract,
} from "@/hooks/useCleaningWorkScope";
import { usePropertyContracts } from "@/hooks/usePropertyContracts";
import { contractHasScopeDocument } from "@/lib/cleaningWorkScopeApi";
import { formatCleaningFrequency } from "@/lib/formatCleaningFrequency";
import { PROPERTY_CONTRACT_TYPE_LABELS } from "@/schemas/contractSchema";
import type { CleaningScopeDocumentSource } from "@/types/cleaningWorkScope";
import type { PropertyContractType } from "@/types/contracts";

const AUTO_VALUE = "__auto__";

const SOURCE_LABEL: Record<CleaningScopeDocumentSource, string> = {
  explicit: "Wskazany dokument",
  location: "Umowa budynku",
  community: "Umowa wspólnoty",
  none: "Brak dokumentu",
};

type PropertyCleaningWorkScopeTabProps = {
  locationId: string;
  communityId: string | null;
  locationMasterId: string | null;
  canManage: boolean;
};

function contractTypeLabel(type: string | null): string {
  if (!type) return "Umowa";
  if (type in PROPERTY_CONTRACT_TYPE_LABELS) {
    return PROPERTY_CONTRACT_TYPE_LABELS[type as PropertyContractType];
  }
  return type;
}

export function PropertyCleaningWorkScopeTab({
  locationId,
  communityId,
  locationMasterId,
  canManage,
}: PropertyCleaningWorkScopeTabProps) {
  const scopeQuery = usePartnerCleaningWorkScope(locationMasterId);
  const documentQuery = useCleaningScopeDocument(locationId);
  const setContract = useSetCleaningScopeContract(locationId);
  const contractsQuery = usePropertyContracts(locationId, {
    scope: communityId ? { parentCommunityId: communityId } : null,
  });

  const documentContracts = useMemo(
    () => (contractsQuery.data ?? []).filter((row) => contractHasScopeDocument(row.document_url)),
    [contractsQuery.data],
  );

  const document = documentQuery.data;
  const scope = scopeQuery.data;
  const selectValue = document?.source === "explicit" && document.contractId ? document.contractId : AUTO_VALUE;

  const activeCount = (scope?.items ?? []).filter((item) => item.checklistId && item.isActive).length;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Porównaj zakres prac wprowadzony w aplikacji Cleaning z PDF umowy. System nie ocenia zgodności automatycznie.
      </p>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
              Dokument umowy
            </CardTitle>
            <CardDescription>
              Wskazany skan albo automatycznie umowa budynku, a gdy jej nie ma — umowa wspólnoty.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {documentQuery.isLoading ? (
              <Skeleton className="h-28 w-full" />
            ) : documentQuery.isError ? (
              <Alert variant="destructive">
                <AlertDescription>
                  {documentQuery.error instanceof Error
                    ? documentQuery.error.message
                    : "Nie udało się ustalić dokumentu umowy."}
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{SOURCE_LABEL[document?.source ?? "none"]}</Badge>
                  {document?.contractNumber ? (
                    <span className="text-sm font-medium">{document.contractNumber}</span>
                  ) : null}
                </div>
                {document?.source === "none" ? (
                  <p className="text-sm text-muted-foreground">
                    Brak skanu w bazie umów. Dodaj dokument w zakładce Umowy i Przeglądy.
                  </p>
                ) : (
                  <div className="space-y-1 text-sm">
                    <p>
                      <span className="text-muted-foreground">Typ: </span>
                      {contractTypeLabel(document?.contractType ?? null)}
                    </p>
                    {document?.companyName ? (
                      <p>
                        <span className="text-muted-foreground">Firma: </span>
                        {document.companyName}
                      </p>
                    ) : null}
                  </div>
                )}
                {document?.documentUrl ? (
                  <Button type="button" variant="outline" size="sm" asChild>
                    <a href={document.documentUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" aria-hidden />
                      Otwórz dokument
                    </a>
                  </Button>
                ) : null}

                {canManage ? (
                  <div className="grid gap-2 pt-2">
                    <Label htmlFor="cleaning-scope-contract">Dokument do porównania</Label>
                    <Select
                      value={selectValue}
                      disabled={setContract.isPending || contractsQuery.isLoading}
                      onValueChange={(value) => {
                        setContract.mutate(value === AUTO_VALUE ? null : value);
                      }}
                    >
                      <SelectTrigger id="cleaning-scope-contract">
                        <SelectValue placeholder="Wybierz umowę" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={AUTO_VALUE}>Automatycznie z bazy umów</SelectItem>
                        {document?.source === "explicit" &&
                        document.contractId &&
                        !documentContracts.some((row) => row.id === document.contractId) ? (
                          <SelectItem value={document.contractId}>
                            {document.contractNumber ?? "Wskazana umowa"}
                          </SelectItem>
                        ) : null}
                        {documentContracts.map((row) => {
                          const companyName = row.company?.name?.trim();
                          return (
                            <SelectItem key={row.id} value={row.id}>
                              {row.contract_number}
                              {companyName ? ` · ${companyName}` : ""}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    {documentContracts.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Żadna umowa tej wspólnoty nie ma załączonego skanu. Uzupełnij go w zakładce Umowy i
                        Przeglądy.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-muted-foreground" aria-hidden />
              Zakres w Cleaning
            </CardTitle>
            <CardDescription>
              Sekcje i cykliczne zadania SOP wprowadzone przez firmę sprzątającą.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!locationMasterId ? (
              <Alert>
                <AlertDescription>
                  Ten budynek nie jest dopięty do adresu w rejestrze. Dopnij adres, aby odczytać zakres z Cleaning.
                </AlertDescription>
              </Alert>
            ) : !communityId ? (
              <Alert>
                <AlertDescription>
                  Przypisz budynek do wspólnoty i wskaż kooperanta Cleaning w zakładce Ekosystem.
                </AlertDescription>
              </Alert>
            ) : scopeQuery.isLoading ? (
              <Skeleton className="h-36 w-full" />
            ) : scopeQuery.isError ? (
              <Alert variant="destructive">
                <AlertDescription>
                  {scopeQuery.error instanceof Error
                    ? scopeQuery.error.message
                    : "Nie udało się wczytać zakresu prac Cleaning."}
                </AlertDescription>
              </Alert>
            ) : !scope ? (
              <Alert>
                <AlertDescription>
                  Brak powiązanej firmy Cleaning. Wskaż kooperanta w zakładce Ekosystem (mandat lub kooperacja).
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{scope.cleaningOrgName}</span>
                  {scope.hasActiveCooperation ? <Badge variant="secondary">Kooperacja</Badge> : null}
                  {scope.hasActiveMandate ? <Badge variant="secondary">Mandat</Badge> : null}
                  <span className="text-xs text-muted-foreground">Aktywne SOP: {activeCount}</span>
                </div>
                {scope.items.length === 0 ? (
                  <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    Firma Cleaning nie wprowadziła jeszcze zakresu prac dla tego budynku.
                  </p>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Sekcja</TableHead>
                          <TableHead>Zadanie</TableHead>
                          <TableHead>Częstotliwość</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {scope.items.map((item, index) => (
                          <TableRow key={item.checklistId ?? `section-${item.sectionId ?? index}`}>
                            <TableCell className="text-muted-foreground">
                              {item.sectionName ?? "Bez sekcji"}
                              {item.sectionId && !item.sectionIsActive ? (
                                <span className="ml-1 text-xs">(archiwum)</span>
                              ) : null}
                            </TableCell>
                            <TableCell className="font-medium">
                              {item.checklistName ?? "—"}
                              {item.requiresPhoto ? (
                                <span className="ml-2 text-xs font-normal text-muted-foreground">zdjęcie</span>
                              ) : null}
                            </TableCell>
                            <TableCell>
                              {item.checklistId
                                ? formatCleaningFrequency(item.frequency, item.frequencyConfig)
                                : "—"}
                            </TableCell>
                            <TableCell>
                              {item.checklistId ? (
                                <Badge variant={item.isActive ? "default" : "outline"}>
                                  {item.isActive ? "Aktywne" : "Wyłączone"}
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">Brak SOP</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
