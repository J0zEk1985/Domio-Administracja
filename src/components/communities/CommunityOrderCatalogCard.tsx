import { useMemo, useState } from "react";

import {
  CommunityOrderCatalogItemDialog,
  type CatalogItemDraft,
} from "@/components/communities/CommunityOrderCatalogItemDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { propertyDisplayName, type CommunityLocationRow } from "@/hooks/useProperties";
import {
  useDeleteResidentOrderCatalogItem,
  useResidentOrderCatalog,
  useUpsertResidentOrderCatalogItem,
} from "@/hooks/useResidentOrders";
import { formatResidentOrderPrice, type ResidentOrderCatalogItem } from "@/types/residentOrders";

type Props = {
  communityId: string;
  buildings: CommunityLocationRow[];
};

export function CommunityOrderCatalogCard({ communityId, buildings }: Props) {
  const catalogQuery = useResidentOrderCatalog(communityId);
  const upsert = useUpsertResidentOrderCatalogItem(communityId);
  const remove = useDeleteResidentOrderCatalogItem(communityId);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ResidentOrderCatalogItem | null>(null);

  const items = catalogQuery.data ?? [];

  function openCreate() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(item: ResidentOrderCatalogItem) {
    setEditing(item);
    setOpen(true);
  }

  const locationLabel = useMemo(() => {
    const map = new Map(buildings.map((building) => [building.id, propertyDisplayName(building.name) ?? building.address]));
    return (ids: string[]) => {
      if (ids.length === 0) return "Wszystkie budynki";
      return ids.map((id) => map.get(id) ?? id).join(", ");
    };
  }, [buildings]);

  function onSubmit(draft: CatalogItemDraft) {
    upsert.mutate(
      {
        communityId,
        ...draft,
        itemId: editing?.id,
      },
      { onSuccess: () => setOpen(false) },
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Katalog do zamówienia</CardTitle>
          <CardDescription>
            Lista startuje pusta. Dodajesz i edytujesz pozycje (piloty, klucze, pastylki). Każda pozycja ma własną firmę
            i treść maila. Mieszkańcy w Home widzą tylko aktywne rzeczy.
          </CardDescription>
        </div>
        <Button type="button" size="sm" onClick={openCreate}>
          Dodaj pozycję
        </Button>
      </CardHeader>
      <CardContent>
        {catalogQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Wczytywanie katalogu…</p>
        ) : catalogQuery.isError ? (
          <p className="text-sm text-destructive">Nie udało się wczytać katalogu.</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Katalog jest pusty. Dodaj pierwszą pozycję, aby mieszkańcy mogli składać zamówienia.
          </p>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-2 rounded-md border border-border/60 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="font-medium leading-snug">
                    {item.name}
                    {!item.isActive ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">(ukryta)</span>
                    ) : null}
                  </p>
                  {item.description ? (
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {formatResidentOrderPrice(item.priceAmount, item.priceKind) ?? "Bez ceny"} ·{" "}
                    {locationLabel(item.locationIds)} · {item.companyName ?? "Bez firmy"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => openEdit(item)}>
                    Edytuj
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(item.id)}
                  >
                    Usuń
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <CommunityOrderCatalogItemDialog
        open={open}
        item={editing}
        buildings={buildings}
        pending={upsert.isPending}
        onOpenChange={setOpen}
        onSubmit={onSubmit}
      />
    </Card>
  );
}
