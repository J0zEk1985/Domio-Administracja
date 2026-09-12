import * as React from "react";
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
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { LegalEntityNipField } from "@/components/legal-entity/LegalEntityNipField";
import {
  GooglePlacesAddressInput,
  type PlaceData,
} from "@/components/property/GooglePlacesAddressInput";
import { enrollAdminLocation } from "@/lib/enrollAdminLocation";
import { LegalEntityApiError, type LegalEntityPublic } from "@/lib/legalEntityApi";
import { COMPANY_KINDS, HOUSING_KINDS } from "@/lib/legalEntityMessages";

export interface AddBuildingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  onSuccess: (cleaningLocationId: string) => void;
}

export function AddBuildingDialog({
  open,
  onOpenChange,
  orgId,
  onSuccess,
}: AddBuildingDialogProps) {
  const [address, setAddress] = React.useState("");
  const [googlePlaceId, setGooglePlaceId] = React.useState<string | null>(null);
  const [lat, setLat] = React.useState<number | null>(null);
  const [lng, setLng] = React.useState<number | null>(null);
  const [contractor, setContractor] = React.useState<LegalEntityPublic | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setAddress("");
      setGooglePlaceId(null);
      setLat(null);
      setLng(null);
      setContractor(null);
    }
  }, [open]);

  const handlePlaceSelect = React.useCallback((data: PlaceData) => {
    setAddress(data.address);
    setGooglePlaceId(data.google_place_id);
    setLat(data.latitude);
    setLng(data.longitude);
  }, []);

  const handleSubmit = async () => {
    if (!address.trim()) {
      toast.error("Adres jest wymagany");
      return;
    }
    if (!googlePlaceId) {
      toast.error("Wybierz adres z podpowiedzi Google Places");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await enrollAdminLocation({
        orgId,
        address: address.trim(),
        googlePlaceId,
        latitude: lat,
        longitude: lng,
        legalEntityId: contractor?.id ?? null,
      });

      if (result.status === "duplicate") {
        toast.error("Ten adres jest już w module Administracja.");
        return;
      }

      toast.success(
        result.status === "enrolled" ? "Budynek dodany do Administracji" : "Budynek dodany",
      );
      if (result.contractorRecommended) {
        toast.info("Rekomendujemy dopięcie Wspólnoty lub firmy w karcie budynku.");
      }
      onOpenChange(false);
      onSuccess(result.cleaningLocationId);
    } catch (e) {
      console.error("[AddBuildingDialog]", e);
      const msg =
        e instanceof LegalEntityApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Nie udało się dodać budynku.";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        onPointerDownOutside={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest(".pac-container")) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Dodaj budynek</DialogTitle>
          <DialogDescription>
            Adres jest wymagany. Dopięcie Wspólnoty lub firmy jest rekomendowane, ale
            nieobowiązkowe (np. kamienica osoby prywatnej).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Adres</Label>
            <GooglePlacesAddressInput
              value={address}
              onChange={(value) => {
                setAddress(value);
                setGooglePlaceId(null);
              }}
              onPlaceSelect={handlePlaceSelect}
              placeholder="Wyszukaj adres (Google Places)"
            />
          </div>
          <LegalEntityNipField
            orgId={orgId}
            value={contractor}
            onChange={setContractor}
            allowedKinds={[...HOUSING_KINDS, ...COMPANY_KINDS]}
            flags={{ isAdmin: true }}
            optionalHint="Możesz dodać sam adres i dopiąć podmiot później."
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Anuluj
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Dodawanie…
              </>
            ) : (
              "Dodaj budynek"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
