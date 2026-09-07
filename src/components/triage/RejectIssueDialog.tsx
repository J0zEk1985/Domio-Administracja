import { IssueReasonDialog } from "@/components/triage/IssueReasonDialog";

export type RejectIssueDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  isPending?: boolean;
};

export function RejectIssueDialog(props: RejectIssueDialogProps) {
  return (
    <IssueReasonDialog
      {...props}
      title="Odrzuć zgłoszenie"
      description="Podaj powód odrzucenia — zostanie zapisany w notatkach rozwiązania."
      confirmLabel="Odrzuć"
      placeholder="Np. duplikat zgłoszenia, poza zakresem umowy…"
    />
  );
}
