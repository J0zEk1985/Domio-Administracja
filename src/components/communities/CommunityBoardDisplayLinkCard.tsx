import { useMemo, useState } from "react";
import { Copy, ExternalLink, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRotateCommunityBoardToken } from "@/hooks/useCommunities";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

type Props = {
  communityId: string;
  orgId: string;
  boardPortalToken: string;
  canManage?: boolean;
};

type QrTarget = {
  title: string;
  url: string;
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
    console.error("[CommunityBoardDisplayLinkCard] clipboard:", e);
    toast.error("Nie udało się skopiować do schowka.");
  }
}

function LinkActions({
  url,
  qrTitle,
  onShowQr,
}: {
  url: string;
  qrTitle: string;
  onShowQr: (target: QrTarget) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => void copyText("Link", url)}>
        <Copy className="h-3.5 w-3.5" aria-hidden />
        Kopiuj link
      </Button>
      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => onShowQr({ title: qrTitle, url })}>
        <QrCode className="h-3.5 w-3.5" aria-hidden />
        Pokaż kod QR
      </Button>
      <Button type="button" variant="outline" size="sm" className="gap-1.5" asChild>
        <a href={url} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          Otwórz stronę
        </a>
      </Button>
    </div>
  );
}

export function CommunityBoardDisplayLinkCard({ communityId, orgId, boardPortalToken, canManage = false }: Props) {
  const [qrTarget, setQrTarget] = useState<QrTarget | null>(null);
  const [confirmRotateOpen, setConfirmRotateOpen] = useState(false);
  const [tokenOverride, setTokenOverride] = useState<string | null>(null);
  const rotate = useRotateCommunityBoardToken(communityId, orgId);
  const token = (tokenOverride ?? boardPortalToken).trim();
  const displayUrl = useMemo(() => `${portalBaseUrl()}/display/${communityId}`, [communityId]);
  const boardUrl = useMemo(
    () => (token ? `${portalBaseUrl()}/portal/board/${token}` : ""),
    [token],
  );

  async function onRotate() {
    try {
      const next = await rotate.mutateAsync();
      setTokenOverride(next);
      setConfirmRotateOpen(false);
    } catch {
      /* toast w hooku */
    }
  }

  return (
    <>
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Dostęp zewnętrzny</CardTitle>
          <CardDescription>
            Dwa osobne widoki: ekran ogłoszeń na budynku oraz jedna strona dla zarządu całej wspólnoty.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <section className="space-y-3" aria-labelledby="community-display-heading">
            <h3 id="community-display-heading" className="text-sm font-medium text-foreground">
              Tablica ogłoszeń
            </h3>
            <p className="text-xs text-muted-foreground">
              Publiczny ekran ogłoszeń wspólnoty — do wyświetlenia na budynku (TV / kiosk). Ten sam adres, który
              kopiujesz w module Tablica ogłoszeń.
            </p>
            <div
              className={cn(
                "rounded-md border border-border/60 bg-muted/20 px-3 py-2 font-mono text-xs break-all text-foreground",
              )}
            >
              {displayUrl}
            </div>
            <LinkActions url={displayUrl} qrTitle="Tablica ogłoszeń" onShowQr={setQrTarget} />
          </section>

          <section className="space-y-3" aria-labelledby="community-board-heading">
            <h3 id="community-board-heading" className="text-sm font-medium text-foreground">
              Portal Zarządu
            </h3>
            <p className="text-xs text-muted-foreground">
              Jedna strona dla członków zarządu wspólnoty — ogłoszenia, zgłoszenia i zadania w toku ze wszystkich
              budynków, bez logowania do panelu administracyjnego.
            </p>
            {boardUrl ? (
              <>
                <div
                  className={cn(
                    "rounded-md border border-border/60 bg-muted/20 px-3 py-2 font-mono text-xs break-all text-foreground",
                  )}
                >
                  {boardUrl}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <LinkActions url={boardUrl} qrTitle="Portal Zarządu" onShowQr={setQrTarget} />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={!canManage || rotate.isPending}
                    onClick={() => setConfirmRotateOpen(true)}
                  >
                    Zresetuj link
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">
                  Brak linku portalu Zarządu. Wygeneruj go, aby uzyskać te same akcje co przy tablicy ogłoszeń (kopiowanie,
                  kod QR, otwarcie strony).
                </p>
                <Button
                  type="button"
                  size="sm"
                  disabled={!canManage || rotate.isPending}
                  onClick={() => void onRotate()}
                >
                  {rotate.isPending ? "Zapisywanie…" : "Wygeneruj link"}
                </Button>
              </>
            )}
          </section>
        </CardContent>
      </Card>

      <Dialog open={qrTarget != null} onOpenChange={(open) => !open && setQrTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Kod QR — {qrTarget?.title}</DialogTitle>
            <DialogDescription className="font-mono text-xs break-all">{qrTarget?.url}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center py-2">
            {qrTarget?.url ? (
              <div className="rounded-lg border border-border bg-white p-4">
                <QRCodeSVG value={qrTarget.url} size={220} level="M" includeMargin />
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmRotateOpen} onOpenChange={(open) => !open && setConfirmRotateOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Zresetować link portalu Zarządu?</AlertDialogTitle>
            <AlertDialogDescription>
              Poprzedni link wspólnoty przestanie działać natychmiast. Udostępnij nowy adres członkom zarządu.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rotate.isPending}>Anuluj</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={rotate.isPending}
              onClick={() => void onRotate()}
            >
              {rotate.isPending ? "Zapisywanie…" : "Zresetuj"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
