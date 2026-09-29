import { useMemo, useState } from "react";
import { Copy, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";

type Props = {
  communityId: string;
};

export function CommunityBoardDisplayLinkCard({ communityId }: Props) {
  const [qrOpen, setQrOpen] = useState(false);
  const displayUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/display/${communityId}`;
  }, [communityId]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(displayUrl);
      toast.success("Link strony tablicy skopiowano do schowka.");
    } catch (e) {
      console.error("[CommunityBoardDisplayLinkCard] clipboard:", e);
      toast.error("Nie udało się skopiować do schowka.");
    }
  }

  return (
    <>
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Link strony dla Zarządu</CardTitle>
          <CardDescription>
            Publiczny ekran ogłoszeń wspólnoty (TV / kiosk). Bez logowania do panelu.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 font-mono text-xs break-all text-foreground">
            {displayUrl}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => void copyLink()}>
              <Copy className="h-3.5 w-3.5" aria-hidden />
              Kopiuj link
            </Button>
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setQrOpen(true)}>
              <QrCode className="h-3.5 w-3.5" aria-hidden />
              Pokaż kod QR
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Kod QR — strona tablicy</DialogTitle>
            <DialogDescription className="font-mono text-xs break-all">{displayUrl}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center py-2">
            <div className="rounded-lg border border-border bg-white p-4">
              <QRCodeSVG value={displayUrl} size={220} level="M" includeMargin />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
