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
import { issueStatusLabelPl, type IssueStatus } from "@/lib/triageIssueUi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { VendorPartnerCombobox } from "@/components/triage/VendorPartnerCombobox";
import { StaffAssignCombobox } from "@/components/triage/StaffAssignCombobox";
import { RejectIssueDialog } from "@/components/triage/RejectIssueDialog";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export type TriageIssueActionBarProps = {
  issue: TriageIssue;
};

function statusActionHint(status: IssueStatus | null | undefined): string | null {
  if (!status) return null;
  if (status === "new") return "Nowe zgłoszenie — możesz je zaakceptować lub odrzucić.";
  if (status === "delegated") return "Zgłoszenie jest u partnera B2B — nadal możesz zmienić routing.";
  if (status === "waiting_for_parts") return "Oczekiwanie na części — rozważ giełdę lub delegację.";
  if (status === "pending_admin_approval") return "Wymaga decyzji administracyjnej.";
  return null;
}

export function TriageIssueActionBar({ issue }: TriageIssueActionBarProps) {
  const [rejectOpen, setRejectOpen] = useState(false);

  const rejectMut = useRejectIssue();
  const delegateMut = useDelegateIssue();
  const broadcastMut = useBroadcastIssue();
  const assignMut = useAssignStaffIssue();
  const acceptMut = useAcceptOpenIssue();

  const busy = useMemo(
    () =>
      rejectMut.isPending ||
      delegateMut.isPending ||
      broadcastMut.isPending ||
      assignMut.isPending ||
      acceptMut.isPending,
    [
      rejectMut.isPending,
      delegateMut.isPending,
      broadcastMut.isPending,
      assignMut.isPending,
      acceptMut.isPending,
    ],
  );

  const status = issue.status ?? undefined;
  if (status === "resolved" || status === "rejected") {
    return null;
  }

  const hint = statusActionHint(status);
  const isNew = status === "new";
  const broadcastDone = issue.is_public_broadcast === true;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-3 border-b border-border/60 bg-muted/10 px-1 pb-4 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="font-normal">
            {issueStatusLabelPl(status)}
          </Badge>
          {hint ? (
            <span className="text-xs text-muted-foreground md:inline hidden max-w-[min(100%,28rem)] truncate">
              {hint}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isNew ? (
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

          <Separator orientation="vertical" className="hidden h-6 sm:block" />

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Deleguj (B2B)</span>
            <VendorPartnerCombobox
              value={issue.delegated_vendor_id ?? ""}
              disabled={busy}
              onPick={(v) =>
                delegateMut.mutate({
                  issueId: issue.id,
                  vendorId: v.id,
                  vendorName: v.name,
                })
              }
            />
          </div>

          {broadcastDone ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="gap-1.5"
                    disabled
                  >
                    <Send className="h-3.5 w-3.5" />
                    Wyślij na giełdę
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Już widoczne na giełdzie.</TooltipContent>
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
              disabled={busy}
              onPick={(s) =>
                assignMut.mutate({
                  issueId: issue.id,
                  staffId: s.userId,
                  staffName: s.fullName,
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
            {
              onSuccess: () => setRejectOpen(false),
            },
          );
        }}
      />
    </TooltipProvider>
  );
}
