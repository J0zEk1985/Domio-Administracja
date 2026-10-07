/**
 * Community Warranty Tab - Usterki deweloperskie dla danej Wspólnoty
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  Trash2,
  FileText,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  useDeveloperAccess,
  useWarrantyIssues,
  useCommunityWarrantySettings,
  useUpdateCommunityWarrantySettings,
  useDeleteWarrantyIssue,
  useUpdateWarrantyIssueStatus,
} from "@/hooks/useDeveloperWarranty";
import {
  DEVELOPER_WARRANTY_ISSUE_STATUS_LABELS,
  DEVELOPER_WARRANTY_ISSUE_PRIORITY_LABELS,
  type DeveloperWarrantyIssue,
  type DeveloperWarrantyIssueStatus,
} from "@/types/developer-warranty";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { toast } from "@/components/ui/sonner";
import { CreateWarrantyIssueDialog } from "./CreateWarrantyIssueDialog";
import { DeveloperAccessCard } from "./DeveloperAccessCard";
import { ResidentWarrantyLinkPreview } from "./ResidentWarrantyLinkPreview";

interface CommunityWarrantyTabProps {
  communityId: string;
  communityName: string;
  orgId: string;
  canManage: boolean;
}

export function CommunityWarrantyTab({
  communityId,
  communityName,
  orgId,
  canManage,
}: CommunityWarrantyTabProps) {
  const [createIssueOpen, setCreateIssueOpen] = useState(false);
  const [editingIssue, setEditingIssue] = useState<DeveloperWarrantyIssue | null>(null);
  const [deleteIssueId, setDeleteIssueId] = useState<string | null>(null);

  const { data: developerAccess, isLoading: accessLoading } = useDeveloperAccess(communityId);
  const { data: issues, isLoading: issuesLoading } = useWarrantyIssues({ community_id: communityId });
  const { data: settings, isLoading: settingsLoading } = useCommunityWarrantySettings(communityId);

  const updateSettingsMutation = useUpdateCommunityWarrantySettings();
  const deleteIssueMutation = useDeleteWarrantyIssue();
  const updateStatusMutation = useUpdateWarrantyIssueStatus();

  const handleToggleResidentVisibility = async (enabled: boolean) => {
    try {
      await updateSettingsMutation.mutateAsync({
        communityId,
        orgId,
        dto: { resident_visibility_enabled: enabled },
      });
      toast.success(
        enabled
          ? "Widoczność usterek dla mieszkańców została włączona"
          : "Widoczność usterek dla mieszkańców została wyłączona"
      );
    } catch (error) {
      toast.error("Nie udało się zmienić ustawień");
      console.error(error);
    }
  };

  const handleDeleteIssue = async (issueId: string) => {
    try {
      await deleteIssueMutation.mutateAsync({ issueId, communityId });
      toast.success("Usterka została usunięta");
      setDeleteIssueId(null);
    } catch (error) {
      toast.error("Nie udało się usunąć usterki");
      console.error(error);
    }
  };

  const handlePublishIssue = async (issueId: string) => {
    try {
      await updateStatusMutation.mutateAsync({
        issueId,
        dto: { new_status: "reported" },
      });
      toast.success("Usterka została opublikowana i jest widoczna dla dewelopera");
    } catch (error) {
      toast.error("Nie udało się opublikować usterki");
      console.error(error);
    }
  };

  const getStatusIcon = (status: DeveloperWarrantyIssueStatus) => {
    switch (status) {
      case "draft":
        return <FileText className="h-4 w-4" />;
      case "reported":
        return <AlertCircle className="h-4 w-4" />;
      case "acknowledged":
      case "in_progress":
        return <Clock className="h-4 w-4" />;
      case "completed":
        return <CheckCircle2 className="h-4 w-4" />;
      case "rejected":
        return <XCircle className="h-4 w-4" />;
      case "appealed":
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: DeveloperWarrantyIssueStatus) => {
    switch (status) {
      case "draft":
        return "bg-gray-500/10 text-gray-600 dark:text-gray-400";
      case "reported":
        return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
      case "acknowledged":
      case "in_progress":
        return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400";
      case "completed":
        return "bg-green-500/10 text-green-600 dark:text-green-400";
      case "rejected":
        return "bg-red-500/10 text-red-600 dark:text-red-400";
      case "appealed":
        return "bg-orange-500/10 text-orange-600 dark:text-orange-400";
    }
  };

  const stats = issues
    ? {
        total: issues.length,
        draft: issues.filter((i) => i.status === "draft").length,
        active: issues.filter((i) =>
          ["reported", "acknowledged", "in_progress", "appealed"].includes(i.status)
        ).length,
        completed: issues.filter((i) => i.status === "completed").length,
      }
    : null;

  if (accessLoading || issuesLoading || settingsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DeveloperAccessCard
        communityId={communityId}
        communityName={communityName}
        canManage={canManage}
        developerAccess={developerAccess ?? null}
      />

      {/* Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle>Ustawienia widoczności</CardTitle>
          <CardDescription>
            Kontroluj, kto ma dostęp do przeglądania usterek deweloperskich
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="resident-visibility" className="text-base">
                Widoczność dla mieszkańców
              </Label>
              <p className="text-sm text-muted-foreground">
                Mieszkańcy będą mogli przeglądać usterki w aplikacji Home
              </p>
            </div>
            <Switch
              id="resident-visibility"
              checked={settings?.resident_visibility_enabled ?? false}
              onCheckedChange={handleToggleResidentVisibility}
              disabled={!canManage || updateSettingsMutation.isPending}
            />
          </div>
          {settings?.resident_visibility_enabled && settings.public_view_token ? (
            <ResidentWarrantyLinkPreview token={settings.public_view_token} />
          ) : null}
        </CardContent>
      </Card>

      {/* Issues Stats */}
      {stats && stats.total > 0 && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Wszystkie</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Szkice</CardTitle>
              <FileText className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.draft}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Aktywne</CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.active}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Zrealizowane</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.completed}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Issues List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Usterki</CardTitle>
              <CardDescription>
                {issues && issues.length > 0
                  ? `Wyświetlono ${issues.length} ${issues.length === 1 ? "usterkę" : "usterek"}`
                  : "Lista usterek dla tej Wspólnoty"}
              </CardDescription>
            </div>
            {canManage && (
              <Button
                onClick={() => {
                  setEditingIssue(null);
                  setCreateIssueOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Dodaj usterkę
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!issues || issues.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Brak usterek</h3>
              <p className="text-muted-foreground mb-4">
                Nie dodano jeszcze żadnych usterek deweloperskich dla tej Wspólnoty
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {issues.map((issue) => (
                <Card key={issue.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <Link
                            to={`/developer-warranty/${issue.id}`}
                            className="font-semibold text-lg truncate hover:underline"
                          >
                            {issue.title}
                          </Link>
                          <Badge variant="outline" className={getStatusColor(issue.status)}>
                            <span className="flex items-center gap-1.5">
                              {getStatusIcon(issue.status)}
                              {DEVELOPER_WARRANTY_ISSUE_STATUS_LABELS[issue.status]}
                            </span>
                          </Badge>
                          <Badge variant="outline">
                            {DEVELOPER_WARRANTY_ISSUE_PRIORITY_LABELS[issue.priority]}
                          </Badge>
                        </div>

                        {issue.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                            {issue.description}
                          </p>
                        )}

                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          {issue.category && <span>{issue.category}</span>}
                          {issue.location_detail && (
                            <>
                              <span>•</span>
                              <span>{issue.location_detail}</span>
                            </>
                          )}
                          <span>•</span>
                          <span>
                            {format(new Date(issue.created_at), "d MMM yyyy", { locale: pl })}
                          </span>
                        </div>
                      </div>

                      {canManage && (
                        <div className="flex items-center gap-2">
                          {issue.status === "draft" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setCreateIssueOpen(false);
                                  setEditingIssue(issue);
                                }}
                              >
                                <Pencil className="mr-2 h-4 w-4" />
                                Edytuj
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handlePublishIssue(issue.id)}
                                disabled={updateStatusMutation.isPending}
                              >
                                Opublikuj
                              </Button>
                            </>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteIssueId(issue.id)}
                            disabled={deleteIssueMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CreateWarrantyIssueDialog
        key={editingIssue?.id ?? "new"}
        open={createIssueOpen || editingIssue != null}
        onOpenChange={(open) => {
          if (!open) {
            setCreateIssueOpen(false);
            setEditingIssue(null);
          }
        }}
        communityId={communityId}
        orgId={orgId}
        issue={editingIssue}
      />

      <AlertDialog open={!!deleteIssueId} onOpenChange={() => setDeleteIssueId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Czy na pewno chcesz usunąć tę usterkę?</AlertDialogTitle>
            <AlertDialogDescription>
              Ta operacja jest nieodwracalna. Wszystkie dane powiązane z tą usterką (komentarze, zdarzenia) 
              również zostaną usunięte.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteIssueId && handleDeleteIssue(deleteIssueId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Usuń
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
