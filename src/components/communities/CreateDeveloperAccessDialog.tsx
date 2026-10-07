/**
 * Create Developer Access Dialog
 * Dialog do dodawania dostępu dewelopera dla Wspólnoty
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Mail, CheckCircle2 } from "lucide-react";
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
  const [created, setCreated] = useState(false);
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
      await createMutation.mutateAsync({
        community_id: communityId,
        developer_email: values.developer_email,
        developer_name: values.developer_name,
      });

      setCreated(true);
      toast.success("Dostęp dewelopera został utworzony. Link aktywacyjny został wysłany.");
    } catch (error: any) {
      console.error("Błąd tworzenia dostępu dewelopera:", error);
      
      if (error.message?.includes("developer_access_already_exists")) {
        toast.error("Dostęp dewelopera dla tej Wspólnoty już istnieje");
      } else if (error.message?.includes("unauthorized")) {
        toast.error("Brak uprawnień. Sprawdź czy jesteś administratorem tej Wspólnoty.");
      } else if (error.message?.includes("community_not_found")) {
        toast.error("Nie znaleziono Wspólnoty");
      } else {
        toast.error(`Nie udało się utworzyć dostępu dewelopera: ${error.message || "Nieznany błąd"}`);
      }
    }
  };

  const handleClose = () => {
    form.reset();
    setCreated(false);
    onOpenChange(false);
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

        {!created ? (
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
              <AlertTitle className="text-green-600">Dostęp utworzony pomyślnie</AlertTitle>
              <AlertDescription className="text-green-600/80">
                Link aktywacyjny został wysłany na adres e-mail dewelopera.
                Po kliknięciu w link deweloper ustawi swój PIN.
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
