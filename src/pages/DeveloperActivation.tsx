/**
 * Developer Activation Page
 * Strona aktywacji dostępu dewelopera - ustawienie PIN-u
 */
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Building2, Lock, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/sonner";

const formSchema = z.object({
  pin: z
    .string()
    .regex(/^\d{4,6}$/, "PIN musi składać się z 4-6 cyfr")
    .min(4, "PIN musi mieć minimum 4 cyfry")
    .max(6, "PIN może mieć maksymalnie 6 cyfr"),
  confirmPin: z.string(),
}).refine((data) => data.pin === data.confirmPin, {
  message: "PIN-y muszą być identyczne",
  path: ["confirmPin"],
});

type FormValues = z.infer<typeof formSchema>;

interface ActivationInfo {
  developer_name: string;
  developer_email: string;
  community_name: string;
  community_legal_name: string | null;
}

export default function DeveloperActivation() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [activationInfo, setActivationInfo] = useState<ActivationInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);
  const [success, setSuccess] = useState(false);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      pin: "",
      confirmPin: "",
    },
  });

  useEffect(() => {
    loadActivationInfo();
  }, [token]);

  const loadActivationInfo = async () => {
    if (!token) {
      setError("Brak tokenu aktywacyjnego");
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.rpc("get_developer_activation_info", {
        p_activation_token: token,
      });

      if (error) throw error;

      if (!data || !data.ok) {
        setError(data?.error === "token_invalid_or_expired" 
          ? "Token aktywacyjny jest nieprawidłowy lub wygasł"
          : "Nie udało się pobrać informacji o aktywacji"
        );
        return;
      }

      setActivationInfo({
        developer_name: data.developer_name,
        developer_email: data.developer_email,
        community_name: data.community_name,
        community_legal_name: data.community_legal_name,
      });
    } catch (err: any) {
      console.error("Error loading activation info:", err);
      setError("Wystąpił błąd podczas ładowania danych");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (values: FormValues) => {
    if (!token) return;

    setActivating(true);
    try {
      const { data, error } = await supabase.rpc("activate_developer_access", {
        p_activation_token: token,
        p_pin: values.pin,
      });

      if (error) throw error;

      if (!data || !data.ok) {
        throw new Error(data?.error || "Nie udało się aktywować dostępu");
      }

      setPortalUrl(typeof data.portal_url === "string" ? data.portal_url : null);
      setSuccess(true);
      toast.success("Konto zostało aktywowane pomyślnie!");
    } catch (err: any) {
      console.error("Activation error:", err);
      toast.error("Nie udało się aktywować konta");
      setError(err.message || "Wystąpił błąd podczas aktywacji");
    } finally {
      setActivating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !activationInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-destructive/10">
                <AlertCircle className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <CardTitle>Błąd aktywacji</CardTitle>
                <CardDescription>Nie można aktywować dostępu</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Wystąpił problem</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </CardContent>
          <CardFooter>
            <p className="text-sm text-muted-foreground">
              Jeśli problem będzie się powtarzał, skontaktuj się z administratorem wspólnoty.
            </p>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-green-100 dark:bg-green-900/20">
                <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <CardTitle>Konto aktywowane!</CardTitle>
                <CardDescription>Twoje konto zostało pomyślnie aktywowane</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-600 dark:text-green-400">Aktywacja zakończona</AlertTitle>
              <AlertDescription className="text-green-600/80 dark:text-green-400/80">
                Twój PIN został ustawiony. Możesz teraz zalogować się do portalu usterek.
              </AlertDescription>
            </Alert>

            <div className="space-y-2 p-4 bg-muted rounded-lg">
              <p className="text-sm font-medium">Jak się zalogować?</p>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Otwórz link do portalu usterek</li>
                <li>Wprowadź swój 4-6 cyfrowy PIN</li>
                <li>Przeglądaj i zarządzaj usterkami</li>
              </ol>
            </div>

            {portalUrl ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">Link do portalu usterek</p>
                <a
                  href={portalUrl}
                  className="block rounded-md border border-border/60 bg-muted/20 px-3 py-2 font-mono text-xs break-all text-primary underline-offset-2 hover:underline"
                >
                  {portalUrl}
                </a>
              </div>
            ) : null}
          </CardContent>
          <CardFooter className="text-sm text-muted-foreground">
            Ten sam adres portalu jest w mailu aktywacyjnym. Link aktywacyjny działa tylko raz.
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-full bg-primary/10">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle>Aktywacja portalu dewelopera</CardTitle>
              <CardDescription>Ustaw swój PIN dostępowy</CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="space-y-2 p-4 bg-muted rounded-lg">
            <p className="text-sm font-medium">Informacje o koncie</p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Deweloper:</span>
                <span className="font-medium">{activationInfo.developer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">E-mail:</span>
                <span className="font-medium">{activationInfo.developer_email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Wspólnota:</span>
                <span className="font-medium">
                  {activationInfo.community_legal_name || activationInfo.community_name}
                </span>
              </div>
            </div>
          </div>

          <Alert>
            <Lock className="h-4 w-4" />
            <AlertTitle>Bezpieczeństwo PIN-u</AlertTitle>
            <AlertDescription>
              Twój PIN jest znany tylko Tobie. Administrator wspólnoty nie ma do niego dostępu.
              Używaj PIN-u, który łatwo zapamiętasz, ale trudno odgadnąć.
            </AlertDescription>
          </Alert>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="pin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>PIN dostępowy</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="4-6 cyfr"
                        maxLength={6}
                        {...field}
                        className="text-center text-2xl tracking-widest"
                      />
                    </FormControl>
                    <FormDescription>
                      Wprowadź 4-6 cyfrowy PIN, który będziesz używać do logowania
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Potwierdź PIN</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Powtórz PIN"
                        maxLength={6}
                        {...field}
                        className="text-center text-2xl tracking-widest"
                      />
                    </FormControl>
                    <FormDescription>
                      Wprowadź ten sam PIN ponownie
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={activating}>
                {activating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Aktywacja...
                  </>
                ) : (
                  <>
                    <Lock className="mr-2 h-4 w-4" />
                    Aktywuj konto
                  </>
                )}
              </Button>
            </form>
          </Form>
        </CardContent>

        <CardFooter className="text-xs text-muted-foreground text-center">
          Po aktywacji zobaczysz adres portalu usterek. Ten sam adres jest w mailu aktywacyjnym.
        </CardFooter>
      </Card>
    </div>
  );
}
