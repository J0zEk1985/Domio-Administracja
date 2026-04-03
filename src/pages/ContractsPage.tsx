import { useEffect } from "react";
import { useAllContracts } from "@/hooks/useAllContracts";
import { CompaniesDataTable } from "@/components/companies/CompaniesDataTable";
import { ContractsDataTable } from "@/components/contracts/ContractsDataTable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Umowy i Firmy</h1>
        <p className="text-sm text-muted-foreground">
          Zarządzaj umowami oraz globalnym katalogiem firm. Widok uwzględnia tylko dane, do których masz uprawnienia.
        </p>
      </div>

      <Tabs defaultValue="contracts" className="w-full">
        <TabsList>
          <TabsTrigger value="contracts">Umowy</TabsTrigger>
          <TabsTrigger value="companies">Firmy</TabsTrigger>
        </TabsList>
        <TabsContent value="contracts" className="mt-6">
          <ContractsDataTable data={contractsQuery.data ?? []} isLoading={contractsQuery.isPending} />
        </TabsContent>
        <TabsContent value="companies" className="mt-6">
          <CompaniesDataTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}
