import { useState } from "react";
import { format, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import { Link } from "react-router-dom";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";
import { VerificationNeededBadge } from "@/components/legal-entity/VerificationNeededBadge";
import { useOrgVerificationAlerts } from "@/hooks/useOrgVerificationAlerts";
import {
  retryLegalEntityGus,
  LegalEntityApiError,
  VERIFICATION_ALERTS_ROOT,
  type OrgVerificationAlert,
} from "@/lib/legalEntityApi";
import { LEGAL_ENTITY_KIND_LABELS } from "@/lib/legalEntityMessages";

function alertHref(alert: OrgVerificationAlert): string | null {
  if (!alert.overlayId) return null;
  if (alert.overlayKind === "community") return `/communities/${alert.overlayId}`;
  return `/companies/${alert.overlayId}`;
}

function formatCreatedAt(iso: string): string {
  try {
    const d = parseISO(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return format(d, "d MMM yyyy, HH:mm", { locale: pl });
  } catch {
    return "—";
  }
}

export function VerificationAlertsCard({ orgId }: { orgId: string | null }) {
  const queryClient = useQueryClient();
  const { data: alerts = [], isLoading, error } = useOrgVerificationAlerts(orgId);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  if (!orgId || isLoading) {
    return null;
  }
  if (!error && alerts.length === 0) {
    return null;
  }

  const onRetry = async (legalEntityId: string) => {
    setRetryingId(legalEntityId);
    try {
      await retryLegalEntityGus(legalEntityId);
      toast.success("Dane uzupełnione z GUS. Alert zdjęty.");
      await queryClient.invalidateQueries({ queryKey: [VERIFICATION_ALERTS_ROOT] });
      await queryClient.invalidateQueries({ queryKey: ["communities"] });
      await queryClient.invalidateQueries({ queryKey: ["companies"] });
    } catch (err) {
      console.error("[VerificationAlertsCard] retry:", err);
      toast.error(err instanceof LegalEntityApiError ? err.message : "Nie udało się ponowić GUS.");
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <Card className="overflow-hidden border-border shadow-sm border-l-4 border-l-amber-500">
      <CardHeader className="space-y-1 pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base font-semibold tracking-tight">Podmioty do sprawdzenia</CardTitle>
          {alerts.length > 0 ? <VerificationNeededBadge /> : null}
        </div>
        <p className="text-xs text-muted-foreground">
          Dodane przy awarii GUS. Ponów weryfikację, gdy serwis wróci.
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        {error ? (
          <p className="text-sm text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Nie udało się wczytać kolejki weryfikacji.
          </p>
        ) : (
          <ul className="space-y-3">
            {alerts.map((alert) => {
              const href = alertHref(alert);
              return (
                <li
                  key={alert.legalEntityId}
                  className="flex flex-col gap-2 border-b border-border/60 pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    {href ? (
                      <Link to={href} className="text-sm font-medium text-primary hover:underline truncate block">
                        {alert.shortName}
                      </Link>
                    ) : (
                      <p className="text-sm font-medium truncate">{alert.shortName}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {LEGAL_ENTITY_KIND_LABELS[alert.kind]} · NIP {alert.nip} · {formatCreatedAt(alert.createdAt)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    disabled={retryingId === alert.legalEntityId}
                    onClick={() => void onRetry(alert.legalEntityId)}
                  >
                    {retryingId === alert.legalEntityId ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Ponów GUS
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
