import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Contract } from "@/data/mock-data";

interface ContractsTabProps {
  contracts: Contract[];
}

const ContractsTab = ({ contracts }: ContractsTabProps) => {
  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-xs font-medium text-muted-foreground">Zakres usług</TableHead>
            <TableHead className="text-xs font-medium text-muted-foreground">Wykonawca</TableHead>
            <TableHead className="text-xs font-medium text-muted-foreground text-right">Wartość mies.</TableHead>
            <TableHead className="text-xs font-medium text-muted-foreground">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contracts.map((contract) => (
            <TableRow key={contract.id} className="h-11">
              <TableCell className="text-sm font-medium text-foreground">{contract.service_scope}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{contract.vendor_name}</TableCell>
              <TableCell className="text-sm text-muted-foreground text-right tabular-nums">
                {contract.monthly_value.toLocaleString("pl-PL")} zł
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={`text-xs font-medium ${
                    contract.status === "active"
                      ? "border-success/30 bg-success/10 text-success"
                      : "border-warning/30 bg-warning/10 text-warning"
                  }`}
                >
                  {contract.status === "active" ? "Aktywna" : "Wypowiedziana"}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default ContractsTab;
