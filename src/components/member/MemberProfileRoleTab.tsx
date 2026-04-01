import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { MemberDetailsData } from "@/hooks/useMemberDetails";
import { useUpdateMemberPhone, useUpdateMemberRole } from "@/hooks/useMemberDetails";
import { TEAM_ADMIN_ROLES } from "@/hooks/useTeamMembers";

const ROLE_OPTIONS: { value: (typeof TEAM_ADMIN_ROLES)[number]; label: string }[] = [
  { value: "owner", label: "Właściciel" },
  { value: "admin", label: "Administrator" },
  { value: "coordinator", label: "Koordynator" },
  { value: "assistant", label: "Asystent" },
  { value: "accountant", label: "Księgowa" },
];

type Props = {
  member: MemberDetailsData;
  /** Owner-only: edycja roli i telefonu; dla pozostałych ról widok tylko do odczytu. */
  canEdit?: boolean;
};

export function MemberProfileRoleTab({ member, canEdit = true }: Props) {
  const [role, setRole] = useState(member.roleCode);
  const [phone, setPhone] = useState(member.phone);
  const updateRole = useUpdateMemberRole(member.membershipId);
  const updatePhone = useUpdateMemberPhone(member.membershipId);

  useEffect(() => {
    setRole(member.roleCode);
  }, [member.roleCode]);

  useEffect(() => {
    setPhone(member.phone);
  }, [member.phone]);

  const roleDirty = role !== member.roleCode;
  const phoneDirty = phone !== member.phone;
  const anyDirty = roleDirty || phoneDirty;
  const validRole = ROLE_OPTIONS.some((o) => o.value === role);

  const saving = updateRole.isPending || updatePhone.isPending;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit || !anyDirty) return;
    if (roleDirty && !validRole) return;

    const tasks: Promise<unknown>[] = [];
    if (roleDirty && validRole) {
      tasks.push(updateRole.mutateAsync(role));
    }
    if (phoneDirty) {
      tasks.push(updatePhone.mutateAsync(phone));
    }
    if (tasks.length === 0) return;

    try {
      await Promise.all(tasks);
    } catch {
      /* toasty w hookach */
    }
  }

  const authEmailDisplay = member.authEmail.trim() !== "" ? member.authEmail : "—";

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Profil i rola</CardTitle>
        <CardDescription>
          E-mail logowania jest stały. Rolę i telefon zapisujesz w organizacji (uprawnienia wg roli).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="max-w-lg space-y-4">
          <div className="space-y-2">
            <Label htmlFor="member-auth-email">E-mail (konto)</Label>
            <Input
              id="member-auth-email"
              type="text"
              autoComplete="off"
              value={authEmailDisplay}
              readOnly
              disabled
              className="bg-muted/40"
              aria-readonly="true"
            />
            <p className="text-[11px] text-muted-foreground">
              Adres powiązany z kontem — nie edytujemy go w tym panelu.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="member-phone">Telefon</Label>
            <Input
              id="member-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={saving || !canEdit}
              placeholder="np. +48 …"
              className={!canEdit ? "bg-muted/40" : undefined}
            />
            <p className="text-[11px] text-muted-foreground">Przechowywany w tabeli profiles (pole phone).</p>
          </div>

          <div className="space-y-2">
            <Label>Rola w organizacji</Label>
            <Select value={role} onValueChange={setRole} disabled={saving || !canEdit}>
              <SelectTrigger>
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

          {canEdit ? (
            <Button
              type="submit"
              disabled={!anyDirty || (roleDirty && !validRole) || saving}
              className="gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Zapisywanie…
                </>
              ) : (
                "Zapisz zmiany"
              )}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">Tylko właściciel może zmieniać rolę i telefon w organizacji.</p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
