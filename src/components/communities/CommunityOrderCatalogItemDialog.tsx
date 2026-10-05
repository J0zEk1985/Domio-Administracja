import { useEffect, useState, type FormEvent } from "react";

import { CatalogItemBuildingsField } from "@/components/communities/CatalogItemBuildingsField";
import { OrderEmailTemplateFields } from "@/components/communities/OrderEmailTemplateFields";
import { CompanyComboBox } from "@/components/companies/CompanyComboBox";
import { Button } from "@/components/ui/button";
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
  RESIDENT_ORDER_SIMPLE_BODY,
  RESIDENT_ORDER_SIMPLE_SUBJECT,
  residentOrderTemplateToFriendly,
  residentOrderTemplateToTechnical,
} from "@/lib/residentOrderTemplateTokens";
import type { ResidentOrderCatalogItem, ResidentOrderPriceKind } from "@/types/residentOrders";

export type CatalogItemDraft = {
  name: string;
  description: string | null;
  priceAmount: number | null;
  priceKind: ResidentOrderPriceKind | null;
  isActive: boolean;
  locationIds: string[];
  companyId: string;
  emailSubjectTemplate: string;
  emailBodyTemplate: string;
};

type FormState = {
  name: string;
  description: string;
  priceInput: string;
  priceKind: ResidentOrderPriceKind;
  hasPrice: boolean;
  isActive: boolean;
  locationIds: string[];
  companyId: string;
  subject: string;
  body: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  priceInput: "",
  priceKind: "exact",
  hasPrice: false,
  isActive: true,
  locationIds: [],
  companyId: "",
  subject: RESIDENT_ORDER_SIMPLE_SUBJECT,
  body: RESIDENT_ORDER_SIMPLE_BODY,
};

function itemToForm(item: ResidentOrderCatalogItem | null): FormState {
  if (!item) return EMPTY_FORM;
  const subjectSource = item.emailSubjectTemplate.trim()
    ? item.emailSubjectTemplate
    : residentOrderTemplateToTechnical(RESIDENT_ORDER_SIMPLE_SUBJECT);
  const bodySource = item.emailBodyTemplate.trim()
    ? item.emailBodyTemplate
    : residentOrderTemplateToTechnical(RESIDENT_ORDER_SIMPLE_BODY);
  return {
    name: item.name,
    description: item.description ?? "",
    priceInput: item.priceAmount != null ? String(item.priceAmount) : "",
    priceKind: item.priceKind ?? "exact",
    hasPrice: item.priceAmount != null,
    isActive: item.isActive,
    locationIds: item.locationIds,
    companyId: item.companyId ?? "",
    subject: residentOrderTemplateToFriendly(subjectSource),
    body: residentOrderTemplateToFriendly(bodySource),
  };
}

type Props = {
  open: boolean;
  item: ResidentOrderCatalogItem | null;
  buildings: CommunityLocationRow[];
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (draft: CatalogItemDraft) => void;
};

export function CommunityOrderCatalogItemDialog({
  open,
  item,
  buildings,
  pending,
  onOpenChange,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const itemKey = item?.id ?? "new";

  useEffect(() => {
    if (!open) return;
    setForm(itemToForm(item));
    // Reload the form when the dialog opens or the edited row changes, not on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, itemKey]);

  const canSave = form.name.trim().length >= 2 && form.companyId.trim().length > 0 && !pending;

  function toggleLocation(id: string) {
    setForm((prev) => ({
      ...prev,
      locationIds: prev.locationIds.includes(id)
        ? prev.locationIds.filter((value) => value !== id)
        : [...prev.locationIds, id],
    }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const name = form.name.trim();
    if (name.length < 2 || form.companyId.trim().length === 0) return;

    let priceAmount: number | null = null;
    let priceKind: ResidentOrderPriceKind | null = null;
    if (form.hasPrice) {
      const amount = Number(form.priceInput.trim().replace(",", "."));
      if (!Number.isFinite(amount) || amount < 0) return;
      priceAmount = amount;
      priceKind = form.priceKind;
    }

    const subject = residentOrderTemplateToTechnical(form.subject).trim();
    const body = residentOrderTemplateToTechnical(form.body).trim();
    if (subject.length === 0 || body.length === 0) return;

    onSubmit({
      name,
      description: form.description.trim() || null,
      priceAmount,
      priceKind,
      isActive: form.isActive,
      locationIds: form.locationIds,
      companyId: form.companyId,
      emailSubjectTemplate: subject,
      emailBodyTemplate: body,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{item ? "Edytuj pozycję" : "Nowa pozycja"}</DialogTitle>
            <DialogDescription>
              Nazwa jest widoczna dla mieszkańca w aplikacji Home. Firma i treść maila dotyczą tylko tej pozycji.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">Nazwa</Label>
            <Input
              id="cat-name"
              value={form.name}
              onChange={(ev) => setForm((prev) => ({ ...prev, name: ev.target.value }))}
              placeholder="np. Pilot do bramy, Klucz do klatki, Pastylka interkomu"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-desc">Opis (opcjonalnie)</Label>
            <Textarea
              id="cat-desc"
              value={form.description}
              onChange={(ev) => setForm((prev) => ({ ...prev, description: ev.target.value }))}
              rows={3}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="cat-price"
              checked={form.hasPrice}
              onCheckedChange={(checked) => setForm((prev) => ({ ...prev, hasPrice: checked }))}
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
                  onChange={(ev) => setForm((prev) => ({ ...prev, priceInput: ev.target.value }))}
                  placeholder="np. 80"
                  required
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
                      onChange={() => setForm((prev) => ({ ...prev, priceKind: "exact" }))}
                    />
                    Dokładna
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="price-kind"
                      checked={form.priceKind === "approximate"}
                      onChange={() => setForm((prev) => ({ ...prev, priceKind: "approximate" }))}
                    />
                    Orientacyjna
                  </label>
                </div>
              </div>
            </div>
          ) : null}
          <CatalogItemBuildingsField
            buildings={buildings}
            locationIds={form.locationIds}
            onToggle={toggleLocation}
          />
          <div className="flex items-center gap-2">
            <Switch
              id="cat-active"
              checked={form.isActive}
              onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isActive: checked }))}
            />
            <Label htmlFor="cat-active">Widoczna w Home</Label>
          </div>
          <div className="space-y-1.5">
            <Label>Firma realizująca zamówienie</Label>
            <CompanyComboBox
              value={form.companyId}
              onChange={(companyId) => setForm((prev) => ({ ...prev, companyId }))}
            />
          </div>
          <OrderEmailTemplateFields
            subject={form.subject}
            body={form.body}
            onSubjectChange={(subject) => setForm((prev) => ({ ...prev, subject }))}
            onBodyChange={(body) => setForm((prev) => ({ ...prev, body }))}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Anuluj
            </Button>
            <Button type="submit" disabled={!canSave}>
              {pending ? "Zapisywanie…" : "Zapisz"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
