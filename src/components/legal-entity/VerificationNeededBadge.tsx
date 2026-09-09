import { Badge } from "@/components/ui/badge";
import type { OrgVerificationAlert } from "@/lib/legalEntityApi";

export function VerificationNeededBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={`border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200 ${className ?? ""}`}
    >
      Do sprawdzenia
    </Badge>
  );
}

export function rowNeedsVerification(
  alerts: OrgVerificationAlert[] | undefined,
  overlayKind: "community" | "company",
  overlayId: string,
  nip: string | null | undefined,
): boolean {
  if (!alerts || alerts.length === 0) return false;
  const nipDigits = (nip ?? "").replace(/\D/g, "");
  return alerts.some((alert) => {
    if (alert.overlayKind !== overlayKind) return false;
    if (alert.overlayId && alert.overlayId === overlayId) return true;
    return nipDigits.length === 10 && alert.nip === nipDigits;
  });
}
