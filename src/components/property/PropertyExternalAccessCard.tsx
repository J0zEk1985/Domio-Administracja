import { useMemo, useState } from "react";
import { Copy, Printer, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { PropertyDetail } from "@/hooks/useProperties";
import { useRotateLocationToken } from "@/hooks/usePropertyTokens";
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

type Props = {
  property: PropertyDetail;
  /** Owner lub administrator budynku — może rotować tokeny. */
  canManage: boolean;
  accessPending?: boolean;
};

function portalBaseUrl(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

async function copyText(label: string, text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} skopiowano do schowka.`);
  } catch (e) {
    console.error("[PropertyExternalAccessCard] clipboard:", e);
    toast.error("Nie udało się skopiować do schowka.");
  }
}

export function PropertyExternalAccessCard({ property, canManage, accessPending }: Props) {
  const rotate = useRotateLocationToken(property.id);
  const [qrOpen, setQrOpen] = useState(false);
  const [confirmRotateOpen, setConfirmRotateOpen] = useState(false);

  const boardUrl = useMemo(
    () => `${portalBaseUrl()}/portal/board/${property.boardPortalToken}`,
    [property.boardPortalToken],
  );

  async function confirmRotateAction() {
    try {
      await rotate.mutateAsync();
      setConfirmRotateOpen(false);
    } catch {
      /* toast w hooku */
    }
  }

  const busy = rotate.isPending;

  return (
    <>
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Dostęp zewnętrzny</CardTitle>
          <CardDescription>
            Bezpieczny link z tokenem dla gości (Zarząd). Udostępniaj tylko zaufanym osobom.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          {accessPending && (
            <p className="text-xs text-muted-foreground" role="status">
              Sprawdzanie uprawnień do zarządzania linkami…
            </p>
          )}

          <section className="space-y-3" aria-labelledby="portal-board-heading">
            <h3 id="portal-board-heading" className="text-sm font-medium text-foreground">
              Portal Zarządu
            </h3>
            <p className="text-xs text-muted-foreground">
              Publiczny adres dla członków zarządu wspólnoty — bez logowania do panelu administracyjnego.
            </p>
            <div
              className={cn(
                "rounded-md border border-border/60 bg-muted/20 px-3 py-2 font-mono text-xs break-all text-foreground",
              )}
            >
              {boardUrl}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => void copyText("Link", boardUrl)}
              >
                <Copy className="h-3.5 w-3.5" aria-hidden />
                Kopiuj link
              </Button>
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setQrOpen(true)}>
                <QrCode className="h-3.5 w-3.5" aria-hidden />
                Pokaż kod QR
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={!canManage || busy || accessPending}
                onClick={() => setConfirmRotateOpen(true)}
              >
                Zresetuj link
              </Button>
            </div>
          </section>

          {!canManage && !accessPending && (
            <p className="text-xs text-muted-foreground">
              Tylko właściciel organizacji lub administrator przypisany do budynku może zresetować linki.
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={qrOpen} onOpenChange={(o) => !o && setQrOpen(false)}>
        <DialogContent className="sm:max-w-md print:border-0 print:shadow-none">
          <DialogHeader>
            <DialogTitle>Kod QR — Portal Zarządu</DialogTitle>
            <DialogDescription className="font-mono text-xs break-all">{boardUrl}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2 print:py-4">
            {boardUrl ? (
              <div className="rounded-lg border border-border bg-white p-4 print:border-0">
                <QRCodeSVG value={boardUrl} size={220} level="M" includeMargin />
              </div>
            ) : null}
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="gap-2 print:hidden"
              onClick={() => {
                window.print();
              }}
            >
              <Printer className="h-4 w-4" aria-hidden />
              Drukuj / zapisz jako PDF
            </Button>
            <Button type="button" variant="secondary" className="print:hidden" onClick={() => setQrOpen(false)}>
              Zamknij
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmRotateOpen} onOpenChange={(o) => !o && setConfirmRotateOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Zresetować link portalu Zarządu?</AlertDialogTitle>
            <AlertDialogDescription>
              Poprzedni link przestanie działać natychmiast. Udostępnij nowy adres osobom uprawnionym.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Anuluj</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => void confirmRotateAction()}
            >
              {busy ? "Zapisywanie…" : "Zresetuj"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
