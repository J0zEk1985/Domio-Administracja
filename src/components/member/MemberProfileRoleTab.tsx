import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { useUpdateMemberRole } from "@/hooks/useMemberDetails";
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
};

export function MemberProfileRoleTab({ member }: Props) {
  const [role, setRole] = useState(member.roleCode);
  const updateRole = useUpdateMemberRole(member.membershipId);

  useEffect(() => {
    setRole(member.roleCode);
  }, [member.roleCode]);

  const dirty = role !== member.roleCode;
  const validRole = ROLE_OPTIONS.some((o) => o.value === role);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!validRole || !dirty) return;
    updateRole.mutate(role);
  }

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Profil i rola</CardTitle>
        <CardDescription>
          Rola w organizacji jest przechowywana w tabeli członkostw. Dozwolone są wyłącznie role administracyjne.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="max-w-md space-y-4">
          <div className="space-y-2">
            <Label>Rola w organizacji</Label>
            <Select value={role} onValueChange={setRole} disabled={updateRole.isPending}>
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
          <Button type="submit" disabled={!dirty || !validRole || updateRole.isPending} className="gap-2">
            {updateRole.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Zapisywanie…
              </>
            ) : (
              "Zapisz rolę"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
