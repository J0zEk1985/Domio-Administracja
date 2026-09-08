import { format } from "date-fns";
import { pl } from "date-fns/locale";

import type { TriageIssue } from "@/hooks/useTriageIssues";
import {
  SURCHARGE_KIND_LABELS,
  materialsUsedTotal,
  parseMaterialsUsed,
  suggestedInvoiceAmount,
} from "@/lib/issueProtocol";
import { formatIssueBuildingLabel } from "@/lib/issueLocationLabel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function formatDt(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "d MMM yyyy, HH:mm", { locale: pl });
}

function formatMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(Number(n));
}

export type IssueProtocolDialogProps = {
  issue: TriageIssue;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function IssueProtocolDialog({ issue, open, onOpenChange }: IssueProtocolDialogProps) {
  const materials = parseMaterialsUsed(issue.materials_used);
  const materialTotal =
    issue.total_material_cost != null
      ? Number(issue.total_material_cost)
      : materialsUsedTotal(materials);
  const surcharge = Number(issue.surcharge_amount) || 0;
  const labor = Number(issue.labor_cost) || 0;
  const total = suggestedInvoiceAmount(materialTotal, labor, surcharge);
  const partner = issue.delegated_vendor?.name?.trim() || "—";
  const technician = issue.assigned_staff?.full_name?.trim() || "—";
  const building = formatIssueBuildingLabel(issue.location);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Protokół rozwiązania</DialogTitle>
          <DialogDescription>
            Podsumowanie zamkniętego zgłoszenia (tylko do odczytu).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 text-sm">
          <div className="border-b border-border pb-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Numer protokołu</p>
            <p className="mt-0.5 text-base font-semibold">{issue.protocol_number ?? "—"}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Data rozwiązania
              </p>
              <p className="mt-0.5">{formatDt(issue.resolved_at)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Budynek</p>
              <p className="mt-0.5">{building}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Partner</p>
              <p className="mt-0.5">{partner}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Technik</p>
              <p className="mt-0.5">{technician}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Czas pracy (RBH)
              </p>
              <p className="mt-0.5">{issue.labor_hours != null ? `${issue.labor_hours} h` : "—"}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tryb</p>
              <p className="mt-0.5">
                {issue.surcharge_kind ? SURCHARGE_KIND_LABELS[issue.surcharge_kind] : "Standardowy"}
              </p>
            </div>
            {issue.surcharge_kind ? (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Dodatkowe wynagrodzenie
                </p>
                <p className="mt-0.5">{formatMoney(surcharge)}</p>
              </div>
            ) : null}
          </div>

          {issue.resolution_notes?.trim() ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Opis prac
              </p>
              <p className="mt-1 whitespace-pre-wrap rounded-md border border-border/60 bg-muted/20 p-3 text-muted-foreground">
                {issue.resolution_notes.trim()}
              </p>
            </div>
          ) : null}

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Użyte materiały
            </p>
            {materials.length === 0 ? (
              <p className="mt-1 text-muted-foreground">Brak</p>
            ) : (
              <table className="mt-2 w-full border-collapse border text-sm">
                <thead>
                  <tr>
                    <th className="border p-2 text-left font-medium">Nazwa</th>
                    <th className="border p-2 text-right font-medium">Ilość</th>
                    <th className="border p-2 text-right font-medium">Cena jedn.</th>
                    <th className="border p-2 text-right font-medium">Wartość</th>
                  </tr>
                </thead>
                <tbody>
                  {materials.map((m, idx) => (
                    <tr key={`${m.name}-${idx}`}>
                      <td className="border p-2">{m.name}</td>
                      <td className="border p-2 text-right">{m.quantity}</td>
                      <td className="border p-2 text-right">{formatMoney(m.unit_cost)}</td>
                      <td className="border p-2 text-right">
                        {formatMoney(m.quantity * m.unit_cost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="rounded-md border border-border/60 bg-muted/10 p-3 space-y-1">
            <p>Materiały: {formatMoney(materialTotal)}</p>
            <p>Robocizna: {formatMoney(labor)}</p>
            <p>Dodatkowe wynagrodzenie: {formatMoney(surcharge)}</p>
            <p className="font-semibold">Suma: {formatMoney(total)}</p>
          </div>

          {issue.client_signature ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Podpis odbioru
              </p>
              <img
                src={issue.client_signature}
                alt="Podpis klienta"
                className="mt-2 mx-auto h-20 max-w-[220px] object-contain"
              />
              <p className="mt-1 text-center text-xs text-muted-foreground">
                Podpisano przez: {issue.signed_by?.trim() || "—"}
              </p>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
