/**
 * Create Developer Access Dialog
 * Dialog do dodawania dostępu dewelopera dla Wspólnoty
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Mail, AlertCircle, CheckCircle2, Copy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useCreateDeveloperAccess } from "@/hooks/useDeveloperWarranty";
import { toast } from "@/components/ui/sonner";

const formSchema = z.object({
  developer_email: z
    .string()
    .min(1, "Adres e-mail jest wymagany")
    .email("Nieprawidłowy format adresu e-mail"),
  developer_name: z
    .string()
    .min(1, "Nazwa dewelopera jest wymagana")
    .max(255, "Nazwa dewelopera nie może przekraczać 255 znaków"),
});

type FormValues = z.infer<typeof formSchema>;

interface CreateDeveloperAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communityId: string;
  communityName: string;
}

export function CreateDeveloperAccessDialog({
  open,
  onOpenChange,
  communityId,
  communityName,
}: CreateDeveloperAccessDialogProps) {
  const [activationUrl, setActivationUrl] = useState<string | null>(null);
  const createMutation = useCreateDeveloperAccess();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      developer_email: "",
      developer_name: "",
    },
  });

  const handleSubmit = async (values: FormValues) => {
    try {
      const response = await createMutation.mutateAsync({
        community_id: communityId,
        developer_email: values.developer_email,
        developer_name: values.developer_name,
      });

      if (response.activation_url) {
        // For development/testing - show activation URL
        // In production, this would be sent via n8n email automation
        const fullUrl = `${window.location.origin}${response.activation_url}`;
        setActivationUrl(fullUrl);
        
        toast.success("Dostęp dewelopera został utworzony");
      }
    } catch (error: any) {
      if (error.message?.includes("developer_access_already_exists")) {
        toast.error("Dostęp dewelopera dla tej Wspólnoty już istnieje");
      } else {
        toast.error("Nie udało się utworzyć dostępu dewelopera");
      }
      console.error(error);
    }
  };

  const handleClose = () => {
    form.reset();
    setActivationUrl(null);
    onOpenChange(false);
  };

  const handleCopyUrl = () => {
    if (activationUrl) {
      navigator.clipboard.writeText(activationUrl);
      toast.success("Link aktywacyjny skopiowany do schowka");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Dodaj dostęp dewelopera</DialogTitle>
          <DialogDescription>
            Utwórz dostęp dla dewelopera do portalu usterek Wspólnoty <strong>{communityName}</strong>
          </DialogDescription>
        </DialogHeader>

        {!activationUrl ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
              <Alert>
                <Mail className="h-4 w-4" />
                <AlertTitle>Proces aktywacji</AlertTitle>
                <AlertDescription>
                  Deweloper otrzyma e-mail z linkiem aktywacyjnym. Po kliknięciu w link, sam ustali swój 
                  4-6 cyfrowy PIN dostępowy. Administrator nie będzie miał wglądu w PIN.
                </AlertDescription>
              </Alert>

              <FormField
                control={form.control}
                name="developer_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nazwa dewelopera</FormLabel>
                    <FormControl>
                      <Input placeholder="np. ABC Development Sp. z o.o." {...field} />
                    </FormControl>
                    <FormDescription>
                      Pełna nazwa firmy deweloperskiej
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="developer_email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Adres e-mail</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="kontakt@deweloper.pl" {...field} />
                    </FormControl>
                    <FormDescription>
                      Na ten adres zostanie wysłany link aktywacyjny
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleClose}>
                  Anuluj
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Tworzenie..." : "Utwórz dostęp"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        ) : (
          <div className="space-y-4">
            <Alert className="bg-green-500/10 border-green-500/20">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-600">Dostęp utworzony pomyślnie!</AlertTitle>
              <AlertDescription className="text-green-600/80">
                Link aktywacyjny został wygenerowany. W środowisku produkcyjnym zostanie wysłany 
                automatycznie na adres e-mail dewelopera.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Link aktywacyjny (development)</Label>
              <div className="flex gap-2">
                <Input value={activationUrl} readOnly className="font-mono text-xs" />
                <Button size="icon" variant="outline" onClick={handleCopyUrl}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Link wygasa za 7 dni od momentu utworzenia
              </p>
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Produkcja: Automatyczna wysyłka e-mail</AlertTitle>
              <AlertDescription>
                W środowisku produkcyjnym link zostanie automatycznie wysłany przez n8n na adres 
                e-mail dewelopera. Administrator nie zobaczy linku aktywacyjnego.
              </AlertDescription>
            </Alert>

            <DialogFooter>
              <Button onClick={handleClose}>Zamknij</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
