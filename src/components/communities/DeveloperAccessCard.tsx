/**
 * Developer portal access for one community: invite, deactivate, restore, or remove.
 * Removing access never deletes warranty issues.
 */
import { useState } from "react";
import { CheckCircle2, Clock, Mail, RotateCcw, ShieldAlert, Trash2, XCircle } from "lucide-react";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { toast } from "@/components/ui/sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  useDeactivateDeveloperAccess,
  useDeleteDeveloperAccess,
  useRestoreDeveloperAccess,
} from "@/hooks/useDeveloperWarranty";
import type { DeveloperAccess } from "@/types/developer-warranty";
import { CreateDeveloperAccessDialog } from "./CreateDeveloperAccessDialog";

interface DeveloperAccessCardProps {
  communityId: string;
  communityName: string;
  canManage: boolean;
  developerAccess: DeveloperAccess | null;
}

export function DeveloperAccessCard({
  communityId,
  communityName,
  canManage,
  developerAccess,
}: DeveloperAccessCardProps) {
  const [createAccessOpen, setCreateAccessOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const deactivateAccessMutation = useDeactivateDeveloperAccess();
  const restoreAccessMutation = useRestoreDeveloperAccess();
  const deleteAccessMutation = useDeleteDeveloperAccess();

  const isAccessActive = developerAccess && !developerAccess.deactivated_at;
  const isAccessActivated = developerAccess && developerAccess.activated_at;

  const handleDeactivateAccess = async () => {
    if (!developerAccess) return;

    try {
      await deactivateAccessMutation.mutateAsync({
        accessId: developerAccess.id,
        communityId,
      });
      toast.success("Dostęp dewelopera został dezaktywowany");
    } catch (error) {
      toast.error("Nie udało się dezaktywować dostępu");
      console.error(error);
    }
  };

  const handleRestoreAccess = async () => {
    if (!developerAccess) return;

    try {
      await restoreAccessMutation.mutateAsync({
        accessId: developerAccess.id,
        communityId,
      });
      toast.success("Dostęp dewelopera został przywrócony");
      setRestoreOpen(false);
    } catch (error) {
      toast.error("Nie udało się przywrócić dostępu");
      console.error(error);
    }
  };

  const handleDeleteAccess = async () => {
    if (!developerAccess) return;

    try {
      await deleteAccessMutation.mutateAsync({
        accessId: developerAccess.id,
        communityId,
      });
      toast.success("Dostęp dewelopera został usunięty. Usterki pozostały w systemie.");
      setDeleteOpen(false);
    } catch (error) {
      toast.error("Nie udało się usunąć dostępu dewelopera");
      console.error(error);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Dostęp Dewelopera</CardTitle>
              <CardDescription>
                Zarządzaj dostępem dewelopera do portalu usterek dla tej Wspólnoty
              </CardDescription>
            </div>
            {canManage && !developerAccess && (
              <Button onClick={() => setCreateAccessOpen(true)}>
                <Mail className="mr-2 h-4 w-4" />
                Dodaj dewelopera
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!developerAccess ? (
            <Alert>
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Brak dostępu dewelopera</AlertTitle>
              <AlertDescription>
                Dodaj dane dewelopera, aby umożliwić mu dostęp do portalu i przeglądanie usterek.
                Deweloper otrzyma e-mail z linkiem aktywacyjnym i sam ustali swój PIN dostępowy.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm text-muted-foreground">Deweloper</Label>
                  <p className="font-medium">{developerAccess.developer_name}</p>
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">E-mail</Label>
                  <p className="font-medium">{developerAccess.developer_email}</p>
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">Status</Label>
                  <div className="flex items-center gap-2 mt-1">
                    {isAccessActive ? (
                      isAccessActivated ? (
                        <Badge variant="outline" className="bg-green-500/10 text-green-600">
                          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                          Aktywny
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600">
                          <Clock className="mr-1.5 h-3.5 w-3.5" />
                          Oczekuje na aktywację
                        </Badge>
                      )
                    ) : (
                      <Badge variant="outline" className="bg-gray-500/10 text-gray-600">
                        <XCircle className="mr-1.5 h-3.5 w-3.5" />
                        Dezaktywowany
                      </Badge>
                    )}
                  </div>
                </div>
                {developerAccess.last_login_at && (
                  <div>
                    <Label className="text-sm text-muted-foreground">Ostatnie logowanie</Label>
                    <p className="text-sm">
                      {format(new Date(developerAccess.last_login_at), "d MMM yyyy, HH:mm", { locale: pl })}
                    </p>
                  </div>
                )}
              </div>

              {isAccessActive && !isAccessActivated && (
                <Alert>
                  <Mail className="h-4 w-4" />
                  <AlertTitle>Oczekuje na aktywację</AlertTitle>
                  <AlertDescription>
                    Deweloper otrzymał e-mail z linkiem aktywacyjnym. Po kliknięciu w link, ustawi swój PIN
                    i uzyska dostęp do portalu.
                  </AlertDescription>
                </Alert>
              )}

              {!isAccessActive && (
                <Alert>
                  <ShieldAlert className="h-4 w-4" />
                  <AlertTitle>Dostęp wyłączony</AlertTitle>
                  <AlertDescription>
                    Możesz przywrócić tego samego dewelopera albo trwale usunąć dostęp i dodać innego.
                    Usterki, komentarze i historia zdarzeń pozostaną w systemie.
                  </AlertDescription>
                </Alert>
              )}

              {canManage && isAccessActive && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={handleDeactivateAccess}
                    disabled={deactivateAccessMutation.isPending}
                  >
                    Dezaktywuj dostęp
                  </Button>
                </div>
              )}

              {canManage && !isAccessActive && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => setRestoreOpen(true)}
                    disabled={restoreAccessMutation.isPending}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Przywróć dostęp
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteOpen(true)}
                    disabled={deleteAccessMutation.isPending}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Usuń dostęp
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <CreateDeveloperAccessDialog
        open={createAccessOpen}
        onOpenChange={setCreateAccessOpen}
        communityId={communityId}
        communityName={communityName}
      />

      <AlertDialog open={restoreOpen} onOpenChange={setRestoreOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Przywrócić dostęp dewelopera?</AlertDialogTitle>
            <AlertDialogDescription>
              {developerAccess?.developer_name} odzyska dostęp do portalu usterek tej Wspólnoty.
              Dotychczasowy PIN i link pozostaną bez zmian. Usterki nie zostaną zmienione.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleRestoreAccess();
              }}
              disabled={restoreAccessMutation.isPending}
            >
              Przywróć dostęp
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Usunąć dostęp dewelopera?</AlertDialogTitle>
            <AlertDialogDescription>
              Dostęp firmy {developerAccess?.developer_name} ({developerAccess?.developer_email}) zostanie
              trwale usunięty. Usterki, komentarze i historia zdarzeń tej Wspólnoty pozostaną w systemie.
              Po usunięciu będzie można dodać innego dewelopera.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleDeleteAccess();
              }}
              disabled={deleteAccessMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Usuń dostęp
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
