import { useEffect, useMemo, useState } from "react";
import { Headphones, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import type { PropertyDetail, PropertyAdminData } from "@/hooks/useProperties";
import { useUpdatePropertyAdminData } from "@/hooks/useProperties";
import { computeContractNetPln, type CommunityBoardMember } from "@/types/propertyAdminData";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

type Props = {
  property: PropertyDetail;
  isOwner: boolean;
};

function telHref(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : "#";
}

function parseOptionalNumber(raw: string): number | null {
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function PropertyGeneralInfoForm({ property, isOwner }: Props) {
  const save = useUpdatePropertyAdminData(property.id);
  const [draft, setDraft] = useState<PropertyAdminData>(property.adminData);

  useEffect(() => {
    setDraft(property.adminData);
  }, [property.id, property.adminData]);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(property.adminData),
    [draft, property.adminData],
  );

  const netPln = useMemo(() => computeContractNetPln(draft.finance), [draft.finance]);
  const netFormatted = useMemo(
    () =>
      new Intl.NumberFormat("pl-PL", {
        style: "currency",
        currency: "PLN",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(netPln),
    [netPln],
  );

  const canEdit = isOwner;
  const disabled = !canEdit || save.isPending;

  function setFinance<K extends keyof PropertyAdminData["finance"]>(key: K, value: PropertyAdminData["finance"][K]) {
    setDraft((d) => ({ ...d, finance: { ...d.finance, [key]: value } }));
  }

  function setFormal<K extends keyof PropertyAdminData["formal"]>(key: K, value: PropertyAdminData["formal"][K]) {
    setDraft((d) => ({ ...d, formal: { ...d.formal, [key]: value } }));
  }

  function setNotes<K extends keyof PropertyAdminData["notes"]>(key: K, value: PropertyAdminData["notes"][K]) {
    setDraft((d) => ({ ...d, notes: { ...d.notes, [key]: value } }));
  }

  function addBoardMember() {
    setDraft((d) => ({
      ...d,
      board: [
        ...d.board,
        { id: crypto.randomUUID(), fullName: "", role: "", phone: "" },
      ],
    }));
  }

  function updateBoardMember(id: string, patch: Partial<CommunityBoardMember>) {
    setDraft((d) => ({
      ...d,
      board: d.board.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));
  }

  function removeBoardMember(id: string) {
    setDraft((d) => ({ ...d, board: d.board.filter((m) => m.id !== id) }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit || !dirty) return;
    save.mutate(draft, {
      onSuccess: () => {
        toast.success("Zapisano informacje o nieruchomości.");
      },
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : "Nie udało się zapisać.";
        toast.error(msg);
      },
    });
  }

  function handleAiPlaceholder() {
    toast.info("Moduł wczytywania umów z PDF (AI) będzie dostępny wkrótce.");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Podstawowe</CardTitle>
          <CardDescription>
            Nazwa i adres pochodzą z rekordu nieruchomości i są współdzielone z innymi modułami — edycja wyłączona.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="prop-name-ro">Nazwa</Label>
            <Input id="prop-name-ro" value={property.name} readOnly disabled className="bg-muted/40" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="prop-addr-ro">Pełny adres</Label>
            <Input id="prop-addr-ro" value={property.address} readOnly disabled className="bg-muted/40" />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Finanse i umowa</CardTitle>
          <CardDescription>Stawki i powierzchnie wykorzystywane do szacowania wartości kontraktu (netto).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="usable-m2">Powierzchnia użytkowa (m²)</Label>
              <Input
                id="usable-m2"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={draft.finance.usableAreaM2 ?? ""}
                onChange={(e) => setFinance("usableAreaM2", parseOptionalNumber(e.target.value))}
                disabled={disabled}
                className={cn(!canEdit && "bg-muted/40")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="garage-m2">Powierzchnia garażu (m²)</Label>
              <Input
                id="garage-m2"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={draft.finance.garageAreaM2 ?? ""}
                onChange={(e) => setFinance("garageAreaM2", parseOptionalNumber(e.target.value))}
                disabled={disabled}
                className={cn(!canEdit && "bg-muted/40")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rate-usable">Wynagrodzenie za m² (pow. użytkowa)</Label>
              <Input
                id="rate-usable"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={draft.finance.rateUsablePerM2 ?? ""}
                onChange={(e) => setFinance("rateUsablePerM2", parseOptionalNumber(e.target.value))}
                disabled={disabled}
                className={cn(!canEdit && "bg-muted/40")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rate-garage">Wynagrodzenie za m² (garaż)</Label>
              <Input
                id="rate-garage"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={draft.finance.rateGaragePerM2 ?? ""}
                onChange={(e) => setFinance("rateGaragePerM2", parseOptionalNumber(e.target.value))}
                disabled={disabled}
                className={cn(!canEdit && "bg-muted/40")}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-border/80 bg-muted/15 p-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2 flex-1 min-w-0">
              <Label htmlFor="contract-date">Data umowy / aneksu</Label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  id="contract-date"
                  type="date"
                  value={draft.finance.contractAmendmentDate ?? ""}
                  onChange={(e) =>
                    setFinance("contractAmendmentDate", e.target.value === "" ? null : e.target.value)
                  }
                  disabled={disabled}
                  className={cn("sm:max-w-[200px]", !canEdit && "bg-muted/40")}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-2"
                  onClick={handleAiPlaceholder}
                  disabled={save.isPending}
                >
                  <Sparkles className="h-4 w-4" aria-hidden />
                  Wczytaj z PDF (AI) — Wkrótce
                </Button>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Wartość kontraktu netto (szac.)</p>
              <p className="text-lg font-semibold tabular-nums text-foreground">{netFormatted}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Dane formalne</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="community-name">Nazwa wspólnoty</Label>
            <Input
              id="community-name"
              value={draft.formal.communityName}
              onChange={(e) => setFormal("communityName", e.target.value)}
              disabled={disabled}
              className={cn(!canEdit && "bg-muted/40")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nip">NIP</Label>
            <Input
              id="nip"
              value={draft.formal.nip}
              onChange={(e) => setFormal("nip", e.target.value)}
              disabled={disabled}
              className={cn(!canEdit && "bg-muted/40")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="regon">REGON</Label>
            <Input
              id="regon"
              value={draft.formal.regon}
              onChange={(e) => setFormal("regon", e.target.value)}
              disabled={disabled}
              className={cn(!canEdit && "bg-muted/40")}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="flex flex-col gap-2 space-y-0 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Zarząd wspólnoty</CardTitle>
            <CardDescription>Osoby kontaktowe — możesz dodać wiele wpisów.</CardDescription>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={addBoardMember}
            disabled={disabled}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Dodaj osobę
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {draft.board.length === 0 ? (
            <p className="text-sm text-muted-foreground rounded-md border border-dashed p-4">Brak osób — użyj „Dodaj osobę”.</p>
          ) : (
            draft.board.map((m, idx) => (
              <div key={m.id}>
                {idx > 0 ? <Separator className="mb-4" /> : null}
                <div className="grid gap-3 md:grid-cols-12 md:items-end">
                  <div className="space-y-2 md:col-span-4">
                    <Label htmlFor={`board-name-${m.id}`}>Imię i nazwisko</Label>
                    <Input
                      id={`board-name-${m.id}`}
                      value={m.fullName}
                      onChange={(e) => updateBoardMember(m.id, { fullName: e.target.value })}
                      disabled={disabled}
                      className={cn(!canEdit && "bg-muted/40")}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-3">
                    <Label htmlFor={`board-role-${m.id}`}>Funkcja</Label>
                    <Input
                      id={`board-role-${m.id}`}
                      value={m.role}
                      onChange={(e) => updateBoardMember(m.id, { role: e.target.value })}
                      disabled={disabled}
                      className={cn(!canEdit && "bg-muted/40")}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-4">
                    <Label htmlFor={`board-phone-${m.id}`}>Telefon</Label>
                    <div className="flex gap-2">
                      <Input
                        id={`board-phone-${m.id}`}
                        value={m.phone}
                        onChange={(e) => updateBoardMember(m.id, { phone: e.target.value })}
                        disabled={disabled}
                        className={cn("min-w-0 flex-1", !canEdit && "bg-muted/40")}
                      />
                      {m.phone.trim() ? (
                        <Button type="button" variant="outline" size="icon" className="shrink-0" asChild>
                          <a href={telHref(m.phone)} aria-label="Zadzwoń">
                            <Headphones className="h-4 w-4" />
                          </a>
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="shrink-0"
                          disabled
                          aria-label="Brak numeru telefonu"
                        >
                          <Headphones className="h-4 w-4 opacity-40" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="flex md:col-span-1 md:justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => removeBoardMember(m.id)}
                      disabled={disabled}
                      aria-label="Usuń osobę"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Uwagi operacyjne</CardTitle>
          <CardDescription>Osobne kanały informacji dla administracji, sprzątania i serwisu.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="note-admin">Uwagi dla administracji</Label>
            <Textarea
              id="note-admin"
              rows={3}
              value={draft.notes.administration}
              onChange={(e) => setNotes("administration", e.target.value)}
              disabled={disabled}
              className={cn(!canEdit && "bg-muted/40")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="note-cleaning">Uwagi dla ekipy sprzątającej (Cleaning)</Label>
            <Textarea
              id="note-cleaning"
              rows={3}
              value={draft.notes.cleaning}
              onChange={(e) => setNotes("cleaning", e.target.value)}
              disabled={disabled}
              className={cn(!canEdit && "bg-muted/40")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="note-serwis">Uwagi dla techników (Serwis)</Label>
            <Textarea
              id="note-serwis"
              rows={3}
              value={draft.notes.serwis}
              onChange={(e) => setNotes("serwis", e.target.value)}
              disabled={disabled}
              className={cn(!canEdit && "bg-muted/40")}
            />
          </div>
        </CardContent>
      </Card>

      {!canEdit ? (
        <p className="text-xs text-muted-foreground">
          Edycja konfiguracji jest dostępna wyłącznie dla roli Właściciel (w przyszłości możliwe rozszerzenie uprawnień).
        </p>
      ) : (
        <div className="flex justify-end">
          <Button type="submit" disabled={!dirty || save.isPending} className="min-w-[140px] gap-2">
            {save.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Zapisywanie…
              </>
            ) : (
              "Zapisz zmiany"
            )}
          </Button>
        </div>
      )}
    </form>
  );
}
