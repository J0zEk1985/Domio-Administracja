import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import { useVendorPartners } from "@/hooks/useVendorPartners";
import {
  useCommunityEmergencyProviders,
  useSaveEmergencyProvider,
} from "@/hooks/useCommunityEmergencyProviders";
import { EMERGENCY_TRADES, type EmergencyTradeCode } from "@/types/emergencyDuty";

const NO_VENDOR = "__none__";

export function PropertyEcosystemEmergencyProvidersCard({
  orgId,
  communityId,
  canManage,
}: {
  orgId: string;
  communityId: string;
  canManage: boolean;
}) {
  const { data: rows = [], isLoading } = useCommunityEmergencyProviders(communityId);
  const { data: vendors = [], isLoading: vendorsLoading } = useVendorPartners();
  const save = useSaveEmergencyProvider(communityId, orgId);

  const byCode = useMemo(() => {
    const map = new Map(rows.map((row) => [row.trade_code, row]));
    return map;
  }, [rows]);

  const pendingCode = save.isPending ? (save.variables?.trade_code ?? null) : null;

  const saveTrade = (
    code: EmergencyTradeCode,
    patch: { is_enabled?: boolean; vendor_partner_id?: string | null },
  ) => {
    const current = byCode.get(code);
    save.mutate({
      trade_code: code,
      is_enabled: patch.is_enabled ?? current?.is_enabled ?? false,
      vendor_partner_id:
        patch.vendor_partner_id !== undefined
          ? patch.vendor_partner_id
          : (current?.vendor_partner_id ?? null),
    });
  };

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Pogotowie 24h</CardTitle>
        <CardDescription>
          Dla całej wspólnoty: które branże działają w trybie pogotowia i jaka firma je obsługuje.
          Osobno od tablicy kontaktów w Home. Na liście są wykonawcy z Umowy i Firmy,
          nie ubezpieczyciele.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading || vendorsLoading ? (
          <p className="text-sm text-muted-foreground">Wczytywanie…</p>
        ) : (
          <>
            {canManage && vendors.length === 0 ? (
              <p className="mb-3 text-sm text-muted-foreground">
                Brak wykonawców. Dodaj firmę z kategorią Wykonawca w zakładce Umowy i Firmy.
              </p>
            ) : null}
            <ul className="divide-y rounded-lg border">
            {EMERGENCY_TRADES.map((trade) => {
              const row = byCode.get(trade.code);
              const enabled = row?.is_enabled === true;
              const vendorId = row?.vendor_partner_id ?? "";
              const busy = pendingCode === trade.code;
              return (
                <li
                  key={trade.code}
                  className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,14rem)] sm:items-center"
                >
                  <div>
                    <p className="text-sm font-medium">{trade.label}</p>
                    {!canManage ? (
                      <p className="text-xs text-muted-foreground">
                        {enabled
                          ? (row?.vendor_name ?? "Włączone")
                          : "Wyłączone"}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id={`emergency-24h-${trade.code}`}
                      checked={enabled}
                      disabled={!canManage || busy}
                      onCheckedChange={(checked) => {
                        if (checked && !vendorId) {
                          toast.error("Aby włączyć pogotowie 24h, najpierw wybierz firmę.");
                          return;
                        }
                        saveTrade(trade.code, { is_enabled: checked });
                      }}
                    />
                    <Label htmlFor={`emergency-24h-${trade.code}`} className="text-xs text-muted-foreground">
                      24h
                    </Label>
                  </div>
                  {canManage ? (
                    <Select
                      value={vendorId || NO_VENDOR}
                      disabled={busy}
                      onValueChange={(value) => {
                        const nextVendor = value === NO_VENDOR ? null : value;
                        saveTrade(trade.code, {
                          vendor_partner_id: nextVendor,
                          ...(nextVendor === null ? { is_enabled: false } : {}),
                        });
                      }}
                    >
                      <SelectTrigger aria-label={`Firma dla branży ${trade.label}`}>
                        <SelectValue placeholder="Wybierz firmę" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_VENDOR}>Brak firmy</SelectItem>
                        {vendors.map((vendor) => (
                          <SelectItem key={vendor.id} value={vendor.id}>
                            {vendor.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                </li>
              );
            })}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
