import { useMemo, useState } from "react";
import { Loader2, Send, XCircle } from "lucide-react";

import type { TriageIssue } from "@/hooks/useTriageIssues";
import {
  useAcceptOpenIssue,
  useAssignStaffIssue,
  useBroadcastIssue,
  useDelegateIssue,
  useRejectIssue,
} from "@/hooks/useTriageIssueMutations";
import {
  useCancelPropertyIssue,
  useRequestPropertyIssueCancel,
  useRequestPropertyIssueTransfer,
} from "@/hooks/useIssueLifecycleMutations";
import { getTriageRoutingLock } from "@/types/issueLifecycle";
import { issueStatusLabelPl, type IssueStatus } from "@/lib/triageIssueUi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
): string | null {
  if (lock === "claimed_internal") {
    const who = technicianName ? `Podjął: ${technicianName}. ` : "";
    return `${who}Do startu prac możesz anulować zlecenie. Giełda i zmiana firmy wymagają cesji.`;
  }
  if (lock === "in_progress") {
    return "Prace w toku. Giełda i B2B zablokowane. Możesz złożyć wniosek o anulowanie.";
  }
  if (lock === "transfer_pending") {
    return "Wniosek o cesję czeka na zgodę kontrahenta.";
  }
  if (!status) return null;
  if (status === "new") return "Nowe zgłoszenie — możesz je zaakceptować lub odrzucić.";
  if (status === "delegated") return "Zgłoszenie u partnera B2B — dalsza zmiana firmy wymaga zgody kontrahenta.";
  if (status === "waiting_for_parts") return "Oczekiwanie na części.";
  if (status === "pending_admin_approval") return "Wymaga decyzji administracyjnej.";
  return null;
}

export function TriageIssueActionBar({ issue }: TriageIssueActionBarProps) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [pendingVendor, setPendingVendor] = useState<{ id: string; name: string } | null>(null);

  const rejectMut = useRejectIssue();
  const cancelMut = useCancelPropertyIssue();
  const requestCancelMut = useRequestPropertyIssueCancel();
  const requestTransferMut = useRequestPropertyIssueTransfer();
  const delegateMut = useDelegateIssue();
  const broadcastMut = useBroadcastIssue();
  const assignMut = useAssignStaffIssue();
  const acceptMut = useAcceptOpenIssue();

  const busy = useMemo(
    () =>
      rejectMut.isPending ||
      cancelMut.isPending ||
      requestCancelMut.isPending ||
      requestTransferMut.isPending ||
      delegateMut.isPending ||
      broadcastMut.isPending ||
      assignMut.isPending ||
      acceptMut.isPending,
    [
      rejectMut.isPending,
      cancelMut.isPending,
      requestCancelMut.isPending,
      requestTransferMut.isPending,
      delegateMut.isPending,
      broadcastMut.isPending,
      assignMut.isPending,
      acceptMut.isPending,
    ],
  );

  const status = issue.status ?? undefined;
  const lock = getTriageRoutingLock(issue);
  const technicianName = issue.assigned_staff?.full_name?.trim() || null;

  if (status === "resolved" || status === "rejected" || status === "cancelled") {
    return null;
  }

  const hint = statusActionHint(status, lock, technicianName);
  const canAcceptAndOpen = status === "new" || status === "pending_admin_approval";
  const broadcastDone = issue.is_public_broadcast === true;
  const canReject = lock === "unlocked";
  const canCancelNow = lock === "claimed_internal";
  const canRequestCancel = lock === "in_progress";
  const canBroadcast = lock === "unlocked" && !broadcastDone;
  const canDirectDelegate = lock === "unlocked";
  const canRequestTransfer =
    lock === "claimed_internal" || lock === "in_progress" || lock === "delegated";
  const routingLocked = !canBroadcast;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-3 border-b border-border bg-card px-1 pb-4 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="font-normal">
            {issueStatusLabelPl(status)}
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

          <Separator orientation="vertical" className="hidden h-6 sm:block" />

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {canDirectDelegate ? "Deleguj (B2B)" : "Cesja (B2B)"}
            </span>
            <VendorPartnerCombobox
              value={issue.delegated_vendor_id ?? ""}
              disabled={busy || lock === "transfer_pending" || (!canDirectDelegate && !canRequestTransfer)}
              onPick={(v) => {
                if (canDirectDelegate) {
                  delegateMut.mutate({
                    issueId: issue.id,
                    vendorId: v.id,
                    vendorName: v.name,
                  });
                  return;
                }
                setPendingVendor({ id: v.id, name: v.name });
                setTransferOpen(true);
              }}
            />
          </div>

          {broadcastDone ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button type="button" variant="secondary" size="sm" className="gap-1.5" disabled>
                    <Send className="h-3.5 w-3.5" />
                    Wyślij na giełdę
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Już widoczne na giełdzie.</TooltipContent>
            </Tooltip>
          ) : routingLocked ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button type="button" variant="secondary" size="sm" className="gap-1.5" disabled>
                    <Send className="h-3.5 w-3.5" />
                    Wyślij na giełdę
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Zlecenie podjęte lub delegowane — giełda wymaga autoryzowanej cesji.
              </TooltipContent>
            </Tooltip>
          ) : (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="gap-1.5"
              disabled={busy}
              onClick={() => broadcastMut.mutate({ issueId: issue.id })}
            >
              {broadcastMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Wyślij na giełdę
            </Button>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Wewnętrzny serwis</span>
            <StaffAssignCombobox
              value={issue.assigned_staff_id ?? ""}
              disabled={busy || lock === "in_progress"}
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

      <IssueReasonDialog
        open={transferOpen}
        onOpenChange={(open) => {
          setTransferOpen(open);
          if (!open) setPendingVendor(null);
        }}
        isPending={requestTransferMut.isPending}
        title="Wniosek o cesję B2B"
        description={
          pendingVendor
            ? `Firma „${pendingVendor.name}” musi zaakceptować przejęcie. Dopóki nie wyrazi zgody, technik zostaje przy zleceniu.`
            : "Wybierz firmę i podaj powód."
        }
        confirmLabel="Wyślij wniosek"
        confirmVariant="default"
        placeholder="Dlaczego przekazujesz zlecenie tej firmie?"
        onConfirm={(reason) => {
          if (!pendingVendor) return;
          requestTransferMut.mutate(
            { issueId: issue.id, vendorId: pendingVendor.id, reason },
            {
              onSuccess: () => {
                setTransferOpen(false);
                setPendingVendor(null);
              },
            },
          );
        }}
      />
    </TooltipProvider>
  );
}
