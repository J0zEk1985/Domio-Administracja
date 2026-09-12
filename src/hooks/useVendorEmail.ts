import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/sonner";
import { VENDOR_PARTNERS_QUERY_KEY } from "@/hooks/useVendorPartners";
import {
  fetchUnmatchedVendorEmails,
  fetchVendorEmailChannel,
  fetchVendorEmailTemplates,
  saveVendorEmailChannel,
  saveVendorEmailTemplate,
  assignUnmatchedVendorEmail,
  type VendorEmailSaveInput,
  type VendorEmailTemplateSaveInput,
} from "@/lib/vendorEmailApi";

export const vendorEmailChannelQueryKey = (vendorId: string | null) =>
  ["vendor-email-channel", vendorId] as const;

export const vendorEmailTemplatesQueryKey = (vendorId: string | null) =>
  ["vendor-email-templates", vendorId] as const;

export const unmatchedVendorEmailsQueryKey = ["vendor-email-unmatched"] as const;

export function useVendorEmailChannel(vendorId: string | null) {
  return useQuery({
    queryKey: vendorEmailChannelQueryKey(vendorId),
    enabled: Boolean(vendorId),
    queryFn: () => fetchVendorEmailChannel(vendorId as string),
  });
}

export function useVendorEmailTemplates(vendorId: string | null) {
  return useQuery({
    queryKey: vendorEmailTemplatesQueryKey(vendorId),
    enabled: Boolean(vendorId),
    queryFn: () => fetchVendorEmailTemplates(vendorId as string),
  });
}

export function useUnmatchedVendorEmails(enabled: boolean) {
  return useQuery({
    queryKey: unmatchedVendorEmailsQueryKey,
    enabled,
    queryFn: fetchUnmatchedVendorEmails,
  });
}

export function useSaveVendorEmailChannel(vendorId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: VendorEmailSaveInput) => saveVendorEmailChannel(input),
    onSuccess: async () => {
      toast.success("Zapisano kanał e-mail partnera.");
      await qc.invalidateQueries({ queryKey: vendorEmailChannelQueryKey(vendorId) });
      await qc.invalidateQueries({ queryKey: [VENDOR_PARTNERS_QUERY_KEY] });
    },
    onError: (err) => {
      console.error("[useSaveVendorEmailChannel]", err);
      toast.error(err instanceof Error ? err.message : "Nie udało się zapisać kanału e-mail.");
    },
  });
}

export function useSaveVendorEmailTemplate(vendorId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: VendorEmailTemplateSaveInput) => saveVendorEmailTemplate(input),
    onSuccess: async () => {
      toast.success("Zapisano wzorzec wiadomości.");
      await qc.invalidateQueries({ queryKey: vendorEmailTemplatesQueryKey(vendorId) });
    },
    onError: (err) => {
      console.error("[useSaveVendorEmailTemplate]", err);
      toast.error(err instanceof Error ? err.message : "Nie udało się zapisać wzorca.");
    },
  });
}

export function useAssignUnmatchedVendorEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: assignUnmatchedVendorEmail,
    onSuccess: async () => {
      toast.success("Przypisano wiadomość do zgłoszenia.");
      await qc.invalidateQueries({ queryKey: unmatchedVendorEmailsQueryKey });
    },
    onError: (err) => {
      console.error("[useAssignUnmatchedVendorEmail]", err);
      toast.error(err instanceof Error ? err.message : "Nie udało się przypisać wiadomości.");
    },
  });
}
