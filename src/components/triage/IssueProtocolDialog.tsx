import { format } from "date-fns";
import { pl } from "date-fns/locale";

import type { TriageIssue } from "@/hooks/useTriageIssues";
import type { Json } from "@/types/supabase";
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

function formatMaterials(m: Json): string {
  if (m == null) return "—";
  try {
    return JSON.stringify(m, null, 2);
  } catch {
    return String(m);
  }
}

export type IssueProtocolDialogProps = {
  issue: TriageIssue;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function IssueProtocolDialog({ issue, open, onOpenChange }: IssueProtocolDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Protokół rozwiązania</DialogTitle>
          <DialogDescription>
            Podsumowanie danych z zamkniętego zgłoszenia (tylko do odczytu).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Data rozwiązania</p>
            <p className="mt-0.5">{formatDt(issue.resolved_at)}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Koszt robocizny</p>
              <p className="mt-0.5">{formatMoney(issue.labor_cost)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Godziny pracy</p>
              <p className="mt-0.5">{issue.labor_hours != null ? `${issue.labor_hours} h` : "—"}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Materiały (razem)</p>
              <p className="mt-0.5">{formatMoney(issue.total_material_cost)}</p>
            </div>
          </div>
          {issue.resolution_notes?.trim() ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Notatka</p>
              <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">{issue.resolution_notes.trim()}</p>
            </div>
          ) : null}
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Materiały (dane)</p>
            <pre className="mt-1 max-h-40 overflow-auto rounded-md border border-border/60 bg-muted/20 p-3 text-xs leading-relaxed">
              {formatMaterials(issue.materials_used)}
            </pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
