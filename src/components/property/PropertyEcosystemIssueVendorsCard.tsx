import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";

import { VendorPartnerCombobox } from "@/components/triage/VendorPartnerCombobox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAddLocationIssueVendor,
  useLocationIssueVendors,
  useRemoveLocationIssueVendor,
} from "@/hooks/useLocationIssueVendors";

type PropertyEcosystemIssueVendorsCardProps = {
  locationId: string;
  canManage: boolean;
};

export function PropertyEcosystemIssueVendorsCard({
  locationId,
  canManage,
}: PropertyEcosystemIssueVendorsCardProps) {
  const { data: rows = [], isLoading, isError } = useLocationIssueVendors(locationId);
  const addMut = useAddLocationIssueVendor();
  const removeMut = useRemoveLocationIssueVendor();
  const [vendorId, setVendorId] = useState("");

  const pending = addMut.isPending || removeMut.isPending;
  const attachedIds = new Set(rows.map((row) => row.vendor_id));

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Firmy do zgłoszeń</CardTitle>
        <CardDescription>
          Ta lista jest domyślnym wyborem przy ręcznym przekazaniu usterki z tego budynku.
          Firmy spoza listy z adresem e-mail dostaną zgłoszenie pocztą.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : isError ? (
          <p className="text-sm text-destructive">Nie udało się wczytać firm podpiętych pod budynek.</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Brak firm podpiętych pod ten budynek. Dodaj wykonawcę z katalogu Umowy i Firmy.
          </p>
        ) : (
          <ul className="divide-y divide-border/80 rounded-lg border border-border/60">
            {rows.map((row) => {
              const deleting = removeMut.isPending && removeMut.variables?.rowId === row.id;
              return (
                <li key={row.id} className="flex items-center gap-3 px-3 py-3 text-sm sm:px-4">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{row.vendor_name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {row.contact_email?.trim() || "Brak adresu e-mail"}
                    </span>
                  </span>
                  {canManage ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label={`Odepnij ${row.vendor_name}`}
                      disabled={pending}
                      onClick={() => removeMut.mutate({ rowId: row.id, locationId })}
                    >
                      {deleting ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <Trash2 className="h-4 w-4" aria-hidden />
                      )}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {canManage ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-[14rem] flex-1 space-y-1.5">
              <span className="block text-xs text-muted-foreground">Dodaj firmę</span>
              <VendorPartnerCombobox
                mode="routing"
                value={vendorId}
                disabled={pending}
                placeholder="Wybierz firmę…"
                onPick={(vendor) => setVendorId(vendor.id)}
              />
            </div>
            <Button
              type="button"
              disabled={!vendorId || pending || attachedIds.has(vendorId)}
              onClick={() => {
                addMut.mutate(
                  { locationId, vendorId },
                  { onSuccess: () => setVendorId("") },
                );
              }}
            >
              {addMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : "Podpnij"}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
