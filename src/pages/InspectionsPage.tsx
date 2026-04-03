import { useEffect } from "react";

import { InspectionsDataTable } from "@/components/inspections/InspectionsDataTable";
import { useAllInspections } from "@/hooks/useAllInspections";
import { toast } from "@/components/ui/sonner";

export default function InspectionsPage() {
  const inspectionsQuery = useAllInspections();

  useEffect(() => {
    if (!inspectionsQuery.isError || !inspectionsQuery.error) return;
    const msg =
      inspectionsQuery.error instanceof Error
        ? inspectionsQuery.error.message
        : "Nie udało się wczytać przeglądów.";
    toast.error(msg);
    console.error("[InspectionsPage] inspections error:", inspectionsQuery.error);
  }, [inspectionsQuery.isError, inspectionsQuery.error]);

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Globalny Rejestr Przeglądów</h1>
        <p className="text-sm text-muted-foreground">
          Centrum compliance: wszystkie protokoły z dostępnych nieruchomości, posortowane wg ważności. Dane ograniczane są
          przez RLS w bazie.
        </p>
      </div>

      <InspectionsDataTable data={inspectionsQuery.data ?? []} isLoading={inspectionsQuery.isPending} />
    </div>
  );
}
