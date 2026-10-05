import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

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
import { toast } from "@/components/ui/sonner";
import { useAddPropertyResident, type PropertyUnitRow } from "@/hooks/usePropertyResidents";
import { parseAddResidentForm } from "@/lib/addResidentForm";

type AddResidentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locationId: string;
  units: readonly PropertyUnitRow[];
};

export function AddResidentDialog({ open, onOpenChange, locationId, units }: AddResidentDialogProps) {
  const addResident = useAddPropertyResident(locationId);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [unitNumber, setUnitNumber] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const residentialUnits = useMemo(
    () => units.filter((unit) => unit.kind === "residential"),
    [units]
  );

  const parsed = parseAddResidentForm({ fullName, email, unitNumber }, units);
  const unitHint =
    parsed.ok && parsed.willCreateUnit
      ? `Lokal ${parsed.unitNumber} nie jest w rejestrze — zostanie utworzony.`
      : parsed.ok
        ? `Mieszkaniec zostanie przypisany do lokalu ${parsed.unitNumber}.`
        : null;

  const reset = () => {
    setFullName("");
    setEmail("");
    setUnitNumber("");
    setFormError(null);
  };

  const onSave = () => {
    if (!parsed.ok) {
      setFormError(parsed.error);
      return;
    }
    setFormError(null);
    addResident.mutate(
      { email: parsed.email, fullName: parsed.fullName, unitNumber: parsed.unitNumber },
      {
        onSuccess: (result) => {
          const row = result[0];
          if (!row || row.status === "error") {
            setFormError(row?.message ?? "Nie udało się dodać mieszkańca.");
            toast.error(row?.message ?? "Nie udało się dodać mieszkańca.");
            return;
          }
          toast.success(row.message);
          onOpenChange(false);
          reset();
        },
        onError: (error) => {
          const message = error instanceof Error ? error.message : "Nie udało się dodać mieszkańca.";
          setFormError(message);
          toast.error(message);
        },
      }
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dodaj mieszkańca</DialogTitle>
          <DialogDescription>
            Wpisz dane i numer lokalu. Brakujący lokal mieszkalny zostanie utworzony automatycznie.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="add-resident-name">Imię i nazwisko</Label>
            <Input
              id="add-resident-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              autoComplete="name"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="add-resident-email">E-mail</Label>
            <Input
              id="add-resident-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="add-resident-unit">Lokal</Label>
            <Input
              id="add-resident-unit"
              list="add-resident-unit-options"
              value={unitNumber}
              placeholder="np. 12"
              onChange={(event) => setUnitNumber(event.target.value)}
            />
            <datalist id="add-resident-unit-options">
              {residentialUnits.map((unit) => (
                <option key={unit.id} value={unit.unitNumber} />
              ))}
            </datalist>
            {unitHint ? <p className="text-xs text-muted-foreground">{unitHint}</p> : null}
          </div>
          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Anuluj
          </Button>
          <Button type="button" disabled={addResident.isPending} onClick={onSave}>
            {addResident.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Dodaj
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
