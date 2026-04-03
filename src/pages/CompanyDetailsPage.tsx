import { useEffect } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, Hash, Mail, MapPin, Phone } from "lucide-react";

import { ContractsDataTable } from "@/components/contracts/ContractsDataTable";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAllContracts } from "@/hooks/useAllContracts";
import { useCompanyById } from "@/hooks/useCompanies";
import { COMPANY_CATEGORY_LABELS } from "@/schemas/companySchema";
import { toast } from "@/components/ui/sonner";

export default function CompanyDetailsPage() {
  const { id: companyId } = useParams<{ id: string }>();
  const companyQuery = useCompanyById(companyId);
  const contractsQuery = useAllContracts(companyId ? { companyId } : undefined, {
    enabled: Boolean(companyId),
  });

  useEffect(() => {
    if (!companyQuery.isError || !companyQuery.error) return;
    const msg =
      companyQuery.error instanceof Error
        ? companyQuery.error.message
        : "Nie udało się wczytać firmy.";
    toast.error(msg);
    console.error("[CompanyDetailsPage] company error:", companyQuery.error);
  }, [companyQuery.isError, companyQuery.error]);

  useEffect(() => {
    if (!contractsQuery.isError || !contractsQuery.error) return;
    const msg =
      contractsQuery.error instanceof Error
        ? contractsQuery.error.message
        : "Nie udało się wczytać umów.";
    toast.error(msg);
    console.error("[CompanyDetailsPage] contracts error:", contractsQuery.error);
  }, [contractsQuery.isError, contractsQuery.error]);

  if (!companyId) {
    return <Navigate to="/contracts" replace />;
  }

  if (companyQuery.isPending) {
    return (
      <div className="flex-1 space-y-6 p-6">
        <Skeleton className="h-9 w-48" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </div>
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  const company = companyQuery.data;
  if (!company) {
    return (
      <div className="flex-1 space-y-4 p-6">
        <Button type="button" variant="ghost" size="sm" className="gap-2 -ml-2" asChild>
          <Link to="/contracts">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Wróć do umów i firm
          </Link>
        </Button>
        <p className="text-sm text-muted-foreground">Nie znaleziono firmy lub brak dostępu.</p>
      </div>
    );
  }

  const phone = company.phone?.trim();
  const address = company.address?.trim();
  const emailLine = company.email?.trim();

  return (
    <div className="flex-1 space-y-8 p-6">
      <div>
        <Button type="button" variant="ghost" size="sm" className="gap-2 -ml-2 mb-4" asChild>
          <Link to="/contracts">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Wróć do umów i firm
          </Link>
        </Button>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{company.name}</h1>
            <p className="text-sm text-muted-foreground">{COMPANY_CATEGORY_LABELS[company.category]}</p>
          </div>
        </div>

        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:max-w-3xl">
          <li className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/5 px-4 py-3">
            <Hash className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <p className="text-xs font-medium text-muted-foreground">NIP</p>
              <p className="text-sm font-medium tabular-nums text-foreground">{company.tax_id}</p>
            </div>
          </li>
          <li className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/5 px-4 py-3">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <p className="text-xs font-medium text-muted-foreground">Adres</p>
              <p className="text-sm text-foreground">{address && address.length > 0 ? address : "—"}</p>
            </div>
          </li>
          <li className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/5 px-4 py-3">
            <Phone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <p className="text-xs font-medium text-muted-foreground">Telefon</p>
              <p className="text-sm tabular-nums text-foreground">
                {phone && phone.length > 0 ? (
                  <a href={`tel:${phone.replace(/\s/g, "")}`} className="hover:underline text-primary">
                    {phone}
                  </a>
                ) : (
                  "—"
                )}
              </p>
            </div>
          </li>
          {emailLine && emailLine.length > 0 ? (
            <li className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/5 px-4 py-3">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <div>
                <p className="text-xs font-medium text-muted-foreground">E-mail</p>
                <p className="text-sm text-foreground">
                  <a href={`mailto:${emailLine}`} className="hover:underline text-primary">
                    {emailLine}
                  </a>
                </p>
              </div>
            </li>
          ) : null}
        </ul>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Umowy z tą firmą</h2>
        <p className="text-sm text-muted-foreground">
          Lista umów powiązanych z tą firmą w nieruchomościach, do których masz dostęp (RLS).
        </p>
        <ContractsDataTable data={contractsQuery.data ?? []} isLoading={contractsQuery.isPending} />
      </section>
    </div>
  );
}
