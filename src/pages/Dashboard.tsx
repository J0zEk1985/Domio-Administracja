import { Plus, Sparkles, AlertTriangle, Clock, Building2 as Building2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const aiDrafts = [
  {
    id: "1",
    property: "Klonowa 5",
    category: "Hydraulika",
    confidence: 98,
    snippet: "Mieszkaniec zgłasza wyciek wody w łazience na 3 piętrze. Prosi o pilną interwencję hydraulika.",
  },
  {
    id: "2",
    property: "Słoneczna 12",
    category: "Elektryka",
    confidence: 94,
    snippet: "Zgłoszenie awarii oświetlenia na klatce schodowej B. Lampy migoczą od kilku dni.",
  },
];

const urgentItems = [
  { id: "1", text: "Wspólnota Słoneczna: Przegląd c-KOB (Gaz)", deadline: "za 3 dni", severity: "critical" as const },
  { id: "2", text: "Osiedle Nowe: Wygasa umowa na sprzątanie", deadline: "14 dni", severity: "warning" as const },
  { id: "3", text: "Klonowa 5: Przegląd kominiarski", deadline: "za 7 dni", severity: "warning" as const },
  { id: "4", text: "Rezydencja Parkowa: Przegląd p.poż", deadline: "za 21 dni", severity: "info" as const },
];

const properties = [
  { name: "Klonowa 5", status: "ok" as const, issues: 2, score: 100 },
  { name: "Słoneczna 12", status: "critical" as const, issues: 5, score: 80 },
  { name: "Rezydencja Parkowa", status: "ok" as const, issues: 1, score: 100 },
  { name: "Osiedle Nowe", status: "warning" as const, issues: 3, score: 92 },
  { name: "Park Miejski 8", status: "ok" as const, issues: 0, score: 100 },
];

const statusDot = (status: "ok" | "warning" | "critical") => {
  const colors = {
    ok: "bg-success",
    warning: "bg-warning",
    critical: "bg-destructive",
  };
  return <span className={`inline-block h-2 w-2 rounded-full ${colors[status]}`} />;
};

const severityDot = (severity: "critical" | "warning" | "info") => {
  const colors = {
    critical: "bg-destructive",
    warning: "bg-warning",
    info: "bg-muted-foreground/40",
  };
  return <span className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${colors[severity]}`} />;
};

const Dashboard = () => {
  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            Dzień dobry, Jan.{" "}
            <span className="text-muted-foreground font-normal">
              Wymagana akcja ({aiDrafts.length + 1})
            </span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Piątek, 28 marca 2026 · 5 nieruchomości
          </p>
        </div>
        <Button size="sm" className="h-8 gap-1.5 text-xs">
          <Plus className="h-3.5 w-3.5" />
          Nowe zgłoszenie
        </Button>
      </div>

      {/* Section A: AI Inbox */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Szkice AI do zatwierdzenia (z maili)
          </h2>
          <Badge variant="secondary" className="h-4 rounded-full px-1.5 text-[10px]">
            {aiDrafts.length}
          </Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {aiDrafts.map((draft) => (
            <Card key={draft.id} className="border-border bg-card">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-foreground">
                        {draft.property}
                      </span>
                      <Badge variant="outline" className="h-4 rounded px-1.5 text-[10px] font-normal">
                        {draft.category}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className="h-4 rounded px-1.5 text-[10px] font-normal bg-success/10 text-success border-0"
                      >
                        {draft.confidence}% Pewności
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                      {draft.snippet}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Button size="sm" className="h-7 text-[11px] px-3">
                    Zatwierdź & Deleguj
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-[11px] px-3 text-muted-foreground">
                    Odrzuć
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Bottom Grid: B + C */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Section B: Urgent Reviews */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Pilne przeglądy i umowy
            </h2>
          </div>
          <Card className="border-border">
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {urgentItems.map((item) => (
                  <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                    {severityDot(item.severity)}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-foreground leading-snug">
                        {item.text}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                        {item.deadline}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>

        {/* Section C: Property Watchlist */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Building2Icon className="h-3.5 w-3.5 text-muted-foreground" />
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Status nieruchomości
            </h2>
          </div>
          <Card className="border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-9 text-[11px] font-medium">Nazwa</TableHead>
                    <TableHead className="h-9 text-[11px] font-medium w-16 text-center">Status</TableHead>
                    <TableHead className="h-9 text-[11px] font-medium w-24 text-center">Awarie</TableHead>
                    <TableHead className="h-9 text-[11px] font-medium w-24 text-right">Compliance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {properties.map((prop) => (
                    <TableRow key={prop.name} className="cursor-pointer">
                      <TableCell className="py-2.5 text-xs font-medium">
                        {prop.name}
                      </TableCell>
                      <TableCell className="py-2.5 text-center">
                        {statusDot(prop.status)}
                      </TableCell>
                      <TableCell className="py-2.5 text-center text-xs text-muted-foreground">
                        {prop.issues}
                      </TableCell>
                      <TableCell className="py-2.5 text-right">
                        <span
                          className={`text-xs font-medium ${
                            prop.score === 100
                              ? "text-success"
                              : prop.score >= 90
                              ? "text-warning"
                              : "text-destructive"
                          }`}
                        >
                          {prop.score}%
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
};

export default Dashboard;
