/**
 * Developer Issue Details Modal
 * Pełny modal szczegółów usterki dla dewelopera z akcjami
 */
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  X,
  Send,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  MessageSquare,
  FileText,
  MapPin,
  Calendar,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/lib/supabase";
import {
  DEVELOPER_WARRANTY_ISSUE_STATUS_LABELS,
  type DeveloperWarrantyIssueStatus,
  type DeveloperWarrantyIssueWithComments,
} from "@/types/developer-warranty";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { toast } from "@/components/ui/sonner";
import { PhotoUpload } from "@/components/warranty/PhotoUpload";

const commentFormSchema = z.object({
  comment_text: z.string().min(1, "Komentarz nie może być pusty"),
});

const statusFormSchema = z.object({
  new_status: z.enum(["acknowledged", "in_progress", "completed", "rejected"]),
  rejection_reason: z.string().optional(),
});

type CommentFormValues = z.infer<typeof commentFormSchema>;
type StatusFormValues = z.infer<typeof statusFormSchema>;

interface DeveloperIssueDetailsModalProps {
  issue: DeveloperWarrantyIssueWithComments | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
  developerName: string;
  accessToken: string;
  pin: string;
}

export function DeveloperIssueDetailsModal({
  issue,
  open,
  onOpenChange,
  onUpdate,
  developerName,
  accessToken,
  pin,
}: DeveloperIssueDetailsModalProps) {
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const [showStatusForm, setShowStatusForm] = useState(false);
  const [completionPhotos, setCompletionPhotos] = useState<string[]>([]);

  const commentForm = useForm<CommentFormValues>({
    resolver: zodResolver(commentFormSchema),
    defaultValues: {
      comment_text: "",
    },
  });

  const statusForm = useForm<StatusFormValues>({
    resolver: zodResolver(statusFormSchema),
    defaultValues: {
      new_status: "acknowledged",
      rejection_reason: "",
    },
  });

  const selectedNewStatus = statusForm.watch("new_status");

  const handleAddComment = async (values: CommentFormValues) => {
    if (!issue) return;

    setIsAddingComment(true);
    try {
      const { data, error } = await supabase.rpc("developer_add_warranty_issue_comment", {
        p_access_token: accessToken,
        p_pin: pin,
        p_issue_id: issue.id,
        p_comment_text: values.comment_text,
      });

      if (error) throw error;

      if (!data || !data.ok) {
        throw new Error(data?.error || "Nie udało się dodać komentarza");
      }

      toast.success("Komentarz został dodany");
      commentForm.reset();
      onUpdate();
    } catch (err: any) {
      console.error("Failed to add comment:", err);
      toast.error("Nie udało się dodać komentarza");
    } finally {
      setIsAddingComment(false);
    }
  };

  const handleChangeStatus = async (values: StatusFormValues) => {
    if (!issue) return;

    // Validate rejection reason
    if (values.new_status === "rejected" && !values.rejection_reason?.trim()) {
      toast.error("Podaj powód odrzucenia usterki");
      return;
    }

    setIsChangingStatus(true);
    try {
      const { data, error } = await supabase.rpc("developer_update_warranty_issue_status", {
        p_access_token: accessToken,
        p_pin: pin,
        p_issue_id: issue.id,
        p_new_status: values.new_status,
        p_rejection_reason: values.rejection_reason || null,
        p_completion_photos: values.new_status === "completed" && completionPhotos.length > 0 
          ? completionPhotos 
          : null,
      });

      if (error) throw error;

      if (!data || !data.ok) {
        throw new Error(data?.error || "Nie udało się zmienić statusu");
      }

      toast.success(`Status zmieniony na: ${DEVELOPER_WARRANTY_ISSUE_STATUS_LABELS[values.new_status]}`);
      setShowStatusForm(false);
      setCompletionPhotos([]);
      statusForm.reset();
      onUpdate();
    } catch (err: any) {
      console.error("Failed to change status:", err);
      toast.error("Nie udało się zmienić statusu");
    } finally {
      setIsChangingStatus(false);
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

  const canChangeStatus = (currentStatus: DeveloperWarrantyIssueStatus): boolean => {
    // Can't change if already completed or rejected (unless appealed)
    if (currentStatus === "completed") return false;
    if (currentStatus === "rejected" && issue?.status !== "appealed") return false;
    return true;
  };

  const getAvailableStatuses = (currentStatus: DeveloperWarrantyIssueStatus) => {
    const statuses: { value: DeveloperWarrantyIssueStatus; label: string }[] = [];

    switch (currentStatus) {
      case "reported":
        statuses.push(
          { value: "acknowledged", label: "Potwierdź przyjęcie" },
          { value: "in_progress", label: "Rozpocznij realizację" },
          { value: "rejected", label: "Odrzuć zgłoszenie" }
        );
        break;
      case "acknowledged":
        statuses.push(
          { value: "in_progress", label: "Rozpocznij realizację" },
          { value: "rejected", label: "Odrzuć zgłoszenie" }
        );
        break;
      case "in_progress":
        statuses.push(
          { value: "completed", label: "Oznacz jako zrealizowane" },
          { value: "rejected", label: "Odrzuć zgłoszenie" }
        );
        break;
      case "appealed":
        statuses.push(
          { value: "acknowledged", label: "Potwierdź ponownie" },
          { value: "in_progress", label: "Rozpocznij realizację" },
          { value: "rejected", label: "Odrzuć ponownie" }
        );
        break;
    }

    return statuses;
  };

  if (!issue) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1 pr-8">
              <DialogTitle className="text-2xl mb-2">{issue.title}</DialogTitle>
              <DialogDescription className="flex items-center gap-2">
                <Badge variant="outline" className={getStatusColor(issue.status)}>
                  <span className="flex items-center gap-1.5">
                    {getStatusIcon(issue.status)}
                    {DEVELOPER_WARRANTY_ISSUE_STATUS_LABELS[issue.status]}
                  </span>
                </Badge>
                {issue.category && <Badge variant="secondary">{issue.category}</Badge>}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 -mx-6">
          <div className="space-y-6 pb-6">
            {/* Description */}
            <div>
              <h4 className="font-semibold mb-2">Opis usterki</h4>
              {issue.description ? (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {issue.description}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground italic">Brak szczegółowego opisu</p>
              )}
            </div>

            {/* Details */}
            <div className="grid grid-cols-2 gap-4">
              {issue.location_detail && (
                <div className="flex gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <div className="text-sm font-medium">Lokalizacja</div>
                    <div className="text-sm text-muted-foreground">{issue.location_detail}</div>
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <div className="text-sm font-medium">Data zgłoszenia</div>
                  <div className="text-sm text-muted-foreground">
                    {format(new Date(issue.reported_at || issue.created_at), "d MMMM yyyy, HH:mm", {
                      locale: pl,
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Photos */}
            {issue.photos_reported.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2">Zdjęcia zgłoszeniowe</h4>
                <div className="grid grid-cols-3 gap-2">
                  {issue.photos_reported.map((url, idx) => (
                    <a
                      key={idx}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="aspect-square overflow-hidden rounded-lg border bg-muted"
                    >
                      <img
                        src={url}
                        alt={`Zdjęcie zgłoszeniowe ${idx + 1}`}
                        className="h-full w-full object-cover"
                      />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Rejection reason or Appeal notes */}
            {issue.rejection_reason && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Powód odrzucenia:</strong> {issue.rejection_reason}
                </AlertDescription>
              </Alert>
            )}

            {issue.appeal_notes && (
              <Alert className="border-orange-200 dark:border-orange-900">
                <AlertCircle className="h-4 w-4 text-orange-600" />
                <AlertDescription>
                  <strong className="text-orange-600">Odwołanie administratora:</strong>{" "}
                  {issue.appeal_notes}
                </AlertDescription>
              </Alert>
            )}

            <Separator />

            {/* Comments */}
            <div>
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Komentarze ({issue.comments?.length || 0})
              </h4>

              {issue.comments && issue.comments.length > 0 ? (
                <div className="space-y-3 mb-4">
                  {issue.comments.map((comment) => (
                    <div key={comment.id} className="flex gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className={comment.author_type === "developer" ? "bg-primary/10" : ""}>
                          {comment.author_type === "admin" ? "A" : "D"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium">{comment.author_name || "Nieznany"}</span>
                          <Badge
                            variant="outline"
                            className={comment.author_type === "developer" ? "bg-primary/10" : ""}
                          >
                            {comment.author_type === "admin" ? "Administrator" : "Deweloper"}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(comment.created_at), "d MMM yyyy, HH:mm", { locale: pl })}
                          </span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{comment.comment_text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4 mb-4">Brak komentarzy</p>
              )}

              {/* Add Comment Form */}
              <Form {...commentForm}>
                <form onSubmit={commentForm.handleSubmit(handleAddComment)} className="space-y-3">
                  <FormField
                    control={commentForm.control}
                    name="comment_text"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Dodaj komentarz</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Napisz komentarz do zgłoszenia..."
                            rows={3}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" disabled={isAddingComment} className="w-full">
                    {isAddingComment ? (
                      <>
                        <Clock className="mr-2 h-4 w-4 animate-spin" />
                        Dodawanie...
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        Wyślij komentarz
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            </div>

            <Separator />

            {/* Status Change */}
            {canChangeStatus(issue.status) && (
              <div>
                <h4 className="font-semibold mb-3">Zmień status zgłoszenia</h4>

                {!showStatusForm ? (
                  <div className="space-y-2">
                    {getAvailableStatuses(issue.status).map((statusOption) => (
                      <Button
                        key={statusOption.value}
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => {
                          statusForm.setValue("new_status", statusOption.value);
                          setShowStatusForm(true);
                        }}
                      >
                        {statusOption.value === "acknowledged" && <CheckCircle2 className="mr-2 h-4 w-4" />}
                        {statusOption.value === "in_progress" && <Clock className="mr-2 h-4 w-4" />}
                        {statusOption.value === "completed" && <CheckCircle2 className="mr-2 h-4 w-4" />}
                        {statusOption.value === "rejected" && <XCircle className="mr-2 h-4 w-4" />}
                        {statusOption.label}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <Form {...statusForm}>
                    <form onSubmit={statusForm.handleSubmit(handleChangeStatus)} className="space-y-4">
                      <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          Zmiana statusu na:{" "}
                          <strong>{DEVELOPER_WARRANTY_ISSUE_STATUS_LABELS[selectedNewStatus]}</strong>
                        </AlertDescription>
                      </Alert>

                      {selectedNewStatus === "rejected" && (
                        <FormField
                          control={statusForm.control}
                          name="rejection_reason"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Powód odrzucenia *</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Opisz dlaczego odrzucasz to zgłoszenie..."
                                  rows={4}
                                  {...field}
                                />
                              </FormControl>
                              <FormDescription>
                                Podaj szczegółowy powód, dla którego uważasz, że ta usterka nie jest objęta
                                rękojmią
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}

                      {selectedNewStatus === "completed" && (
                        <>
                          <Alert className="bg-green-50 dark:bg-green-900/10 border-green-200">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            <AlertDescription className="text-green-600 dark:text-green-400">
                              Potwierdzasz, że usterka została w pełni usunięta. Administrator zostanie
                              powiadomiony o zakończeniu prac.
                            </AlertDescription>
                          </Alert>
                          
                          <PhotoUpload
                            photos={completionPhotos}
                            onPhotosChange={setCompletionPhotos}
                            label="Zdjęcia po naprawie (opcjonalnie)"
                            description="Dodaj zdjęcia dokumentujące usunięcie usterki"
                            maxPhotos={6}
                            disabled={isChangingStatus}
                          />
                        </>
                      )}

                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setShowStatusForm(false);
                            statusForm.reset();
                          }}
                          className="flex-1"
                        >
                          Anuluj
                        </Button>
                        <Button type="submit" disabled={isChangingStatus} className="flex-1">
                          {isChangingStatus ? (
                            <>
                              <Clock className="mr-2 h-4 w-4 animate-spin" />
                              Zmiana statusu...
                            </>
                          ) : (
                            "Potwierdź zmianę"
                          )}
                        </Button>
                      </div>
                    </form>
                  </Form>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
