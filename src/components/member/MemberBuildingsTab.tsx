import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemberBuildings, useToggleLocationAccess } from "@/hooks/useMemberDetails";
import type { MemberDetailsData } from "@/hooks/useMemberDetails";
type Props = {
  member: MemberDetailsData;
};

export function MemberBuildingsTab({ member }: Props) {
  const { data: buildings, isLoading, isError } = useMemberBuildings(member.membershipId, true);
  const toggle = useToggleLocationAccess(member.membershipId, member.userId);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (isError || !buildings) {
    return <p className="text-sm text-destructive">Nie udało się wczytać listy budynków.</p>;
  }

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Przypisane budynki</CardTitle>
        <CardDescription>
          Budynki aktywne w module Administracja (<code className="text-xs">is_admin_active</code>). Przełącznik
          zarządza wpisem w tabeli <code className="text-xs">location_access</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-0 divide-y rounded-md border">
        {buildings.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Brak budynków spełniających kryteria.</p>
        ) : (
          buildings.map((b) => {
            const on = b.accessId != null;

            return (
              <div
                key={b.id}
                className="flex flex-col gap-2 py-3 px-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium leading-tight">{b.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{b.address}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2 sm:pl-4">
                  <Label htmlFor={`loc-${b.id}`} className="text-xs text-muted-foreground sr-only sm:not-sr-only">
                    Dostęp
                  </Label>
                  <Switch
                    id={`loc-${b.id}`}
                    checked={on}
                    disabled={toggle.isPending}
                    onCheckedChange={(next) => {
                      toggle.mutate({
                        locationId: b.id,
                        nextOn: next,
                        existingAccessId: b.accessId,
                      });
                    }}
                  />
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
