import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/sonner";
import { propertyQueryKey } from "@/hooks/useProperties";

/**
 * Rotates the guest board portal token on `cleaning_locations` (invalidates old URLs).
 * RLS must allow UPDATE for the current user on this row.
 */
export function useRotateLocationToken(locationId: string | undefined) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!locationId?.trim()) throw new Error("Brak identyfikatora nieruchomości.");

      const next = crypto.randomUUID();
      const { error } = await supabase
        .from("cleaning_locations")
        .update({ board_portal_token: next })
        .eq("id", locationId);

      if (error) {
        console.error("[useRotateLocationToken] update:", error);
        throw error;
      }
    },
    onSuccess: async () => {
      if (locationId) {
        await qc.invalidateQueries({ queryKey: propertyQueryKey(locationId) });
      }
      toast.success("Wygenerowano nowy link portalu Zarządu.");
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : "Nie udało się zresetować linku.";
      toast.error(msg);
      console.error("[useRotateLocationToken]", err);
    },
  });
}
