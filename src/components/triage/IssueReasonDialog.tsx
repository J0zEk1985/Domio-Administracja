import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export type IssueReasonDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  isPending?: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  confirmVariant?: "destructive" | "default";
  placeholder?: string;
  reasonLabel?: string;
};

export function IssueReasonDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending = false,
  title,
  description,
  confirmLabel,
  confirmVariant = "destructive",
  placeholder = "Minimum 3 znaki…",
  reasonLabel = "Powód",
}: IssueReasonDialogProps) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) setReason("");
  }, [open]);

  const trimmed = reason.trim();
  const canSubmit = trimmed.length >= 3 && !isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="issue-reason">{reasonLabel}</Label>
          <Textarea
            id="issue-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={placeholder}
            rows={4}
            disabled={isPending}
            className="resize-none"
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Wróć
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            disabled={!canSubmit}
            onClick={() => onConfirm(trimmed)}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
