import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { TEAM_MEMBERS_QUERY_KEY } from "@/hooks/useTeamMembers";
import { linkAdminTeamMember, type AdminTeamRoleCode } from "@/lib/linkTeamMember";

const ROLE_OPTIONS: { value: AdminTeamRoleCode; label: string }[] = [
  { value: "owner", label: "Właściciel" },
  { value: "admin", label: "Administrator" },
  { value: "assistant", label: "Asystent" },
  { value: "accountant", label: "Księgowa" },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AddTeamMemberDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminTeamRoleCode>("assistant");

  useEffect(() => {
    if (!open) {
      setEmail("");
      setRole("assistant");
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: async () => {
      await linkAdminTeamMember(email, role);
    },
    onSuccess: () => {
      toast.success("Dodano pracownika do organizacji.");
      onOpenChange(false);
      void queryClient.invalidateQueries({ queryKey: [TEAM_MEMBERS_QUERY_KEY] });
    },
    onError: (err: unknown) => {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : "Nie udało się dodać pracownika.";
      toast.error(message);
      console.error("[AddTeamMemberDialog]", err);
    },
  });

  const isPending = mutation.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dodaj pracownika</DialogTitle>
          <DialogDescription>
            Wpisz adres e-mail konta zarejestrowanego w DOMIO (pełne konto). Użytkownik otrzyma dostęp do organizacji z
            wybraną rolą administracyjną.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="add-member-email">E-mail</Label>
            <Input
              id="add-member-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isPending}
              placeholder="jan.kowalski@firma.pl"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-member-role">Rola</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as AdminTeamRoleCode)}
              disabled={isPending}
            >
              <SelectTrigger id="add-member-role">
                <SelectValue placeholder="Wybierz rolę" />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Anuluj
            </Button>
            <Button type="submit" disabled={isPending} className="gap-2 min-w-[120px]">
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Zapisywanie…
                </>
              ) : (
                "Dodaj"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
