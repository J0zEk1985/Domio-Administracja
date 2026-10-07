import { useAssignIssueLocation } from "@/hooks/useAssignIssueLocation";
import type { TriageIssue } from "@/hooks/useTriageIssues";
import { useProperties } from "@/hooks/useProperties";
import { formatIssueBuildingLabel } from "@/lib/issueLocationLabel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function AssignIssueBuildingControl({ issue }: { issue: TriageIssue }) {
  const properties = useProperties(true);
  const assign = useAssignIssueLocation();
  const rows = properties.data ?? [];

  return (
    <div className="space-y-2">
      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">Przypisz budynek</span>
        <Select
          disabled={assign.isPending || properties.isLoading || rows.length === 0}
          onValueChange={(locationId) => {
            const picked = rows.find((row) => row.id === locationId);
            if (!picked) return;
            assign.mutate({
              issueId: issue.id,
              locationId,
              location: { name: picked.name, address: picked.address },
            });
          }}
        >
          <SelectTrigger className="h-9 w-full max-w-md text-sm" aria-label="Przypisz budynek">
            <SelectValue placeholder={properties.isLoading ? "Ładowanie budynków…" : "Wybierz budynek"} />
          </SelectTrigger>
          <SelectContent>
            {rows.map((row) => (
              <SelectItem key={row.id} value={row.id}>
                {formatIssueBuildingLabel(row)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      {properties.isError ? (
        <p className="text-sm text-destructive">Nie udało się wczytać listy budynków.</p>
      ) : null}
      {!properties.isLoading && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Brak aktywnych budynków do przypisania.</p>
      ) : null}
    </div>
  );
}
