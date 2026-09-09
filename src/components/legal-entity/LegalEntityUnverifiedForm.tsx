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
import { LEGAL_ENTITY_KIND_LABELS } from "@/lib/legalEntityMessages";
import type { LegalEntityKind } from "@/lib/legalEntityApi";

export type UnverifiedFormValues = {
  kind: LegalEntityKind;
  shortName: string;
  legalName: string;
  email: string;
  phone: string;
  city: string;
  postalCode: string;
  street: string;
  buildingNumber: string;
};

type LegalEntityUnverifiedFormProps = {
  allowedKinds: LegalEntityKind[];
  busy: boolean;
  initialKind: LegalEntityKind;
  onSubmit: (values: UnverifiedFormValues) => void;
  onCancel: () => void;
};

function formatPostal(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 5);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

export function LegalEntityUnverifiedForm({
  allowedKinds,
  busy,
  initialKind,
  onSubmit,
  onCancel,
}: LegalEntityUnverifiedFormProps) {
  const [kind, setKind] = React.useState<LegalEntityKind>(initialKind);
  const [shortName, setShortName] = React.useState("");
  const [legalName, setLegalName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [city, setCity] = React.useState("");
  const [postalCode, setPostalCode] = React.useState("");
  const [street, setStreet] = React.useState("");
  const [buildingNumber, setBuildingNumber] = React.useState("");

  const canSubmit =
    shortName.trim().length >= 3 &&
    legalName.trim().length >= 3 &&
    email.trim().length >= 5 &&
    phone.replace(/\D/g, "").length >= 9 &&
    city.trim().length >= 2 &&
    /^\d{2}-\d{3}$/.test(postalCode);

  return (
    <div className="grid gap-3 rounded-md border border-amber-300/80 bg-amber-50/60 p-3 dark:border-amber-800 dark:bg-amber-950/30">
      <p className="text-sm text-amber-900 dark:text-amber-200">
        Serwis GUS jest niedostępny. Uzupełnij dane ręcznie. Podmiot trafi do kolejki
        „Do sprawdzenia”.
      </p>
      <div className="grid gap-2">
        <Label>Rodzaj podmiotu</Label>
        <Select value={kind} onValueChange={(v) => setKind(v as LegalEntityKind)} disabled={busy}>
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
        <Label htmlFor="unverified-short">Nazwa skrócona</Label>
        <Input
          id="unverified-short"
          value={shortName}
          onChange={(e) => setShortName(e.target.value.slice(0, 80))}
          disabled={busy}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="unverified-legal">Pełna nazwa</Label>
        <Input
          id="unverified-legal"
          value={legalName}
          onChange={(e) => setLegalName(e.target.value.slice(0, 200))}
          disabled={busy}
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="unverified-email">E-mail</Label>
          <Input
            id="unverified-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="unverified-phone">Telefon</Label>
          <Input
            id="unverified-phone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={busy}
          />
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="unverified-city">Miasto</Label>
          <Input
            id="unverified-city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="unverified-postal">Kod pocztowy</Label>
          <Input
            id="unverified-postal"
            inputMode="numeric"
            placeholder="00-000"
            value={postalCode}
            onChange={(e) => setPostalCode(formatPostal(e.target.value))}
            disabled={busy}
          />
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="unverified-street">Ulica (opcjonalnie)</Label>
          <Input
            id="unverified-street"
            value={street}
            onChange={(e) => setStreet(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="unverified-building">Nr budynku (opcjonalnie)</Label>
          <Input
            id="unverified-building"
            value={buildingNumber}
            onChange={(e) => setBuildingNumber(e.target.value)}
            disabled={busy}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() =>
            onSubmit({
              kind,
              shortName: shortName.trim(),
              legalName: legalName.trim(),
              email: email.trim(),
              phone: phone.trim(),
              city: city.trim(),
              postalCode,
              street: street.trim(),
              buildingNumber: buildingNumber.trim(),
            })
          }
          disabled={busy || !canSubmit}
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Dodaj bez weryfikacji GUS
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Anuluj
        </Button>
      </div>
    </div>
  );
}
