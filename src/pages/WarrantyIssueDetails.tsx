/**
 * Warranty Issue Details Page
 * Szczegółowy widok pojedynczej usterki deweloperskiej
 */
import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Send,
  Trash2,
  FileText,
  MapPin,
  Calendar,
  User,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  MessageSquare,
  History,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useWarrantyIssue,
  useWarrantyIssueComments,
  useWarrantyIssueEvents,
  useAddWarrantyIssueComment,
  useUpdateWarrantyIssueStatus,
  useDeleteWarrantyIssue,
} from "@/hooks/useDeveloperWarranty";
import {
  DEVELOPER_WARRANTY_ISSUE_STATUS_LABELS,
  DEVELOPER_WARRANTY_ISSUE_PRIORITY_LABELS,
  type DeveloperWarrantyIssueStatus,
} from "@/types/developer-warranty";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { toast } from "@/components/ui/sonner";

export default function WarrantyIssueDetails() {
  const { issueId } = useParams<{ issueId: string }>();
  const navigate = useNavigate();
  
  const [commentText, setCommentText] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [statusChangeDialogOpen, setStatusChangeDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<DeveloperWarrantyIssueStatus | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [appealNotes, setAppealNotes] = useState("");

  const { data: issue, isLoading: issueLoading } = useWarrantyIssue(issueId);
  const { data: comments, isLoading: commentsLoading } = useWarrantyIssueComments(issueId);
  const { data: events, isLoading: eventsLoading } = useWarrantyIssueEvents(issueId);

  const addCommentMutation = useAddWarrantyIssueComment();
  const updateStatusMutation = useUpdateWarrantyIssueStatus();
  const deleteIssueMutation = useDeleteWarrantyIssue();

  const handleAddComment = async () => {
    if (!commentText.trim() || !issueId) return;

    try {
      await addCommentMutation.mutateAsync({
        issue_id: issueId,
        comment_text: commentText,
      });
      setCommentText("");
      toast.success("Komentarz został dodany");
    } catch (error) {
      toast.error("Nie udało się dodać komentarza");
      console.error(error);
    }
  };

  const handleStatusChange = async () => {
    if (!issueId || !newStatus) return;

    try {
      const dto: any = { new_status: newStatus };
      
      if (newStatus === "rejected" && rejectionReason) {
        dto.rejection_reason = rejectionReason;
      }
      
      if (newStatus === "appealed" && appealNotes) {
        dto.appeal_notes = appealNotes;
      }

      await updateStatusMutation.mutateAsync({ issueId, dto });
      
      toast.success(`Status zmieniony na: ${DEVELOPER_WARRANTY_ISSUE_STATUS_LABELS[newStatus]}`);
      setStatusChangeDialogOpen(false);
      setNewStatus(null);
      setRejectionReason("");
      setAppealNotes("");
    } catch (error) {
      toast.error("Nie udało się zmienić statusu");
      console.error(error);
    }
  };

  const handleDelete = async () => {
    if (!issueId || !issue) return;

    try {
      await deleteIssueMutation.mutateAsync({
        issueId,
        communityId: issue.community_id,
      });
      toast.success("Usterka została usunięta");
      navigate("/developer-warranty");
    } catch (error) {
      toast.error("Nie udało się usunąć usterki");
      console.error(error);
    }
  };

  const getStatusIcon = (status: DeveloperWarrantyIssueStatus) => {
    switch (status) {
      case "draft":
        return <FileText className="h-5 w-5" />;
      case "reported":
        return <AlertCircle className="h-5 w-5" />;
      case "acknowledged":
      case "in_progress":
        return <Clock className="h-5 w-5" />;
      case "completed":
        return <CheckCircle2 className="h-5 w-5" />;
      case "rejected":
        return <XCircle className="h-5 w-5" />;
      case "appealed":
        return <AlertCircle className="h-5 w-5" />;
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

  if (issueLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!issue) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-bold mb-2">Nie znaleziono usterki</h2>
        <Link to="/developer-warranty">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Wróć do listy
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link to="/developer-warranty">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Wróć do listy
              </Button>
            </Link>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{issue.title}</h1>
          <div className="flex items-center gap-3 mt-2">
            <Badge variant="outline" className={getStatusColor(issue.status)}>
              <span className="flex items-center gap-1.5">
                {getStatusIcon(issue.status)}
                {DEVELOPER_WARRANTY_ISSUE_STATUS_LABELS[issue.status]}
              </span>
            </Badge>
            <Badge variant="outline">
              {DEVELOPER_WARRANTY_ISSUE_PRIORITY_LABELS[issue.priority]}
            </Badge>
            {issue.category && (
              <Badge variant="secondary">{issue.category}</Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setDeleteDialogOpen(true)}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Usuń
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <Card>
            <CardHeader>
              <CardTitle>Opis usterki</CardTitle>
            </CardHeader>
            <CardContent>
              {issue.description ? (
                <p className="text-sm whitespace-pre-wrap">{issue.description}</p>
              ) : (
                <p className="text-sm text-muted-foreground italic">Brak opisu</p>
              )}
            </CardContent>
          </Card>

          {/* Photos */}
          {(issue.photos_reported.length > 0 || issue.photos_completion.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle>Zdjęcia</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {issue.photos_reported.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Zdjęcia zgłoszeniowe</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {issue.photos_reported.map((url, idx) => (
                        <div
                          key={idx}
                          className="aspect-square rounded-lg border bg-muted flex items-center justify-center"
                        >
                          <ImageIcon className="h-8 w-8 text-muted-foreground" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {issue.photos_completion.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Zdjęcia po usunięciu</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {issue.photos_completion.map((url, idx) => (
                        <div
                          key={idx}
                          className="aspect-square rounded-lg border bg-muted flex items-center justify-center"
                        >
                          <ImageIcon className="h-8 w-8 text-muted-foreground" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Rejection/Appeal */}
          {issue.rejection_reason && (
            <Card className="border-red-200 dark:border-red-900">
              <CardHeader>
                <CardTitle className="text-red-600 dark:text-red-400">
                  Powód odrzucenia
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{issue.rejection_reason}</p>
              </CardContent>
            </Card>
          )}

          {issue.appeal_notes && (
            <Card className="border-orange-200 dark:border-orange-900">
              <CardHeader>
                <CardTitle className="text-orange-600 dark:text-orange-400">
                  Odwołanie
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{issue.appeal_notes}</p>
              </CardContent>
            </Card>
          )}

          {/* Comments & Events */}
          <Card>
            <Tabs defaultValue="comments">
              <CardHeader>
                <TabsList className="w-full">
                  <TabsTrigger value="comments" className="flex-1">
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Komentarze ({comments?.length || 0})
                  </TabsTrigger>
                  <TabsTrigger value="history" className="flex-1">
                    <History className="mr-2 h-4 w-4" />
                    Historia ({events?.length || 0})
                  </TabsTrigger>
                </TabsList>
              </CardHeader>
              <CardContent>
                <TabsContent value="comments" className="mt-0">
                  <div className="space-y-4">
                    {comments && comments.length > 0 ? (
                      <ScrollArea className="h-[400px] pr-4">
                        <div className="space-y-4">
                          {comments.map((comment) => (
                            <div key={comment.id} className="flex gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback>
                                  {comment.author_type === "admin" ? "A" : "D"}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-sm font-medium">
                                    {comment.author_name || "Nieznany"}
                                  </span>
                                  <Badge variant="outline" className="text-xs">
                                    {comment.author_type === "admin" ? "Admin" : "Deweloper"}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {format(new Date(comment.created_at), "d MMM yyyy, HH:mm", {
                                      locale: pl,
                                    })}
                                  </span>
                                </div>
                                <p className="text-sm whitespace-pre-wrap">{comment.comment_text}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        Brak komentarzy
                      </p>
                    )}

                    <Separator />

                    <div className="space-y-2">
                      <Label>Dodaj komentarz</Label>
                      <Textarea
                        placeholder="Napisz komentarz..."
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        rows={3}
                      />
                      <Button
                        onClick={handleAddComment}
                        disabled={!commentText.trim() || addCommentMutation.isPending}
                      >
                        <Send className="mr-2 h-4 w-4" />
                        Wyślij komentarz
                      </Button>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="history" className="mt-0">
                  {events && events.length > 0 ? (
                    <ScrollArea className="h-[400px] pr-4">
                      <div className="space-y-3">
                        {events.map((event) => (
                          <div key={event.id} className="flex gap-3 text-sm">
                            <div className="flex-shrink-0 mt-1">
                              {getStatusIcon(event.new_status || "draft")}
                            </div>
                            <div className="flex-1">
                              <div className="font-medium">{event.event_type}</div>
                              {event.old_status && event.new_status && (
                                <div className="text-muted-foreground">
                                  {DEVELOPER_WARRANTY_ISSUE_STATUS_LABELS[event.old_status]} →{" "}
                                  {DEVELOPER_WARRANTY_ISSUE_STATUS_LABELS[event.new_status]}
                                </div>
                              )}
                              <div className="text-xs text-muted-foreground">
                                {event.actor_name || "System"} •{" "}
                                {format(new Date(event.created_at), "d MMM yyyy, HH:mm", {
                                  locale: pl,
                                })}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Brak zdarzeń w historii
                    </p>
                  )}
                </TabsContent>
              </CardContent>
            </Tabs>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Status Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Zarządzanie statusem</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {issue.status === "draft" && (
                <Button
                  className="w-full"
                  onClick={() => {
                    setNewStatus("reported");
                    setStatusChangeDialogOpen(true);
                  }}
                >
                  Opublikuj zgłoszenie
                </Button>
              )}
              {issue.status === "rejected" && (
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => {
                    setNewStatus("appealed");
                    setStatusChangeDialogOpen(true);
                  }}
                >
                  Złóż odwołanie
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Details */}
          <Card>
            <CardHeader>
              <CardTitle>Szczegóły</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {issue.location_detail && (
                <div className="flex gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <div className="font-medium">Lokalizacja</div>
                    <div className="text-muted-foreground">{issue.location_detail}</div>
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <div className="font-medium">Utworzono</div>
                  <div className="text-muted-foreground">
                    {format(new Date(issue.created_at), "d MMMM yyyy, HH:mm", { locale: pl })}
                  </div>
                </div>
              </div>
              {issue.reported_at && (
                <div className="flex gap-2">
                  <Send className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <div className="font-medium">Zgłoszono</div>
                    <div className="text-muted-foreground">
                      {format(new Date(issue.reported_at), "d MMMM yyyy, HH:mm", { locale: pl })}
                    </div>
                  </div>
                </div>
              )}
              {issue.completed_at && (
                <div className="flex gap-2">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <div className="font-medium">Zrealizowano</div>
                    <div className="text-muted-foreground">
                      {format(new Date(issue.completed_at), "d MMMM yyyy, HH:mm", { locale: pl })}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Czy na pewno chcesz usunąć tę usterkę?</AlertDialogTitle>
            <AlertDialogDescription>
              Ta operacja jest nieodwracalna. Wszystkie powiązane dane zostaną usunięte.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Usuń
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Status Change Dialog */}
      <AlertDialog open={statusChangeDialogOpen} onOpenChange={setStatusChangeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {newStatus === "reported" && "Opublikuj zgłoszenie"}
              {newStatus === "appealed" && "Złóż odwołanie"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {newStatus === "reported" &&
                "Zgłoszenie zostanie opublikowane i będzie widoczne dla dewelopera."}
              {newStatus === "appealed" && "Uzasadnij powód odwołania od decyzji dewelopera."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {newStatus === "appealed" && (
            <div className="space-y-2">
              <Label>Uzasadnienie odwołania *</Label>
              <Textarea
                value={appealNotes}
                onChange={(e) => setAppealNotes(e.target.value)}
                placeholder="Opisz dlaczego odwołujesz się od decyzji..."
                rows={4}
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleStatusChange}
              disabled={newStatus === "appealed" && !appealNotes.trim()}
            >
              Potwierdź
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
