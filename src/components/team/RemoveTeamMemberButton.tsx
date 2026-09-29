import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDeactivateTeamMember, type TeamMemberRow } from "@/hooks/useTeamMembers";

type Props = {
  row: TeamMemberRow;
  currentUserId: string | null;
  ownerCount: number;
};

export function RemoveTeamMemberButton({ row, currentUserId, ownerCount }: Props) {
  const [open, setOpen] = useState(false);
  const mutation = useDeactivateTeamMember();
  const isSelf = Boolean(currentUserId && row.userId === currentUserId);
  const isLastOwner = row.roleCode.trim().toLowerCase() === "owner" && ownerCount <= 1;
  const blocked = isSelf || isLastOwner;
  const blockedHint = isSelf
    ? "Nie możesz usunąć własnego konta."
    : isLastOwner
      ? "Nie można usunąć ostatniego właściciela."
      : undefined;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={blocked || mutation.isPending}
        title={blockedHint}
        className="text-xs border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive hover:border-destructive/70"
        onClick={(e) => {
          e.stopPropagation();
          if (blocked) return;
          setOpen(true);
        }}
      >
        Usuń
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Usunąć pracownika z zespołu?</AlertDialogTitle>
            <AlertDialogDescription>
              {row.fullName} ({row.email}) straci dostęp administracyjny do organizacji i przypisanych
              budynków. Konto w systemie DOMIO pozostanie — możesz dodać tę osobę ponownie później.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>Anuluj</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={mutation.isPending}
              onClick={() => {
                mutation.mutate(row.membershipId, {
                  onSuccess: () => setOpen(false),
                });
              }}
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Usuwanie…
                </>
              ) : (
                "Usuń"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
