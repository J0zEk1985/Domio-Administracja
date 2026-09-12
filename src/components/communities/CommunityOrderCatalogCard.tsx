import { useMemo, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { CommunityLocationRow } from "@/hooks/useProperties";
import {
  useDeleteResidentOrderCatalogItem,
  useResidentOrderCatalog,
  useUpsertResidentOrderCatalogItem,
} from "@/hooks/useResidentOrders";
import { formatResidentOrderPrice, type ResidentOrderCatalogItem, type ResidentOrderPriceKind } from "@/types/residentOrders";

type CatalogFormState = {
  name: string;
  description: string;
  priceInput: string;
  priceKind: ResidentOrderPriceKind;
  hasPrice: boolean;
  isActive: boolean;
  locationIds: string[];
};

const EMPTY_FORM: CatalogFormState = {
  name: "",
  description: "",
  priceInput: "",
  priceKind: "exact",
  hasPrice: false,
  isActive: true,
  locationIds: [],
};

function itemToForm(item: ResidentOrderCatalogItem | null): CatalogFormState {
  if (!item) return EMPTY_FORM;
  return {
    name: item.name,
    description: item.description ?? "",
    priceInput: item.priceAmount != null ? String(item.priceAmount) : "",
    priceKind: item.priceKind ?? "exact",
    hasPrice: item.priceAmount != null,
    isActive: item.isActive,
    locationIds: item.locationIds,
  };
}

type Props = {
  communityId: string;
  orgId: string;
  buildings: CommunityLocationRow[];
};

export function CommunityOrderCatalogCard({ communityId, orgId, buildings }: Props) {
  const catalogQuery = useResidentOrderCatalog(communityId);
  const upsert = useUpsertResidentOrderCatalogItem(communityId);
  const remove = useDeleteResidentOrderCatalogItem(communityId);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ResidentOrderCatalogItem | null>(null);
  const [form, setForm] = useState<CatalogFormState>(EMPTY_FORM);

  const items = catalogQuery.data ?? [];

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  }

  function openEdit(item: ResidentOrderCatalogItem) {
    setEditing(item);
    setForm(itemToForm(item));
    setOpen(true);
  }

  const locationLabel = useMemo(() => {
    const map = new Map(buildings.map((b) => [b.id, b.name]));
    return (ids: string[]) => {
      if (ids.length === 0) return "Wszystkie budynki";
      return ids.map((id) => map.get(id) ?? id).join(", ");
    };
  }, [buildings]);

  function toggleLocation(id: string) {
    setForm((prev) => ({
      ...prev,
      locationIds: prev.locationIds.includes(id)
        ? prev.locationIds.filter((x) => x !== id)
        : [...prev.locationIds, id],
    }));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const name = form.name.trim();
    if (name.length < 2) return;

    let priceAmount: number | null = null;
    let priceKind: ResidentOrderPriceKind | null = null;
    if (form.hasPrice) {
      const n = Number(form.priceInput.trim().replace(",", "."));
      if (!Number.isFinite(n) || n < 0) return;
      priceAmount = n;
      priceKind = form.priceKind;
    }

    upsert.mutate(
      {
        communityId,
        orgId,
        name,
        description: form.description.trim() || null,
        priceAmount,
        priceKind,
        isActive: form.isActive,
        locationIds: form.locationIds,
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
            Lista startuje pusta. Dodajesz i edytujesz pozycje (piloty, klucze, pastylki). Mieszkańcy w Home widzą tylko
            aktywne rzeczy.
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
                    {locationLabel(item.locationIds)}
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={onSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{editing ? "Edytuj pozycję" : "Nowa pozycja"}</DialogTitle>
              <DialogDescription>Nazwa jest widoczna dla mieszkańca w aplikacji Home.</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="cat-name">Nazwa</Label>
              <Input
                id="cat-name"
                value={form.name}
                onChange={(ev) => setForm((p) => ({ ...p, name: ev.target.value }))}
                placeholder="np. Pilot do bramy, Klucz do klatki, Pastylka interkomu"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-desc">Opis (opcjonalnie)</Label>
              <Textarea
                id="cat-desc"
                value={form.description}
                onChange={(ev) => setForm((p) => ({ ...p, description: ev.target.value }))}
                rows={3}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="cat-price"
                checked={form.hasPrice}
                onCheckedChange={(checked) => setForm((p) => ({ ...p, hasPrice: checked }))}
              />
              <Label htmlFor="cat-price">Podaj cenę (dokładną lub orientacyjną)</Label>
            </div>
            {form.hasPrice ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="cat-amount">Kwota (zł)</Label>
                  <Input
                    id="cat-amount"
                    inputMode="decimal"
                    value={form.priceInput}
                    onChange={(ev) => setForm((p) => ({ ...p, priceInput: ev.target.value }))}
                    placeholder="np. 80"
                    required={form.hasPrice}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Rodzaj</Label>
                  <div className="flex h-10 items-center gap-4 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="price-kind"
                        checked={form.priceKind === "exact"}
                        onChange={() => setForm((p) => ({ ...p, priceKind: "exact" }))}
                      />
                      Dokładna
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="price-kind"
                        checked={form.priceKind === "approximate"}
                        onChange={() => setForm((p) => ({ ...p, priceKind: "approximate" }))}
                      />
                      Orientacyjna
                    </label>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label>Budynki (puste = cała wspólnota)</Label>
              {buildings.length === 0 ? (
                <p className="text-xs text-muted-foreground">Brak budynków przypisanych do wspólnoty.</p>
              ) : (
                <ul className="max-h-40 space-y-2 overflow-y-auto rounded-md border border-border/60 p-2">
                  {buildings.map((b) => (
                    <li key={b.id} className="flex items-start gap-2">
                      <Checkbox
                        id={`cat-loc-${b.id}`}
                        checked={form.locationIds.includes(b.id)}
                        onCheckedChange={() => toggleLocation(b.id)}
                      />
                      <Label htmlFor={`cat-loc-${b.id}`} className="cursor-pointer font-normal leading-snug">
                        {b.name}
                        <span className="block text-xs text-muted-foreground">{b.address}</span>
                      </Label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="cat-active"
                checked={form.isActive}
                onCheckedChange={(checked) => setForm((p) => ({ ...p, isActive: checked }))}
              />
              <Label htmlFor="cat-active">Widoczna w Home</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Anuluj
              </Button>
              <Button type="submit" disabled={upsert.isPending || form.name.trim().length < 2}>
                {upsert.isPending ? "Zapisywanie…" : "Zapisz"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
