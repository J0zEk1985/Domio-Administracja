import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PropertyDetail } from "@/hooks/useProperties";
import { useUpdatePropertyGeneral } from "@/hooks/useProperties";
import { propertyLocationFormSchema } from "@/schemas/locationSchema";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { CommunityCombobox } from "@/components/communities/CommunityCombobox";

type Props = {
  property: PropertyDetail;
  isOwner: boolean;
};

function normalizeCkobBuildingId(value: string | null | undefined): string | null {
  const t = (value ?? "").trim();
  return t.length > 0 ? t : null;
}

function parseOptionalCoord(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function formatCoord(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  return String(n);
}

export function PropertyGeneralInfoForm({ property, isOwner }: Props) {
  const save = useUpdatePropertyGeneral(property.id);
  const integrationsCardRef = useRef<HTMLDivElement>(null);
  const ckobInputRef = useRef<HTMLInputElement>(null);
  const [nameDraft, setNameDraft] = useState(property.name === "—" ? "" : property.name);
  const [latDraft, setLatDraft] = useState(() => formatCoord(property.latitude));
  const [lngDraft, setLngDraft] = useState(() => formatCoord(property.longitude));
  const [ckobDraft, setCkobDraft] = useState(() => property.cKobBuildingId ?? "");
  const [communityId, setCommunityId] = useState<string | null>(property.communityId ?? null);

  useEffect(() => {
    setNameDraft(property.name === "—" ? "" : property.name);
  }, [property.id, property.name]);

  useEffect(() => {
    setLatDraft(formatCoord(property.latitude));
    setLngDraft(formatCoord(property.longitude));
  }, [property.id, property.latitude, property.longitude]);

  useEffect(() => {
    setCkobDraft(property.cKobBuildingId ?? "");
  }, [property.id, property.cKobBuildingId]);

  useEffect(() => {
    setCommunityId(property.communityId ?? null);
  }, [property.id, property.communityId]);

  const ckobDirty = useMemo(
    () => normalizeCkobBuildingId(ckobDraft) !== normalizeCkobBuildingId(property.cKobBuildingId),
    [ckobDraft, property.cKobBuildingId],
  );

  const communityDirty = useMemo(
    () => communityId !== (property.communityId ?? null),
    [communityId, property.communityId],
  );

  const nameDirty = useMemo(() => {
    const trimmed = nameDraft.trim();
    const prev = property.name === "—" ? "" : property.name.trim();
    return trimmed !== prev;
  }, [nameDraft, property.name]);

  const coordsDirty = useMemo(() => {
    const lat = parseOptionalCoord(latDraft);
    const lng = parseOptionalCoord(lngDraft);
    return lat !== property.latitude || lng !== property.longitude;
  }, [latDraft, lngDraft, property.latitude, property.longitude]);

  const dirty = useMemo(
    () => nameDirty || coordsDirty || ckobDirty || communityDirty,
    [nameDirty, coordsDirty, ckobDirty, communityDirty],
  );

  const canEdit = isOwner;
  const disabled = !canEdit || save.isPending;

  const storedCkobDisplay = property.cKobBuildingId?.trim() ?? "";
  const hasStoredCkob = storedCkobDisplay.length > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit || !dirty) return;
    const nameTrimmed = nameDraft.trim();
    if (nameTrimmed.length === 0) {
      toast.error("Podaj nazwę budynku.");
      return;
    }
    const latParsed = parseOptionalCoord(latDraft);
    const lngParsed = parseOptionalCoord(lngDraft);
    if (latDraft.trim() !== "" && latParsed === null) {
      toast.error("Niepoprawna szerokość geograficzna.");
      return;
    }
    if (lngDraft.trim() !== "" && lngParsed === null) {
      toast.error("Niepoprawna długość geograficzna.");
      return;
    }
    const ckobParsed = propertyLocationFormSchema.safeParse({ c_kob_building_id: ckobDraft });
    if (!ckobParsed.success) {
      const msg =
        ckobParsed.error.flatten().fieldErrors.c_kob_building_id?.[0] ?? "Niepoprawne ID c-KOB.";
      toast.error(msg);
      return;
    }
    save.mutate(
      {
        name: nameTrimmed,
        latitude: latParsed,
        longitude: lngParsed,
        cKobBuildingId: ckobParsed.data.cKobBuildingId,
        communityId,
      },
      {
        onSuccess: () => {
          toast.success("Zapisano informacje o nieruchomości.");
        },
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Budynek</CardTitle>
          <CardDescription>
            Adres jest współdzielony z innymi modułami — edycja adresu wyłączona. Nazwa fizyczna, GPS i powiązanie ze
            wspólnotą możliwe do zmiany poniżej.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="prop-name">Nazwa fizyczna</Label>
            <Input
              id="prop-name"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              readOnly={!canEdit}
              disabled={disabled}
              className={cn(!canEdit && "bg-muted/40")}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="prop-addr-ro">Pełny adres</Label>
            <Input id="prop-addr-ro" value={property.address} readOnly disabled className="bg-muted/40" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prop-lat">Szerokość GPS</Label>
            <Input
              id="prop-lat"
              inputMode="decimal"
              value={latDraft}
              onChange={(e) => setLatDraft(e.target.value)}
              disabled={disabled}
              placeholder="np. 52.2297"
              className={cn(!canEdit && "bg-muted/40")}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prop-lng">Długość GPS</Label>
            <Input
              id="prop-lng"
              inputMode="decimal"
              value={lngDraft}
              onChange={(e) => setLngDraft(e.target.value)}
              disabled={disabled}
              placeholder="np. 21.0122"
              className={cn(!canEdit && "bg-muted/40")}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Wspólnota (opcjonalnie)</Label>
            <CommunityCombobox
              orgId={property.orgId}
              value={communityId}
              onValueChange={setCommunityId}
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">
              Dane formalne, finanse, kody i zarząd edytujesz w widoku wspólnoty — po powiązaniu budynku z rekordem
              wspólnoty.
            </p>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="prop-ckob-summary">ID Książki Obiektu (c-KOB)</Label>
            {hasStoredCkob ? (
              <div className="flex flex-wrap items-center gap-2">
                <code
                  id="prop-ckob-summary"
                  className="max-w-full break-all rounded-md border border-border/80 bg-muted/30 px-2 py-1.5 text-sm font-mono text-foreground"
                >
                  {storedCkobDisplay}
                </code>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  aria-label="Skopiuj ID c-KOB do schowka"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(storedCkobDisplay);
                      toast.success("Skopiowano do schowka.");
                    } catch (err) {
                      console.error("[PropertyGeneralInfoForm] clipboard:", err);
                      toast.error("Nie udało się skopiować do schowka.");
                    }
                  }}
                >
                  <Copy className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span id="prop-ckob-summary">Brak przypisanego ID c-KOB</span>
                {canEdit ? (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-muted-foreground underline-offset-4 hover:text-foreground"
                    onClick={() => {
                      integrationsCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                      window.setTimeout(() => ckobInputRef.current?.focus(), 350);
                    }}
                  >
                    Uzupełnij
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card
        ref={integrationsCardRef}
        id="property-integrations-ckob"
        className="border-border/60 shadow-sm scroll-mt-4"
      >
        <CardHeader>
          <CardTitle className="text-base">Integracje zewnętrzne</CardTitle>
          <CardDescription>Połączenia z systemami zewnętrznymi używane przy synchronizacji danych.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-w-xl">
            <Label htmlFor="ckob-building-id">ID Książki Obiektu w c-KOB</Label>
            <Input
              ref={ckobInputRef}
              id="ckob-building-id"
              value={ckobDraft}
              onChange={(e) => setCkobDraft(e.target.value)}
              disabled={disabled}
              autoComplete="off"
              placeholder="Wklej identyfikator z systemu c-KOB"
              className={cn(!canEdit && "bg-muted/40")}
            />
            <p className="text-sm text-muted-foreground">
              Unikalny identyfikator obiektu skopiowany z państwowego systemu c-KOB. Niezbędny do synchronizacji
              przeglądów.
            </p>
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
