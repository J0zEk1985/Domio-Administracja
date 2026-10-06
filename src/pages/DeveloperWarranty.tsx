/**
 * Developer Warranty Issues - Main Page
 * Lista wszystkich usterek deweloperskich dla organizacji
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Building2, AlertCircle, CheckCircle2, Clock, XCircle, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useWarrantyIssues } from "@/hooks/useDeveloperWarranty";
import { useCommunities } from "@/hooks/useCommunities";
import { CreateWarrantyIssueDialog } from "@/components/communities/CreateWarrantyIssueDialog";
import {
  DEVELOPER_WARRANTY_ISSUE_STATUS_LABELS,
  DEVELOPER_WARRANTY_ISSUE_PRIORITY_LABELS,
  type DeveloperWarrantyIssueStatus,
  type DeveloperWarrantyIssuePriority,
} from "@/types/developer-warranty";
import { format } from "date-fns";
import { pl } from "date-fns/locale";

export default function DeveloperWarranty() {
  const [selectedCommunity, setSelectedCommunity] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<DeveloperWarrantyIssueStatus | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [createIssueOpen, setCreateIssueOpen] = useState(false);

  const { data: orgId, isLoading: orgLoading } = useQuery({
    queryKey: ["org-id"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_org_id_safe");
      if (error) throw error;
      return data as string | null;
    },
  });

  const { data: communities, isLoading: communitiesLoading } = useCommunities(orgId ?? null);
  
  const { data: issues, isLoading: issuesLoading } = useWarrantyIssues({
    community_id: selectedCommunity !== "all" ? selectedCommunity : undefined,
    status: selectedStatus !== "all" ? selectedStatus : undefined,
    search: searchQuery || undefined,
  });

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

  const getPriorityColor = (priority: DeveloperWarrantyIssuePriority) => {
    switch (priority) {
      case "low":
        return "bg-gray-500/10 text-gray-600";
      case "normal":
        return "bg-blue-500/10 text-blue-600";
      case "high":
        return "bg-orange-500/10 text-orange-600";
      case "urgent":
        return "bg-red-500/10 text-red-600";
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
        rejected: issues.filter((i) => i.status === "rejected").length,
      }
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Usterki deweloperskie</h1>
          <p className="text-muted-foreground mt-2">
            Zarządzanie usterkami objętymi rękojmią deweloperską
          </p>
        </div>
        <Button onClick={() => setCreateIssueOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Dodaj usterkę
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-5">
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
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Odrzucone</CardTitle>
              <XCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.rejected}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filtry</CardTitle>
          <CardDescription>Filtruj usterki według Wspólnoty, statusu lub wyszukaj</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Wspólnota</label>
              <Select value={selectedCommunity} onValueChange={setSelectedCommunity}>
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz wspólnotę" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wszystkie wspólnoty</SelectItem>
                  {communities?.map((community) => (
                    <SelectItem key={community.id} value={community.id}>
                      {community.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select
                value={selectedStatus}
                onValueChange={(value) => setSelectedStatus(value as DeveloperWarrantyIssueStatus | "all")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wszystkie statusy</SelectItem>
                  {Object.entries(DEVELOPER_WARRANTY_ISSUE_STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Szukaj</label>
              <Input
                placeholder="Szukaj w tytule, opisie..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Issues List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Lista usterek</CardTitle>
              <CardDescription>
                {issues && `Wyświetlono ${issues.length} ${issues.length === 1 ? "usterkę" : "usterek"}`}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {issuesLoading || communitiesLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : !issues || issues.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Brak usterek</h3>
              <p className="text-muted-foreground mb-4">
                Nie znaleziono żadnych usterek deweloperskich
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {issues.map((issue) => {
                const community = communities?.find((c) => c.id === issue.community_id);
                
                return (
                  <Link
                    key={issue.id}
                    to={`/developer-warranty/${issue.id}`}
                    className="block"
                  >
                    <Card className="hover:shadow-md transition-shadow cursor-pointer">
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="font-semibold text-lg truncate">{issue.title}</h3>
                              <Badge variant="outline" className={getStatusColor(issue.status)}>
                                <span className="flex items-center gap-1.5">
                                  {getStatusIcon(issue.status)}
                                  {DEVELOPER_WARRANTY_ISSUE_STATUS_LABELS[issue.status]}
                                </span>
                              </Badge>
                              <Badge variant="outline" className={getPriorityColor(issue.priority)}>
                                {DEVELOPER_WARRANTY_ISSUE_PRIORITY_LABELS[issue.priority]}
                              </Badge>
                            </div>
                            
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1.5">
                                <Building2 className="h-3.5 w-3.5" />
                                {community?.name || "Nieznana wspólnota"}
                              </span>
                              {issue.category && (
                                <span>•</span>
                              )}
                              {issue.category && (
                                <span>{issue.category}</span>
                              )}
                              {issue.location_detail && (
                                <span>•</span>
                              )}
                              {issue.location_detail && (
                                <span className="truncate">{issue.location_detail}</span>
                              )}
                            </div>

                            {issue.description && (
                              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                                {issue.description}
                              </p>
                            )}

                            <div className="flex items-center gap-4 text-xs text-muted-foreground mt-3">
                              <span>
                                Utworzono: {format(new Date(issue.created_at), "d MMM yyyy, HH:mm", { locale: pl })}
                              </span>
                              {issue.reported_at && (
                                <>
                                  <span>•</span>
                                  <span>
                                    Zgłoszono: {format(new Date(issue.reported_at), "d MMM yyyy, HH:mm", { locale: pl })}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Issue Dialog */}
      <CreateWarrantyIssueDialog
        open={createIssueOpen}
        onOpenChange={setCreateIssueOpen}
      />
    </div>
  );
}
