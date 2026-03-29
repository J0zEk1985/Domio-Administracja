import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useIsOrgOwner } from "@/hooks/useIsOrgOwner";
import { useMemberDetails } from "@/hooks/useMemberDetails";
import { MemberProfileRoleTab } from "@/components/member/MemberProfileRoleTab";
import { MemberBuildingsTab } from "@/components/member/MemberBuildingsTab";
import { MemberLeaveTab } from "@/components/member/MemberLeaveTab";

function MemberDetailsPageSkeleton() {
  return (
    <div className="flex-1 space-y-6 p-6">
      <Skeleton className="h-9 w-56" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-10 w-full max-w-md" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}

export default function MemberDetails() {
  const { id: membershipId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: ownerAccess, isLoading: ownerLoading } = useIsOrgOwner();
  const canAccess = ownerAccess?.isOwner === true;

  const memberQuery = useMemberDetails(membershipId, Boolean(membershipId && canAccess));

  if (!membershipId) {
    return <Navigate to="/team" replace />;
  }

  if (!ownerLoading && !canAccess) {
    return <Navigate to="/dashboard" replace />;
  }

  if (ownerLoading || (canAccess && memberQuery.isLoading)) {
    return <MemberDetailsPageSkeleton />;
  }

  if (canAccess && memberQuery.isError) {
    return (
      <div className="flex-1 space-y-4 p-6">
        <Button type="button" variant="ghost" size="sm" className="gap-2 -ml-2" onClick={() => navigate("/team")}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Wróć do listy zespołu
        </Button>
        <Alert variant="destructive">
          <AlertDescription>
            {memberQuery.error instanceof Error
              ? memberQuery.error.message
              : "Nie udało się wczytać danych pracownika."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const member = memberQuery.data;
  if (!member) {
    return null;
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      <div>
        <Button type="button" variant="ghost" size="sm" className="gap-2 -ml-2 mb-4" onClick={() => navigate("/team")}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Wróć do listy zespołu
        </Button>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{member.fullName}</h1>
        <p className="text-sm text-muted-foreground mt-1">{member.email}</p>
      </div>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="grid w-full max-w-xl grid-cols-3">
          <TabsTrigger value="profile">Profil i rola</TabsTrigger>
          <TabsTrigger value="buildings">Przypisane budynki</TabsTrigger>
          <TabsTrigger value="leave">Urlopy i zastępstwa</TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="mt-6">
          <MemberProfileRoleTab member={member} />
        </TabsContent>
        <TabsContent value="buildings" className="mt-6">
          <MemberBuildingsTab member={member} />
        </TabsContent>
        <TabsContent value="leave" className="mt-6">
          <MemberLeaveTab member={member} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
