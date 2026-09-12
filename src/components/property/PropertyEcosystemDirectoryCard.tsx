import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ProviderDirectoryRow } from "@/lib/mandateApi";

export type DirectoryProvider = ProviderDirectoryRow & {
  isCleaning: boolean;
  isMaintenance: boolean;
};

type PropertyEcosystemDirectoryCardProps = {
  canManage: boolean;
  loading: boolean;
  errorMessage: string | null;
  query: string;
  onQueryChange: (value: string) => void;
  rows: DirectoryProvider[];
  invitePending: boolean;
  onInviteCleaning: (row: DirectoryProvider) => void;
  onInviteMaintenance: (row: DirectoryProvider) => void;
};

export function PropertyEcosystemDirectoryCard({
  canManage,
  loading,
  errorMessage,
  query,
  onQueryChange,
  rows,
  invitePending,
  onInviteCleaning,
  onInviteMaintenance,
}: PropertyEcosystemDirectoryCardProps) {
  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Katalog usługodawców</CardTitle>
        <CardDescription>
          Firmy, które zgłosiły chęć współpracy (opt-in). To nie jest pełna lista subskrybentów Serwis/Cleaning.
          Zaproszenie wymaga akceptacji drugiej strony — nie muszą mieć jeszcze dopiętego tego adresu.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Szukaj po nazwie, mieście lub NIP"
          aria-label="Szukaj usługodawcy"
        />
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : errorMessage ? (
          <p className="text-sm text-destructive">{errorMessage}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Brak firm, które zgłosiły widoczność w katalogu i mają aktywny plan Serwis lub Cleaning.
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Firma</TableHead>
                  <TableHead>Miasto</TableHead>
                  <TableHead>NIP</TableHead>
                  {canManage ? <TableHead className="text-right">Zaproszenie</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.orgId}>
                    <TableCell className="font-medium">{row.orgName}</TableCell>
                    <TableCell>{row.city || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{row.nip}</TableCell>
                    {canManage ? (
                      <TableCell className="text-right space-x-2">
                        {row.isCleaning ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={invitePending}
                            onClick={() => onInviteCleaning(row)}
                          >
                            Zaproś Cleaning
                          </Button>
                        ) : null}
                        {row.isMaintenance ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={invitePending}
                            onClick={() => onInviteMaintenance(row)}
                          >
                            Zaproś Serwis
                          </Button>
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
