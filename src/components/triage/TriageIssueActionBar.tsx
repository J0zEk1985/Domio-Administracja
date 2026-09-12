import { useMemo, useState } from "react";
import { Loader2, Mail, Send, XCircle } from "lucide-react";

import type { TriageIssue } from "@/hooks/useTriageIssues";
import {
  useAcceptOpenIssue,
  useAssignStaffIssue,
  useBroadcastIssue,
  useDelegateIssue,
  useRejectIssue,
  useRetryIssueEmailDispatch,
} from "@/hooks/useTriageIssueMutations";
import {
  useCancelPropertyIssue,
  useRequestPropertyIssueCancel,
} from "@/hooks/useIssueLifecycleMutations";
import { getTriageRoutingLock, type IssueMarketplaceScope } from "@/types/issueLifecycle";
import {
  issueCoordinatorBucket,
  issueCoordinatorBucketLabelPl,
  issueCoordinatorDetailPl,
  isMarketplaceWaiting,
  type IssueStatus,
} from "@/lib/triageIssueUi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { VendorPartnerCombobox } from "@/components/triage/VendorPartnerCombobox";
import { StaffAssignCombobox } from "@/components/triage/StaffAssignCombobox";
import { RejectIssueDialog } from "@/components/triage/RejectIssueDialog";
import { IssueReasonDialog } from "@/components/triage/IssueReasonDialog";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export type TriageIssueActionBarProps = {
  issue: TriageIssue;
};

function statusActionHint(
  status: IssueStatus | null | undefined,
  lock: ReturnType<typeof getTriageRoutingLock>,
  technicianName: string | null,
  marketplaceWaiting: boolean,
  emailDispatchStatus: TriageIssue["email_dispatch_status"],
): string | null {
  if (marketplaceWaiting) {
    return "Wystawione na giełdzie — czekamy, aż firma podejmie zlecenie. Możesz anulować albo przypisać samodzielnie.";
  }
  if (lock === "claimed_internal") {
    const who = technicianName ? `Podjął: ${technicianName}. ` : "";
    return `${who}Do startu prac możesz anulować zlecenie albo zmienić technika.`;
  }
  if (lock === "in_progress") {
    return "Prace w toku. Możesz złożyć wniosek o anulowanie.";
  }
  if (lock === "delegated") {
    if (emailDispatchStatus === "queued") {
      return "E-mail do firmy czeka w kolejce wysyłki.";
    }
    if (emailDispatchStatus === "failed") {
      return "Błąd wysyłki e-mail do firmy. Sprawdź adres i wyślij ponownie.";
    }
    if (emailDispatchStatus === "sent") {
      return "Wysłano e-mail do firmy. Status zmieni się po ich wiadomościach CRM.";
    }
    return "Zgłoszenie u partnera B2B. Do startu prac możesz anulować zlecenie.";
  }
  if (lock === "transfer_pending") {
    return "Wniosek o cesję czeka na zgodę kontrahenta.";
  }
  if (!status) return null;
  if (status === "new") return "Nowe zgłoszenie — możesz je zaakceptować lub odrzucić.";
  if (status === "pending_admin_approval") return "Wymaga decyzji administracyjnej.";
  return null;
}

