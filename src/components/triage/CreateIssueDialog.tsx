import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CreateIssueForm } from "@/components/triage/CreateIssueForm";

export type CreateIssueDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Preselects building (np. karta nieruchomości). */
  defaultLocationId?: string;
};

/**
 * Modal wrapper around {@link CreateIssueForm} (single source of truth for fields).
 */
export function CreateIssueDialog({ open, onOpenChange, defaultLocationId }: CreateIssueDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nowe zgłoszenie</DialogTitle>
          <DialogDescription>
            Zgłoszenie trafia do lejka jako „Nowe”. Routing i wykonawca wynikają z reguł organizacji — tutaj
            opisujesz tylko potrzebę.
          </DialogDescription>
        </DialogHeader>

        <CreateIssueForm
          defaultLocationId={defaultLocationId}
          enabled={open}
          onCancel={() => onOpenChange(false)}
          onSuccess={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
