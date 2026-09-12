import { AlertTriangle } from "lucide-react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type DeactivateCommunityDialogProps = {
  open: boolean;
  communityName: string;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function DeactivateCommunityDialog({
  open,
  communityName,
  pending,
  onOpenChange,
  onConfirm,
}: DeactivateCommunityDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Dezaktywować wspólnotę?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">{communityName}</span> zniknie z
                aktywnego zasobu Twojej organizacji. Wpisy (przeglądy, usterki, umowy) zostają w
                archiwum — nic nie kasujemy.
              </p>
              <p>Mandat głównego zarządcy zostanie zakończony. Inny podmiot w DOMIO będzie mógł przejąć obsługę tej wspólnoty.</p>
              <p className="flex gap-2 rounded-md border border-border/60 bg-muted/40 p-3 text-foreground/90">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                <span>
                  Bez sukcesji nowy zarządca nie zobaczy przeglądów ani historii. Oficjalne ogłoszenia
                  (e-tablica) i ogłoszenia lokatorów w Home też nie przechodzą.
                </span>
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Anuluj</AlertDialogCancel>
          <Button type="button" variant="destructive" disabled={pending} onClick={onConfirm}>
            {pending ? "Dezaktywowanie…" : "Dezaktywuj"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
