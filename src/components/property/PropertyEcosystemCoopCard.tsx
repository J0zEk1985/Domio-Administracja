import { Link } from "react-router-dom";
import { Network } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LocationModulePresence } from "@/lib/mandateApi";

export const COOP_NONE = "__none__";

type PropertyEcosystemCoopCardProps = {
  communityId: string;
  canManage: boolean;
  cleaningOrgs: LocationModulePresence[];
  maintenanceOrgs: LocationModulePresence[];
  cleaningOrgId: string;
  maintenanceOrgId: string;
  cleaningIssuesToSerwis: boolean;
  skipAdminTriage: boolean;
  pending: boolean;
  onCleaningOrgId: (value: string) => void;
  onMaintenanceOrgId: (value: string) => void;
  onCleaningIssuesToSerwis: (value: boolean) => void;
  onSkipAdminTriage: (value: boolean) => void;
  onSave: () => void;
};

export function PropertyEcosystemCoopCard({
  communityId,
  canManage,
  cleaningOrgs,
  maintenanceOrgs,
  cleaningOrgId,
  maintenanceOrgId,
  cleaningIssuesToSerwis,
  skipAdminTriage,
  pending,
  onCleaningOrgId,
  onMaintenanceOrgId,
  onCleaningIssuesToSerwis,
  onSkipAdminTriage,
  onSave,
}: PropertyEcosystemCoopCardProps) {
  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Network className="h-4 w-4 text-muted-foreground" aria-hidden />
          Kooperacja Cleaning → Serwis
        </CardTitle>
        <CardDescription>
          Wybór par firm, które współpracują na tym budynku w ekosystemie (w tym Home). Wymaga aktywnych mandatów
          obu stron.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>Firma sprzątająca</Label>
            <Select value={cleaningOrgId} onValueChange={onCleaningOrgId} disabled={!canManage}>
              <SelectTrigger>
                <SelectValue placeholder="Wybierz Cleaning" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={COOP_NONE}>Brak</SelectItem>
                {cleaningOrgs.map((row) => (
                  <SelectItem key={row.orgId} value={row.orgId}>
                    {row.orgName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Firma serwisowa</Label>
            <Select value={maintenanceOrgId} onValueChange={onMaintenanceOrgId} disabled={!canManage}>
              <SelectTrigger>
                <SelectValue placeholder="Wybierz Serwis" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={COOP_NONE}>Brak</SelectItem>
                {maintenanceOrgs.map((row) => (
                  <SelectItem key={row.orgId} value={row.orgId}>
                    {row.orgName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Checkbox
            id="coop-issues"
            checked={cleaningIssuesToSerwis}
            onCheckedChange={(v) => onCleaningIssuesToSerwis(v === true)}
            disabled={!canManage}
          />
          <Label htmlFor="coop-issues" className="font-normal leading-snug">
            Przekazuj zgłoszenia z Cleaning do Serwis
          </Label>
        </div>
        <div className="flex items-start gap-2">
          <Checkbox
            id="coop-triage"
            checked={skipAdminTriage}
            onCheckedChange={(v) => onSkipAdminTriage(v === true)}
            disabled={!canManage}
          />
          <Label htmlFor="coop-triage" className="font-normal leading-snug">
            Pomijaj triaż administracji (szybszy przepływ)
          </Label>
        </div>
        {canManage ? (
          <Button type="button" disabled={pending} onClick={onSave}>
            Zapisz kooperację
          </Button>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Sukcesję zarządcy ustawiasz na karcie wspólnoty.{" "}
          <Link className="underline underline-offset-2" to={`/communities/${communityId}`}>
            Otwórz wspólnotę
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
