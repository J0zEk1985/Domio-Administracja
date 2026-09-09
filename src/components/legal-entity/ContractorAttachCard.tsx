import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LegalEntityNipField, type LegalEntityModuleFlags } from "@/components/legal-entity/LegalEntityNipField";
import {
  attachLegalEntityToBuilding,
  fetchAttachedLegalEntity,
  LegalEntityApiError,
  type LegalEntityKind,
  type LegalEntityPublic,
} from "@/lib/legalEntityApi";
import { LEGAL_ENTITY_KIND_LABELS } from "@/lib/legalEntityMessages";

type ContractorAttachCardProps = {
  orgId: string;
  cleaningLocationId: string;
  flags: LegalEntityModuleFlags;
  allowedKinds: LegalEntityKind[];
  onAttached?: () => void;
};

export function ContractorAttachCard({
  orgId,
  cleaningLocationId,
  flags,
  allowedKinds,
  onAttached,
}: ContractorAttachCardProps) {
  const [attached, setAttached] = useState<LegalEntityPublic | null>(null);
  const [draft, setDraft] = useState<LegalEntityPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAttachedLegalEntity(cleaningLocationId)
      .then((row) => {
        if (!cancelled) setAttached(row);
      })
      .catch((err) => {
        console.error("[ContractorAttachCard]", err);
        if (!cancelled) setError("Nie udało się wczytać kontrahenta.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cleaningLocationId]);

  const handleAttach = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      await attachLegalEntityToBuilding({
        orgId,
        cleaningLocationId,
        legalEntityId: draft.id,
      });
      setAttached(draft);
      setDraft(null);
      onAttached?.();
    } catch (err) {
      console.error("[ContractorAttachCard] attach:", err);
      setError(err instanceof LegalEntityApiError ? err.message : "Nie udało się dopiąć podmiotu.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Podmiot (Wspólnota / kontrahent)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Ładowanie…
          </div>
        ) : attached ? (
          <div className="text-sm">
            <p className="font-medium">{attached.shortName || attached.legalName}</p>
            <p className="text-muted-foreground">{attached.legalName}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {LEGAL_ENTITY_KIND_LABELS[attached.kind] ?? attached.kind} · NIP {attached.nip}
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Rekomendujemy dopięcie podmiotu, na rzecz którego świadczysz usługę. Adres bez
              Wspólnoty jest dozwolony (np. kamienica osoby prywatnej).
            </p>
            <LegalEntityNipField
              orgId={orgId}
              value={draft}
              onChange={setDraft}
              allowedKinds={allowedKinds}
              flags={flags}
              optionalHint="Możesz pominąć ten krok i wrócić do niego później."
            />
            <Button type="button" onClick={() => void handleAttach()} disabled={!draft || saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Dopnij podmiot
            </Button>
          </>
        )}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
