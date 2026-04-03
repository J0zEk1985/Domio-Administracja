import { useEffect } from "react";
import { useAllContracts } from "@/hooks/useAllContracts";
import { ContractsDataTable } from "@/components/contracts/ContractsDataTable";
import { toast } from "@/components/ui/sonner";

export default function ContractsPage() {
  const contractsQuery = useAllContracts();

  useEffect(() => {
    if (!contractsQuery.isError || !contractsQuery.error) return;
    const msg =
      contractsQuery.error instanceof Error
        ? contractsQuery.error.message
        : "Nie udało się wczytać umów.";
    toast.error(msg);
    console.error("[ContractsPage] contracts error:", contractsQuery.error);
  }, [contractsQuery.isError, contractsQuery.error]);

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Umowy i firmy</h1>
        <p className="text-sm text-muted-foreground">
          Zarządzaj wszystkimi umowami w swoich nieruchomościach. Widok uwzględnia tylko dane, do których masz
          uprawnienia.
        </p>
      </div>
      <ContractsDataTable data={contractsQuery.data ?? []} isLoading={contractsQuery.isPending} />
    </div>
  );
}
