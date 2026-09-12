import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/sonner";
import {
  acceptSuccession,
  cancelSuccession,
  completeSuccession,
  listSuccessionEvents,
  proposeSuccession,
  rejectSuccession,
} from "@/lib/mandateApi";
import type { SuccessionMode } from "@/types/mandates";

export const successionQueryKey = (entityId: string) => ["succession-events", entityId] as const;

export function useSuccessionEvents(communityLegalEntityId: string | null) {
  return useQuery({
    queryKey: successionQueryKey(communityLegalEntityId ?? ""),
    queryFn: () => listSuccessionEvents(communityLegalEntityId!),
    enabled: Boolean(communityLegalEntityId),
  });
}

export function useProposeSuccession(communityLegalEntityId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      actingOrgId: string;
      toOrgId: string | null;
      toLegalEntityId: string;
      mode: SuccessionMode;
    }) =>
      proposeSuccession({
        actingOrgId: args.actingOrgId,
        communityLegalEntityId: communityLegalEntityId!,
        locationMasterId: null,
        toOrgId: args.toOrgId,
        toLegalEntityId: args.toLegalEntityId,
        mode: args.mode,
      }),
    onSuccess: () => {
      toast.success("Zgłoszono sukcesję. Czeka na akceptację.");
      if (communityLegalEntityId) {
        void qc.invalidateQueries({ queryKey: successionQueryKey(communityLegalEntityId) });
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Nie udało się zgłosić sukcesji.");
    },
  });
}

export function useSuccessionActions(communityLegalEntityId: string | null) {
  const qc = useQueryClient();
  const invalidate = () => {
    if (communityLegalEntityId) {
      void qc.invalidateQueries({ queryKey: successionQueryKey(communityLegalEntityId) });
      void qc.invalidateQueries({ queryKey: ["service-mandates", communityLegalEntityId] });
    }
  };
  const accept = useMutation({
    mutationFn: (args: { actingOrgId: string; successionId: string }) =>
      acceptSuccession(args.actingOrgId, args.successionId),
    onSuccess: () => {
      toast.success("Sukcesja zaakceptowana.");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Błąd akceptacji sukcesji."),
  });
  const complete = useMutation({
    mutationFn: (args: { actingOrgId: string; successionId: string }) =>
      completeSuccession(args.actingOrgId, args.successionId),
    onSuccess: () => {
      toast.success("Sukcesja zakończona.");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Błąd zakończenia sukcesji."),
  });
  const cancel = useMutation({
    mutationFn: (args: { actingOrgId: string; successionId: string }) =>
      cancelSuccession(args.actingOrgId, args.successionId),
    onSuccess: () => {
      toast.success("Sukcesja anulowana.");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Błąd anulowania."),
  });
  const reject = useMutation({
    mutationFn: (args: { actingOrgId: string; successionId: string }) =>
      rejectSuccession(args.actingOrgId, args.successionId),
    onSuccess: () => {
      toast.success("Sukcesja odrzucona.");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Błąd odrzucenia."),
  });
  return { accept, complete, cancel, reject };
}
