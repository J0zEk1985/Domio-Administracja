import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toast } from "@/components/ui/sonner";
import {
  deleteResidentOrderCatalogItem,
  ensureResidentOrderSettings,
  listCommunityResidentOrders,
  listResidentOrderCatalog,
  listResidentOrderEvents,
  markResidentOrderOffline,
  queueResidentOrderDispatch,
  saveResidentOrderSettings,
  setResidentOrderCompany,
  setResidentOrderStockDelivery,
  upsertResidentOrderCatalogItem,
  type UpsertCatalogItemInput,
} from "@/lib/residentOrderApi";

export const residentOrderCatalogKey = (communityId: string) =>
  ["resident-order-catalog", communityId] as const;

export const residentOrderSettingsKey = (communityId: string) =>
  ["resident-order-settings", communityId] as const;

export const residentOrdersKey = (communityId: string) =>
  ["resident-orders", communityId] as const;

export const residentOrderEventsKey = (orderId: string) =>
  ["resident-order-events", orderId] as const;

export function useResidentOrderCatalog(communityId: string | null) {
  return useQuery({
    queryKey: residentOrderCatalogKey(communityId ?? ""),
    queryFn: () => listResidentOrderCatalog(communityId!),
    enabled: Boolean(communityId),
  });
}

export function useResidentOrderSettings(communityId: string | null) {
  return useQuery({
    queryKey: residentOrderSettingsKey(communityId ?? ""),
    queryFn: () => ensureResidentOrderSettings(communityId!),
    enabled: Boolean(communityId),
  });
}

export function useCommunityResidentOrders(communityId: string | null) {
  return useQuery({
    queryKey: residentOrdersKey(communityId ?? ""),
    queryFn: () => listCommunityResidentOrders(communityId!),
    enabled: Boolean(communityId),
  });
}

export function useResidentOrderEvents(orderId: string | null) {
  return useQuery({
    queryKey: residentOrderEventsKey(orderId ?? ""),
    queryFn: () => listResidentOrderEvents(orderId!),
    enabled: Boolean(orderId),
  });
}

function invalidateOrders(qc: ReturnType<typeof useQueryClient>, communityId: string | null) {
  if (!communityId) return;
  void qc.invalidateQueries({ queryKey: residentOrdersKey(communityId) });
  void qc.invalidateQueries({ queryKey: residentOrderCatalogKey(communityId) });
  void qc.invalidateQueries({ queryKey: residentOrderSettingsKey(communityId) });
}

export function useUpsertResidentOrderCatalogItem(communityId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertCatalogItemInput) => upsertResidentOrderCatalogItem(input),
    onSuccess: () => {
      toast.success("Zapisano pozycję katalogu.");
      if (communityId) void qc.invalidateQueries({ queryKey: residentOrderCatalogKey(communityId) });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Nie udało się zapisać pozycji.");
    },
  });
}

export function useDeleteResidentOrderCatalogItem(communityId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => deleteResidentOrderCatalogItem(itemId),
    onSuccess: () => {
      toast.success("Usunięto pozycję z katalogu.");
      if (communityId) void qc.invalidateQueries({ queryKey: residentOrderCatalogKey(communityId) });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Nie udało się usunąć pozycji.");
    },
  });
}

export function useSaveResidentOrderSettings(communityId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveResidentOrderSettings,
    onSuccess: () => {
      toast.success("Zapisano ustawienia zamówień.");
      if (communityId) void qc.invalidateQueries({ queryKey: residentOrderSettingsKey(communityId) });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Nie udało się zapisać ustawień.");
    },
  });
}

export function useResidentOrderActions(communityId: string | null) {
  const qc = useQueryClient();
  const onError = (err: unknown) => {
    toast.error(err instanceof Error ? err.message : "Operacja nie powiodła się.");
  };

  const stock = useMutation({
    mutationFn: setResidentOrderStockDelivery,
    onSuccess: () => {
      toast.success("Zamówienie trafiło do panelu terenowego (przekazanie).");
      invalidateOrders(qc, communityId);
    },
    onError,
  });

  const offline = useMutation({
    mutationFn: markResidentOrderOffline,
    onSuccess: () => {
      toast.success("Oznaczono jako zamówione poza systemem.");
      invalidateOrders(qc, communityId);
    },
    onError,
  });

  const company = useMutation({
    mutationFn: (args: { orderId: string; companyId: string }) =>
      setResidentOrderCompany(args.orderId, args.companyId),
    onSuccess: () => {
      toast.success("Zmieniono podmiot realizacji.");
      invalidateOrders(qc, communityId);
    },
    onError,
  });

  const dispatch = useMutation({
    mutationFn: (args: { orderId: string; companyId?: string | null }) =>
      queueResidentOrderDispatch(args.orderId, args.companyId),
    onSuccess: () => {
      toast.success("Zlecono wysyłkę zamówienia do kontrahenta.");
      invalidateOrders(qc, communityId);
    },
    onError,
  });

  return { stock, offline, company, dispatch };
}