export function TriageIssueActionBar({ issue }: TriageIssueActionBarProps) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const rejectMut = useRejectIssue();
  const cancelMut = useCancelPropertyIssue();
  const requestCancelMut = useRequestPropertyIssueCancel();
  const delegateMut = useDelegateIssue();
  const retryEmailMut = useRetryIssueEmailDispatch();
  const broadcastMut = useBroadcastIssue();
  const assignMut = useAssignStaffIssue();
  const acceptMut = useAcceptOpenIssue();

  const busy = useMemo(
    () =>
      rejectMut.isPending ||
      cancelMut.isPending ||
      requestCancelMut.isPending ||
      delegateMut.isPending ||
      retryEmailMut.isPending ||
      broadcastMut.isPending ||
      assignMut.isPending ||
      acceptMut.isPending,
    [
      rejectMut.isPending,
      cancelMut.isPending,
      requestCancelMut.isPending,
      delegateMut.isPending,
      retryEmailMut.isPending,
      broadcastMut.isPending,
      assignMut.isPending,
      acceptMut.isPending,
    ],
  );

  const status = issue.status ?? undefined;
  const lock = getTriageRoutingLock(issue);
  const technicianName = issue.assigned_staff?.full_name?.trim() || null;
  const marketplaceWaiting = isMarketplaceWaiting(issue);
  const started = Boolean(issue.started_at) || status === "in_progress";
  const bucket = issueCoordinatorBucket(issue);
  const bucketDetail = issueCoordinatorDetailPl(issue);

  if (status === "resolved" || status === "rejected" || status === "cancelled") {
    return null;
  }

  const hint = statusActionHint(
    status,
    lock,
    technicianName,
    marketplaceWaiting,
    issue.email_dispatch_status,
  );
  const canAcceptAndOpen = status === "new" || status === "pending_admin_approval";
  const canReject = lock === "unlocked" && !marketplaceWaiting;
  const canCancelNow =
    lock === "claimed_internal" || marketplaceWaiting || (lock === "delegated" && !started);
  const canRequestCancel = lock === "in_progress" || (lock === "delegated" && started);
  const canRetryEmail =
    lock === "delegated" &&
    (issue.email_dispatch_status === "failed" || issue.email_dispatch_status === "queued");
  const canBroadcast = lock === "unlocked" && !marketplaceWaiting && issue.is_public_broadcast !== true;
  const showB2b = lock === "unlocked";
  const showStaff = lock !== "in_progress" && lock !== "transfer_pending";
  const showRoutingControls = showB2b || canBroadcast || showStaff;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-3 border-b border-border bg-card px-1 pb-4 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="font-normal">
            {issueCoordinatorBucketLabelPl(bucket)}
            {bucketDetail ? ` · ${bucketDetail}` : ""}
          </Badge>
          {technicianName && (lock === "claimed_internal" || lock === "in_progress") ? (
            <Badge variant="outline" className="font-normal">
              Technik: {technicianName}
              {lock === "claimed_internal" ? " · nie rozpoczęto" : " · w realizacji"}
            </Badge>
          ) : null}
          {lock === "transfer_pending" ? (
            <Badge className="bg-amber-600/90 font-normal hover:bg-amber-600">
              Cesja oczekuje na kontrahenta
            </Badge>
          ) : null}
          {hint ? (
            <span className="text-xs text-muted-foreground md:inline hidden max-w-[min(100%,28rem)] truncate">
              {hint}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canAcceptAndOpen ? (
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              disabled={busy}
              onClick={() => acceptMut.mutate({ issueId: issue.id })}
            >
              {acceptMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Akceptuj i otwórz
            </Button>
          ) : null}

          {canReject ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={busy}
              onClick={() => setRejectOpen(true)}
            >
              <XCircle className="h-3.5 w-3.5" />
              Odrzuć
            </Button>
          ) : null}

          {canCancelNow || canRequestCancel ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={busy}
              onClick={() => setCancelOpen(true)}
            >
              <XCircle className="h-3.5 w-3.5" />
              {canRequestCancel ? "Wniosek o anulowanie" : "Anuluj zlecenie"}
            </Button>
          ) : null}

          {canRetryEmail ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="gap-1.5"
              disabled={busy}
              onClick={() =>
                retryEmailMut.mutate({
                  issueId: issue.id,
                  vendorId: issue.delegated_vendor_id,
                })
              }
            >
              {retryEmailMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Mail className="h-3.5 w-3.5" />
              )}
              Wyślij e-mail ponownie
            </Button>
          ) : null}

          {showRoutingControls ? (
            <Separator orientation="vertical" className="hidden h-6 sm:block" />
          ) : null}

          {showB2b ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Deleguj (B2B)</span>
              <VendorPartnerCombobox
                value={issue.delegated_vendor_id ?? ""}
                disabled={busy}
                onPick={(v) => {
                  delegateMut.mutate({
                    issueId: issue.id,
                    vendorId: v.id,
                    vendorName: v.name,
                  });
                }}
              />
            </div>
          ) : null}

          {canBroadcast ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="secondary" size="sm" className="gap-1.5" disabled={busy}>
                  {broadcastMut.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  Wyślij na giełdę
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-72">
                <DropdownMenuItem
                  onSelect={() =>
                    broadcastMut.mutate({ issueId: issue.id, scope: "serving" satisfies IssueMarketplaceScope })
                  }
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">Firmy obsługujące</span>
                    <span className="text-xs text-muted-foreground">
                      Tylko podmioty z umową na tę wspólnotę / budynek.
                    </span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    broadcastMut.mutate({ issueId: issue.id, scope: "all" satisfies IssueMarketplaceScope })
                  }
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">Wszystkie firmy</span>
                    <span className="text-xs text-muted-foreground">
                      Każda firma Serwis w systemie może podjąć zlecenie.
                    </span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

          {showStaff ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Wewnętrzny serwis</span>
              <StaffAssignCombobox
                value={issue.assigned_staff_id ?? ""}
                disabled={busy}
                onPick={(s) =>
                  assignMut.mutate({
                    issueId: issue.id,
                    staffId: s.userId,
                    staffName: s.fullName,
                    currentStatus: status ?? null,
                  })
                }
              />
            </div>
          ) : null}
        </div>

        {hint ? (
          <p className={cn("text-xs text-muted-foreground sm:hidden")}>{hint}</p>
        ) : null}
      </div>

      <RejectIssueDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        isPending={rejectMut.isPending}
        onConfirm={(reason) => {
          rejectMut.mutate(
            { issueId: issue.id, reason },
            { onSuccess: () => setRejectOpen(false) },
          );
        }}
      />

      <IssueReasonDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        isPending={canRequestCancel ? requestCancelMut.isPending : cancelMut.isPending}
        title={canRequestCancel ? "Wniosek o anulowanie" : "Anuluj zlecenie"}
        description={
          canRequestCancel
            ? "Technik jest w trakcie prac. Wniosek trafi do historii — zlecenie nie zostanie skasowane od razu."
            : "Technik i koordynator zobaczą powód w historii zgłoszenia."
        }
        confirmLabel={canRequestCancel ? "Wyślij wniosek" : "Anuluj zlecenie"}
        placeholder="Dlaczego anulujesz to zlecenie?"
        onConfirm={(reason) => {
          if (canRequestCancel) {
            requestCancelMut.mutate(
              { issueId: issue.id, reason },
              { onSuccess: () => setCancelOpen(false) },
            );
            return;
          }
          cancelMut.mutate(
            { issueId: issue.id, reason },
            { onSuccess: () => setCancelOpen(false) },
          );
        }}
      />
    </TooltipProvider>
  );
}
