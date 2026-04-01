import { useMemo, useRef, useState } from "react";
import { Copy, Download, Printer, QrCode } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import type { PropertyDetail } from "@/hooks/useProperties";
import { useGeneratePropertyQR } from "@/hooks/usePropertyQR";
import { buildSerwisIssueReportUrl } from "@/lib/serwisIssueReportUrl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

/**
 * Pamiętaj: w aplikacji DOMIO Serwis wyłącz możliwość generowania/resetowania `issue_qr_token`,
 * zostawiając tam jedynie tryb read-only (podgląd / kopiowanie linku).
 */

type Props = {
  property: PropertyDetail;
  canManage: boolean;
  accessPending?: boolean;
};

async function copyText(label: string, text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} skopiowano do schowka.`);
  } catch (e) {
    console.error("[PropertySerwisQrAccessCard] clipboard:", e);
    toast.error("Nie udało się skopiować do schowka.");
  }
}

export function PropertySerwisQrAccessCard({ property, canManage, accessPending }: Props) {
  const generate = useGeneratePropertyQR(property.id);
  const [qrOpen, setQrOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const issueUrl = useMemo(
    () => buildSerwisIssueReportUrl(property.issueQrToken, property.qrCodeToken),
    [property.issueQrToken, property.qrCodeToken],
  );

  const hasPrimaryToken = Boolean(property.issueQrToken?.trim());
  const legacyOnly = !hasPrimaryToken && Boolean(property.qrCodeToken?.trim());

  async function runGenerate() {
    try {
      await generate.mutateAsync();
      setConfirmOpen(false);
    } catch {
      /* toast w hooku */
    }
  }

  function downloadPng() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `qr-zgloszenia-serwis-${property.id.slice(0, 8)}.png`;
    a.rel = "noopener";
    a.click();
  }

  const busy = generate.isPending;

  return (
    <>
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Dostęp Zewnętrzny i Kody QR</CardTitle>
          <CardDescription>
            Link publiczny do formularza zgłoszeń usterek w module DOMIO Serwis (pole{" "}
            <code className="text-xs">cleaning_locations.issue_qr_token</code>). Zarządzanie wyłącznie z tego panelu.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {accessPending && (
            <p className="text-xs text-muted-foreground" role="status">
              Sprawdzanie uprawnień…
            </p>
          )}

          {!issueUrl ? (
            <p className="rounded-md border border-dashed border-border/80 bg-muted/15 px-3 py-4 text-sm text-muted-foreground">
              Brak aktywnego tokenu zgłoszeń. Wygeneruj pierwszy link, aby mieszkańcy mogli zgłaszać usterki przez
              Serwis.
            </p>
          ) : (
            <>
              <div
                className={cn(
                  "rounded-md border border-border/60 bg-muted/20 px-3 py-2 font-mono text-xs break-all text-foreground",
                )}
              >
                {issueUrl}
              </div>
              {legacyOnly ? (
                <p className="text-xs text-amber-700 dark:text-amber-500">
                  Używany jest starszy token (<code className="text-[11px]">qr_code_token</code>). Wygeneruj nowy kod,
                  aby zapisać go w <code className="text-[11px]">issue_qr_token</code>.
                </p>
              ) : null}
            </>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {issueUrl ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => void copyText("Link", issueUrl)}
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                  Kopiuj link
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setQrOpen(true)}
                  disabled={!issueUrl}
                >
                  <QrCode className="h-3.5 w-3.5" aria-hidden />
                  Pokaż kod QR
                </Button>
              </>
            ) : null}

            <Button
              type="button"
              variant={issueUrl ? "destructive" : "default"}
              size="sm"
              disabled={!canManage || busy || accessPending}
              onClick={() => setConfirmOpen(true)}
            >
              {issueUrl ? "Generuj nowy kod / Zresetuj" : "Wygeneruj link"}
            </Button>
          </div>

          {!canManage && !accessPending && (
            <p className="text-xs text-muted-foreground">
              Tylko właściciel organizacji lub administrator przypisany do budynku może wygenerować lub zresetować kod.
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={qrOpen} onOpenChange={(o) => !o && setQrOpen(false)}>
        <DialogContent className="sm:max-w-md print:border-0 print:shadow-none">
          <DialogHeader>
            <DialogTitle>Kod QR — zgłoszenia Serwis</DialogTitle>
            <DialogDescription className="font-mono text-xs break-all">{issueUrl}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2 print:py-4">
            {issueUrl ? (
              <div className="rounded-lg border border-border bg-white p-4 print:border-0">
                <QRCodeCanvas
                  ref={canvasRef}
                  value={issueUrl}
                  size={220}
                  level="M"
                  marginSize={2}
                />
              </div>
            ) : null}
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className="gap-2 print:hidden" onClick={() => downloadPng()}>
              <Download className="h-4 w-4" aria-hidden />
              Pobierz PNG
            </Button>
            <Button
              type="button"
              variant="outline"
              className="gap-2 print:hidden"
              onClick={() => {
                window.print();
              }}
            >
              <Printer className="h-4 w-4" aria-hidden />
              Drukuj / PDF
            </Button>
            <Button type="button" variant="secondary" className="print:hidden" onClick={() => setQrOpen(false)}>
              Zamknij
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={(o) => !o && setConfirmOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{issueUrl ? "Zresetować link zgłoszeń Serwis?" : "Wygenerować link zgłoszeń Serwis?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {issueUrl
                ? "Poprzedni link i kody QR przestaną działać natychmiast. Udostępnij nowy adres wyłącznie osobom uprawnionym."
                : "Zostanie utworzony nowy token w bazie (pole issue_qr_token) i publiczny adres pod DOMIO Serwis."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Anuluj</AlertDialogCancel>
            <Button type="button" variant={issueUrl ? "destructive" : "default"} disabled={busy} onClick={() => void runGenerate()}>
              {busy ? "Zapisywanie…" : issueUrl ? "Zresetuj" : "Generuj"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
