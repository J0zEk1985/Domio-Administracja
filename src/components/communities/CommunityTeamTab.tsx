import { useNavigate } from "react-router-dom";
import { Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCommunityTeamMembers } from "@/hooks/useProperties";

type CommunityTeamTabProps = {
  communityId: string;
};

export function CommunityTeamTab({ communityId }: CommunityTeamTabProps) {
  const navigate = useNavigate();
  const teamQuery = useCommunityTeamMembers(communityId, Boolean(communityId));

  if (teamQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  if (teamQuery.isError) {
    return (
      <p className="text-sm text-destructive">
        {teamQuery.error instanceof Error
          ? teamQuery.error.message
          : "Nie udało się wczytać zespołu przypisanego do wspólnoty."}
      </p>
    );
  }

  const rows = teamQuery.data ?? [];

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
          Zespół we wspólnocie
        </CardTitle>
        <CardDescription>
          Administratorzy budynków przypisanych do tej wspólnoty (deduplikacja po osobie; kolumna „Budynki” pokazuje
          zakres dostępu).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            Brak przypisanych administratorów dla budynków tej wspólnoty.
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Imię i nazwisko</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Budynki</TableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.userId}>
                    <TableCell className="font-medium">{row.fullName}</TableCell>
                    <TableCell className="text-muted-foreground">{row.email}</TableCell>
                    <TableCell className="max-w-[280px] text-sm text-muted-foreground">
                      {row.buildingNames.join(", ")}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.membershipId ? (
                        <Button
                          type="button"
                          variant="link"
                          className="h-auto p-0 text-sm"
                          onClick={() => navigate(`/team/${row.membershipId}`)}
                        >
                          Profil
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
