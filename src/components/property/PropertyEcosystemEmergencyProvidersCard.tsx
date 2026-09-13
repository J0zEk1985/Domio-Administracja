import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useVendorPartners } from "@/hooks/useVendorPartners";
import {
  useCommunityEmergencyProviders,
  useDeleteEmergencyProvider,
  useUpsertEmergencyProvider,
} from "@/hooks/useCommunityEmergencyProviders";

const TRADES = ["Elektryczna", "Hydrauliczna", "Ogólnobudowlana", "Sprzęt"] as const;

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
  const { data: vendors = [] } = useVendorPartners();
  const add = useUpsertEmergencyProvider(communityId, orgId);
  const remove = useDeleteEmergencyProvider(communityId);
  const [trade, setTrade] = useState<string>(TRADES[0]);
  const [vendorId, setVendorId] = useState<string>("");

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Pogotowie techniczne 24h</CardTitle>
        <CardDescription>
          Rejestr firm poza godzinami pracy — do przekazywania zgłoszeń z trybu awaryjnego. Osobno od tablicy w Home.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Wczytywanie…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak przypisanych firm 24h.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                <div>
                  <p className="font-medium">{row.trade_category}</p>
                  <p className="text-muted-foreground">{row.vendor_name ?? row.vendor_partner_id}</p>
                </div>
                {canManage ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => remove.mutate(row.id)}
                    disabled={remove.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {canManage ? (
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <div className="space-y-1.5">
              <Label>Branża</Label>
              <Select value={trade} onValueChange={setTrade}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRADES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Firma</Label>
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz firmę" />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              className="self-end gap-1.5"
              disabled={!vendorId || add.isPending}
              onClick={() =>
                add.mutate(
                  { trade_category: trade, vendor_partner_id: vendorId, location_id: null },
                  { onSuccess: () => setVendorId("") },
                )
              }
            >
              <Plus className="h-4 w-4" />
              Dodaj
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
