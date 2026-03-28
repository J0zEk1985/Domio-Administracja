import { Card } from "@/components/ui/card";
import { AlertTriangle, CalendarCheck, FileText, Banknote } from "lucide-react";
import type { Inspection, Contract, Issue } from "@/data/mock-data";

interface MetricCardsProps {
  issues: Issue[];
  inspections: Inspection[];
  contracts: Contract[];
}

const MetricCards = ({ issues, inspections, contracts }: MetricCardsProps) => {
  const activeIssues = issues.filter((i) => i.status !== "resolved").length;
  const upcomingInspections = inspections.filter((i) => {
    const due = new Date(i.next_due_date);
    const now = new Date();
    const in30 = new Date();
    in30.setDate(now.getDate() + 30);
    return due >= now && due <= in30;
  }).length;
  const activeContracts = contracts.filter((c) => c.status === "active").length;
  const monthlyCost = contracts.reduce((sum, c) => sum + c.monthly_value, 0);

  const metrics = [
    { label: "Aktywne zgłoszenia", value: activeIssues, icon: AlertTriangle },
    { label: "Przeglądy (30 dni)", value: upcomingInspections, icon: CalendarCheck },
    { label: "Aktywne umowy", value: activeContracts, icon: FileText },
    { label: "Koszt miesięczny", value: `${monthlyCost.toLocaleString("pl-PL")} zł`, icon: Banknote },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {metrics.map((m) => (
        <Card key={m.label} className="p-4 border border-border bg-card">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary">
              <m.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">{m.label}</p>
              <p className="text-lg font-semibold tracking-tight text-foreground">{m.value}</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
};

export default MetricCards;
