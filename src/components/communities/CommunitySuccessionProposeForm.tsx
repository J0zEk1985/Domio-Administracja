import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SUCCESSION_MODE_LABEL, type LegalEntityOrgMatch } from "@/lib/mandateApi";
import type { LegalEntityPublic } from "@/lib/legalEntityApi";
import type { SuccessionMode } from "@/types/mandates";

export const SUCCESSOR_EXTERNAL = "__external__";

type CommunitySuccessionProposeFormProps = {
  canManage: boolean;
  hasPrimaryAdmin: boolean;
  nip: string;
  lookupBusy: boolean;
  lookupMessage: string | null;
  successor: LegalEntityPublic | null;
  successorOrgs: LegalEntityOrgMatch[];
  toOrgChoice: string;
  forceExternal: boolean;
  mode: SuccessionMode;
  proposePending: boolean;
  onNipChange: (value: string) => void;
  onLookup: () => void;
  onClearSuccessor: () => void;
  onToOrgChoice: (value: string) => void;
  onForceExternal: (value: boolean) => void;
  onMode: (value: SuccessionMode) => void;
  onPropose: () => void;
};

export function CommunitySuccessionProposeForm({
  canManage,
  hasPrimaryAdmin,
  nip,
  lookupBusy,
  lookupMessage,
  successor,
  successorOrgs,
  toOrgChoice,
  forceExternal,
  mode,
  proposePending,
  onNipChange,
  onLookup,
  onClearSuccessor,
  onToOrgChoice,
  onForceExternal,
  onMode,
  onPropose,
}: CommunitySuccessionProposeFormProps) {
  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Zgłoś sukcesję</CardTitle>
        <CardDescription>
          Wskaż NIP nowego zarządcy. Jeśli jest w DOMIO — wybierz jego organizację. Jeśli nie korzysta z DOMIO —
          zostaw tryb poza systemem. Stary zarządca zostaje przy wspólnocie.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 max-w-md">
          <Label htmlFor="successor-nip">NIP następcy</Label>
          <div className="flex gap-2">
            <Input
              id="successor-nip"
              inputMode="numeric"
              placeholder="10 cyfr"
              value={nip}
              disabled={!canManage || lookupBusy || Boolean(successor)}
              onChange={(e) => onNipChange(nipDigits(e.target.value))}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={!canManage || lookupBusy || nip.length !== 10 || Boolean(successor)}
              onClick={onLookup}
            >
              {lookupBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sprawdź NIP"}
            </Button>
          </div>
        </div>
        {successor ? (
          <div className="rounded-md border bg-muted/30 p-3 text-sm max-w-md">
            <p className="font-medium">{successor.shortName}</p>
            <p className="text-muted-foreground">{successor.legalName}</p>
            <p className="text-xs text-muted-foreground mt-1">NIP {successor.nip}</p>
            <Button type="button" variant="ghost" size="sm" className="mt-2 h-8 px-2" onClick={onClearSuccessor}>
              Wyczyść
            </Button>
          </div>
        ) : null}
        {successor ? (
          <div className="grid gap-2 max-w-md">
            <Label>Organizacja następcy</Label>
            <Select
              value={forceExternal ? SUCCESSOR_EXTERNAL : toOrgChoice}
              onValueChange={onToOrgChoice}
              disabled={!canManage || forceExternal}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SUCCESSOR_EXTERNAL}>Poza DOMIO</SelectItem>
                {successorOrgs.map((row) => (
                  <SelectItem key={row.orgId} value={row.orgId}>
                    {row.orgName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className="flex items-start gap-2">
          <Checkbox
            id="force-external"
            checked={forceExternal || toOrgChoice === SUCCESSOR_EXTERNAL}
            onCheckedChange={(v) => onForceExternal(v === true)}
            disabled={!canManage || !successor}
          />
          <Label htmlFor="force-external" className="font-normal leading-snug">
            Zarządca poza DOMIO (mandat desygnacji zewnętrznej)
          </Label>
        </div>
        <div className="grid gap-2 max-w-md">
          <Label>Tryb sukcesji</Label>
          <Select value={mode} onValueChange={(v) => onMode(v as SuccessionMode)} disabled={!canManage}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SUCCESSION_MODE_LABEL) as SuccessionMode[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {SUCCESSION_MODE_LABEL[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {lookupMessage ? <p className="text-sm text-destructive">{lookupMessage}</p> : null}
        {canManage ? (
          <Button type="button" disabled={!successor || proposePending || !hasPrimaryAdmin} onClick={onPropose}>
            Zgłoś sukcesję
          </Button>
        ) : null}
        {!hasPrimaryAdmin ? (
          <p className="text-xs text-muted-foreground">Najpierw ustanów główny mandat administracji.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function nipDigits(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 10);
}
