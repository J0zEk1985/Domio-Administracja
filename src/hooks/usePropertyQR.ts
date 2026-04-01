import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/sonner";
import { getOrgAndActor, hasLocationAdministrationAccess } from "@/lib/orgAccess";
import { propertyQueryKey } from "@/hooks/useProperties";

/**
 * Control plane: rotate the Serwis public issue-report token on `cleaning_locations.issue_qr_token`.
 * Single source of truth for QR / public zgłoszenie links consumed by DOMIO Serwis (`/zgloszenie?token=`).
 *
 * Pamiętaj: w aplikacji DOMIO Serwis wyłącz możliwość generowania i resetowania tego kodu — zostaw tam
 * wyłącznie tryb read-only (podgląd / kopiowanie linku), aby uniknąć rozjechania się z panelem Admin.
 */
export function useGeneratePropertyQR(locationId: string | undefined) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!locationId?.trim()) throw new Error("Brak identyfikatora nieruchomości.");

      const actor = await getOrgAndActor();
      if (!actor.isOwner) {
        const ok = await hasLocationAdministrationAccess(actor.userId, locationId);
        if (!ok) {
          throw new Error("Brak uprawnień do wygenerowania kodu QR dla tego budynku.");
        }
      }

      const next = crypto.randomUUID();
      const { error } = await supabase
        .from("cleaning_locations")
        .update({ issue_qr_token: next })
        .eq("id", locationId);

      if (error) {
        console.error("[useGeneratePropertyQR] cleaning_locations update:", error);
        throw error;
      }
    },
    onSuccess: async () => {
      if (locationId) {
        await qc.invalidateQueries({ queryKey: propertyQueryKey(locationId) });
      }
      toast.success("Wygenerowano nowy link i kod QR dla zgłoszeń Serwis.");
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : "Nie udało się wygenerować nowego kodu.";
      toast.error(msg);
      console.error("[useGeneratePropertyQR]", err);
    },
  });
}
