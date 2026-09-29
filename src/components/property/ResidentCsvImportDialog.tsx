import { useMemo, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useImportPropertyResidents } from "@/hooks/usePropertyResidents";
import { parseResidentCsv, RESIDENT_CSV_TEMPLATE, type CsvPreviewRow } from "@/lib/residentCsv";
import { cn } from "@/lib/utils";

type ResidentCsvImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locationId: string;
  existingNormalized: ReadonlySet<string>;
};

function downloadTemplate() {
  const blob = new Blob([RESIDENT_CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "mieszkancy.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function ResidentCsvImportDialog({
  open,
  onOpenChange,
  locationId,
  existingNormalized,
}: ResidentCsvImportDialogProps) {
  const importResidents = useImportPropertyResidents(locationId);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [rows, setRows] = useState<CsvPreviewRow[]>([]);
  const [dragging, setDragging] = useState(false);
  const [serverNotes, setServerNotes] = useState<Record<number, string>>({});

  const validRows = useMemo(() => rows.filter((row) => !row.error), [rows]);
  const errorCount = rows.length - validRows.length;

  const reset = () => {
    setFileName(null);
    setFileError(null);
    setRows([]);
    setServerNotes({});
  };

  const readFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setFileError("Wybierz plik z rozszerzeniem .csv.");
      setRows([]);
      setFileName(file.name);
      return;
    }
    const text = await file.text();
    const parsed = parseResidentCsv(text, existingNormalized);
    setFileName(file.name);
    setFileError(parsed.fileError);
    setRows(parsed.rows);
    setServerNotes({});
  };

  const onSave = () => {
    if (validRows.length === 0) return;
    importResidents.mutate(
      validRows.map((row) => ({
        row_index: row.rowIndex,
        email: row.email,
        full_name: row.fullName,
        unit_number: row.unitNumber,
      })),
      {
        onSuccess: (result) => {
          const failed = result.filter((row) => row.status === "error");
          const imported = result.length - failed.length;
          const notes: Record<number, string> = {};
          for (const row of result) notes[row.rowIndex] = row.message;
          setServerNotes(notes);
          if (failed.length === 0) {
            toast.success(`Zaimportowano ${imported}/${result.length} mieszkańców.`);
            onOpenChange(false);
            reset();
            return;
          }
          toast.message(`Zaimportowano ${imported}/${result.length} mieszkańców. ${failed.length} wierszy zawiera błędy.`);
        },
        onError: (error) => {
          const message = error instanceof Error ? error.message : "Import nie powiódł się.";
          toast.error(message);
          console.error("[ResidentCsvImportDialog]", error);
        },
      }
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import mieszkańców z CSV</DialogTitle>
          <DialogDescription>
            Kolumny: email, full_name, unit_number. Brakujący lokal mieszkalny zostanie utworzony.
            Osoba bez konta poczeka na pierwsze logowanie w DOMIO Home.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
            Pobierz szablon
          </Button>
        </div>

        <label
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center text-sm",
            dragging ? "border-primary bg-primary/5" : "border-border"
          )}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files[0];
            if (file) void readFile(file);
          }}
        >
          <FileUp className="h-5 w-5 text-muted-foreground" aria-hidden />
          <span>Upuść plik CSV albo wybierz go z dysku</span>
          {fileName ? <span className="text-muted-foreground">{fileName}</span> : null}
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void readFile(file);
              event.target.value = "";
            }}
          />
        </label>

        {fileError ? <p className="text-sm text-destructive">{fileError}</p> : null}

        {rows.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {validRows.length} wierszy gotowych do zapisu
              {errorCount > 0 ? `, ${errorCount} z błędami formatu` : ""}.
            </p>
            <div className="max-h-72 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Wiersz</TableHead>
                    <TableHead>Imię i nazwisko</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Lokal</TableHead>
                    <TableHead>Wynik</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const server = serverNotes[row.rowIndex];
                    const note = row.error ?? server ?? (row.willCreateUnit ? "Lokal zostanie utworzony" : "Lokal jest w rejestrze");
                    return (
                      <TableRow key={row.rowIndex} className={row.error ? "bg-destructive/5" : undefined}>
                        <TableCell className="tabular-nums">{row.rowIndex}</TableCell>
                        <TableCell>{row.fullName || "—"}</TableCell>
                        <TableCell>{row.email || "—"}</TableCell>
                        <TableCell className="tabular-nums">{row.unitNumber || "—"}</TableCell>
                        <TableCell className={row.error ? "text-destructive" : "text-muted-foreground"}>
                          {note}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Anuluj
          </Button>
          <Button type="button" disabled={validRows.length === 0 || importResidents.isPending} onClick={onSave}>
            {importResidents.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Zapisz {validRows.length > 0 ? `(${validRows.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
