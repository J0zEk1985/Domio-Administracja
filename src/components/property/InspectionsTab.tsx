import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, CloudUpload } from "lucide-react";
import type { Inspection } from "@/data/mock-data";

interface InspectionsTabProps {
  inspections: Inspection[];
}

const categoryLabels: Record<Inspection["category"], string> = {
  fire: "Pożarowy",
  chimney: "Kominiarski",
  gas: "Gazowy",
  hvac: "HVAC",
};

const statusConfig: Record<Inspection["status"], { label: string; className: string }> = {
  valid: { label: "Aktualny", className: "border-success/30 bg-success/10 text-success" },
  expired: { label: "Przeterminowany", className: "border-destructive/30 bg-destructive/10 text-destructive" },
  pending: { label: "Oczekujący", className: "border-warning/30 bg-warning/10 text-warning" },
};

const InspectionsTab = ({ inspections }: InspectionsTabProps) => {
  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-xs font-medium text-muted-foreground">Nazwa przeglądu</TableHead>
            <TableHead className="text-xs font-medium text-muted-foreground">Kategoria</TableHead>
            <TableHead className="text-xs font-medium text-muted-foreground">Termin</TableHead>
            <TableHead className="text-xs font-medium text-muted-foreground">Status</TableHead>
            <TableHead className="text-xs font-medium text-muted-foreground text-center">c-KOB</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {inspections.map((inspection) => {
            const sc = statusConfig[inspection.status];
            return (
              <TableRow key={inspection.id} className="h-11">
                <TableCell className="text-sm font-medium text-foreground">{inspection.title}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{categoryLabels[inspection.category]}</TableCell>
                <TableCell className="text-sm text-muted-foreground tabular-nums">
                  {new Date(inspection.next_due_date).toLocaleDateString("pl-PL")}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-xs font-medium ${sc.className}`}>
                    {sc.label}
                  </Badge>
                </TableCell>
                <TableCell className="text-center">
                  {inspection.source === "ckob" ? (
                    <CloudUpload className="h-4 w-4 text-success mx-auto" />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};

export default InspectionsTab;
