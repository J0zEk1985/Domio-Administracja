import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createLegalEntityFromGus,
  enrollLegalEntity,
  lookupLegalEntity,
  LegalEntityApiError,
  type GusPreview,
  type LegalEntityKind,
  type LegalEntityPublic,
} from "@/lib/legalEntityApi";
import {
  LEGAL_ENTITY_KIND_LABELS,
  legalEntityErrorMessage,
} from "@/lib/legalEntityMessages";

export type LegalEntityModuleFlags = {
  isCleaning?: boolean;
  isMaintenance?: boolean;
  isAdmin?: boolean;
};

export interface LegalEntityNipFieldProps {
  orgId: string;
  value: LegalEntityPublic | null;
  onChange: (entity: LegalEntityPublic | null) => void;
  allowedKinds: LegalEntityKind[];
  flags: LegalEntityModuleFlags;
  required?: boolean;
  disabled?: boolean;
  optionalHint?: string;
}

function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 10);
}

function kindAllowed(kind: string, allowed: LegalEntityKind[]): kind is LegalEntityKind {
  return allowed.includes(kind as LegalEntityKind);
}

export function LegalEntityNipField({
  orgId,
  value,
  onChange,
  allowedKinds,
  flags,
  required = false,
  disabled = false,
  optionalHint,
}: LegalEntityNipFieldProps) {
  const [nip, setNip] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [gus, setGus] = React.useState<GusPreview | null>(null);
  const [kind, setKind] = React.useState<LegalEntityKind>(allowedKinds[0] ?? "company");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [shortName, setShortName] = React.useState("");

  React.useEffect(() => {
    if (value) {
      setNip(value.nip);
      setGus(null);
      setMessage(null);
    }
  }, [value]);

  const clearSelection = () => {
    onChange(null);
    setGus(null);
    setMessage(null);
  };

  const handleLookup = async () => {
    setBusy(true);
    setMessage(null);
    setGus(null);
    try {
      const result = await lookupLegalEntity(orgId, nip);
      if (result.status === "invalid_nip") {
        setMessage(legalEntityErrorMessage("invalid_nip"));
        return;
      }
      if (result.status === "exists_in_domio" && result.entity) {
        if (!kindAllowed(result.entity.kind, allowedKinds)) {
          setMessage(
            `Ten NIP należy do podmiotu typu „${LEGAL_ENTITY_KIND_LABELS[result.entity.kind]}”, który nie pasuje do tego formularza.`,
          );
          return;
        }
        if (!result.alreadyEnrolledInThisOrg) {
          const enrolled = await enrollLegalEntity({
            orgId,
            legalEntityId: result.entity.id,
            ...flags,
          });
          onChange(enrolled.entity);
        } else {
          onChange(result.entity);
        }
        setGus(null);
        return;
      }
      if (result.status === "found_in_gus" && result.gusPreview) {
        setGus(result.gusPreview);
        const suggested = result.suggestedKind;
        if (suggested && kindAllowed(suggested, allowedKinds)) {
          setKind(suggested);
        }
        setShortName(result.gusPreview.legalName.slice(0, 80));
        return;
      }
      setMessage(legalEntityErrorMessage(result.status));
    } catch (err) {
      console.error("[LegalEntityNipField] lookup:", err);
      setMessage(err instanceof LegalEntityApiError ? err.message : legalEntityErrorMessage("RPC_FAILED"));
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async () => {
    if (!gus) return;
    setBusy(true);
    setMessage(null);
    try {
      const created = await createLegalEntityFromGus({
        orgId,
        nip: gus.nip,
        kind,
        email,
        phone,
        shortName,
        ...flags,
      });
      onChange(created.entity);
      setGus(null);
    } catch (err) {
      console.error("[LegalEntityNipField] create:", err);
      setMessage(err instanceof LegalEntityApiError ? err.message : legalEntityErrorMessage("RPC_FAILED"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <Label htmlFor="legal-entity-nip">NIP {required ? "" : "(opcjonalnie)"}</Label>
        <div className="flex gap-2">
          <Input
            id="legal-entity-nip"
            inputMode="numeric"
            autoComplete="off"
            placeholder="10 cyfr"
            value={nip}
            disabled={disabled || busy || Boolean(value)}
            onChange={(e) => setNip(digitsOnly(e.target.value))}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={disabled || busy || nip.length !== 10 || Boolean(value)}
            onClick={() => void handleLookup()}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sprawdź NIP"}
          </Button>
        </div>
        {!required && optionalHint ? (
          <p className="text-xs text-muted-foreground">{optionalHint}</p>
        ) : null}
      </div>

      {value ? (
        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <p className="font-medium">{value.shortName}</p>
          <p className="text-muted-foreground">{value.legalName}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {LEGAL_ENTITY_KIND_LABELS[value.kind]} · NIP {value.nip}
          </p>
          <p className="text-xs text-muted-foreground">{value.seatFullAddress}</p>
          <Button type="button" variant="ghost" size="sm" className="mt-2 h-8 px-2" onClick={clearSelection} disabled={disabled}>
            Wyczyść
          </Button>
        </div>
      ) : null}

      {gus && !value ? (
        <div className="grid gap-3 rounded-md border p-3">
          <div className="text-sm">
            <p className="font-medium">{gus.legalName}</p>
            <p className="text-xs text-muted-foreground mt-1">{gus.seatFullAddress}</p>
            <p className="text-xs text-muted-foreground">REGON {gus.regon ?? "—"}</p>
          </div>
          <div className="grid gap-2">
            <Label>Rodzaj podmiotu</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as LegalEntityKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allowedKinds.map((k) => (
                  <SelectItem key={k} value={k}>
                    {LEGAL_ENTITY_KIND_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="legal-entity-short">Nazwa skrócona</Label>
            <Input
              id="legal-entity-short"
              value={shortName}
              onChange={(e) => setShortName(e.target.value.slice(0, 80))}
              disabled={busy}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="legal-entity-email">E-mail kontaktowy</Label>
            <Input
              id="legal-entity-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="legal-entity-phone">Telefon</Label>
            <Input
              id="legal-entity-phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={busy}
            />
          </div>
          <Button type="button" onClick={() => void handleCreate()} disabled={busy || email.trim().length < 5 || phone.replace(/\D/g, "").length < 9}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Dodaj do Domio
          </Button>
        </div>
      ) : null}

      {message ? <p className="text-sm text-destructive">{message}</p> : null}
    </div>
  );
}
