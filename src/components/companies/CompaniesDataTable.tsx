import { useEffect, useState } from "react";
import { Pencil, Plus, Search } from "lucide-react";

import { CompanyDialog } from "@/components/companies/CompanyDialog";
import { Button } from "@/components/ui/button";
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
import { useCompanies } from "@/hooks/useCompanies";
import { COMPANY_CATEGORY_LABELS } from "@/schemas/companySchema";
import type { Company } from "@/types/contracts";
import { toast } from "@/components/ui/sonner";

const SEARCH_DEBOUNCE_MS = 300;
const SKELETON_ROWS = 8;

export function CompaniesDataTable() {
  const [inputQuery, setInputQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(inputQuery), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [inputQuery]);

  const searchForApi = debouncedQuery.trim() === "" ? undefined : debouncedQuery.trim();
  const companiesQuery = useCompanies(searchForApi);

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (!companiesQuery.isError || !companiesQuery.error) return;
    const msg =
      companiesQuery.error instanceof Error
        ? companiesQuery.error.message
        : "Nie udało się wczytać firm.";
    toast.error(msg);
    console.error("[CompaniesDataTable] companies error:", companiesQuery.error);
  }, [companiesQuery.isError, companiesQuery.error]);

  function openEdit(row: Company) {
    setEditing(row);
    setEditOpen(true);
  }

  if (companiesQuery.isPending) {
    return (
      <div className="space-y-4">
        <div className="flex w-full items-center justify-between gap-4">
          <Skeleton className="h-10 max-w-sm flex-1" />
          <Skeleton className="h-10 w-[140px] shrink-0" />
        </div>
        <div className="rounded-md border border-border/60">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Nazwa</TableHead>
                <TableHead>NIP</TableHead>
                <TableHead>Kategoria</TableHead>
                <TableHead className="w-[120px] text-right">Akcje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  <TableCell>
                    <Skeleton className="h-4 w-48" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-28" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell className="text-right">
                    <Skeleton className="ml-auto h-8 w-20" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  const rows = companiesQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex w-full items-center justify-between gap-4">
        <div className="relative min-w-0 max-w-sm flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            placeholder="Szukaj po nazwie lub NIP…"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            className="pl-9"
            aria-label="Szukaj firm"
          />
        </div>
        <Button type="button" className="shrink-0" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" aria-hidden />
          Dodaj firmę
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          Brak firm w katalogu dla podanych kryteriów.
        </p>
      ) : (
        <div className="rounded-md border border-border/60">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Nazwa</TableHead>
                <TableHead>NIP</TableHead>
                <TableHead>Kategoria</TableHead>
                <TableHead className="w-[120px] text-right">Akcje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium text-foreground">{row.name}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{row.tax_id}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {COMPANY_CATEGORY_LABELS[row.category]}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => openEdit(row)}>
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                      Edytuj
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CompanyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        onSuccess={() => {
          void companiesQuery.refetch();
        }}
      />
      <CompanyDialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) setEditing(null);
        }}
        mode="edit"
        company={editing}
        onSuccess={() => {
          void companiesQuery.refetch();
        }}
      />
    </div>
  );
}
