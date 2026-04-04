import { useCallback, useMemo, useState } from "react";
import { Loader2, Mic, Sparkles } from "lucide-react";

import { CreateIssueForm } from "@/components/triage/CreateIssueForm";
import type { CreateIssueFormValues } from "@/hooks/useCreateIssue";
import { useProperties } from "@/hooks/useProperties";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "@/components/ui/sonner";

type TriageIssueResponse = {
  categoryId: string;
  locationId: string;
  priority: CreateIssueFormValues["priority"];
  shortDescription: string;
  locationUnrecognized: boolean;
};

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "Nie udało się przetworzyć tekstu.";
}

export default function QuickActions() {
  const [tab, setTab] = useState<"ai" | "standard">("ai");
  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiPrefill, setAiPrefill] = useState<
    { version: number; values: Partial<CreateIssueFormValues> } | undefined
  >();
  const [locationNeedsManual, setLocationNeedsManual] = useState(false);

  const { data: properties = [], isLoading: propertiesLoading } = useProperties(tab === "ai");

  const onTranscript = useCallback((text: string) => {
    setAiText(text);
  }, []);

  const { isRecording, start, stop, isSupported: speechSupported } = useSpeechRecognition({
    onTranscript,
  });

  const canRunAi = useMemo(() => aiText.trim().length > 0 && !propertiesLoading && properties.length > 0, [
    aiText,
    propertiesLoading,
    properties.length,
  ]);

  async function handleProcessAi() {
    if (!canRunAi) return;
    setAiBusy(true);
    setLocationNeedsManual(false);
    try {
      const buildings = properties.map((p) => ({ id: p.id, name: p.name }));
      const { data, error } = await supabase.functions.invoke<TriageIssueResponse>("triage-issue", {
        body: { text: aiText.trim(), buildings },
      });

      if (error) {
        console.error("[QuickActions] triage-issue invoke:", error);
        toast.error(errMessage(error));
        return;
      }

      if (!data || typeof data !== "object") {
        console.error("[QuickActions] triage-issue empty data:", data);
        toast.error("Brak odpowiedzi z serwera analizy.");
        return;
      }

      if ("error" in data && typeof (data as { error?: string }).error === "string") {
        const msg = (data as { error: string }).error;
        console.error("[QuickActions] triage-issue body error:", msg);
        toast.error(msg);
        return;
      }

      const triage = data as TriageIssueResponse;
      const locId = triage.locationId?.trim() ?? "";
      const match = locId ? properties.find((p) => p.id === locId) : undefined;
      const unrecognized = triage.locationUnrecognized === true || !match;

      setLocationNeedsManual(unrecognized);

      setAiPrefill({
        version: Date.now(),
        values: {
          location_id: unrecognized ? "" : locId,
          community_id: match?.communityId ?? "",
          category: triage.categoryId,
          priority: triage.priority,
          description: triage.shortDescription,
        },
      });

      if (unrecognized) {
        toast.info("Wybierz budynek ręcznie — model nie dopasował lokalizacji do listy.");
      }
    } catch (e) {
      console.error("[QuickActions] handleProcessAi:", e);
      toast.error(errMessage(e));
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-lg flex-col gap-4 px-4 pb-10 pt-4 md:pt-6">
      <div>
        <h1 className="font-display text-xl font-semibold tracking-tight md:text-2xl">Panel terenowy</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Szybkie zgłoszenia — wybierz tryb pracy poniżej.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "ai" | "standard")} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="ai">Asystent AI</TabsTrigger>
          <TabsTrigger value="standard">Standardowe Zgłoszenie</TabsTrigger>
        </TabsList>

        <TabsContent value="ai" className="mt-4 space-y-4">
          <Card className="border-border/80 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" aria-hidden />
                Opisz problem
              </CardTitle>
              <CardDescription>
                Wklej lub dyktuj treść — analiza dopasuje kategorię, budynek i priorytet (sprawdź pola poniżej).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Textarea
                  value={aiText}
                  onChange={(e) => setAiText(e.target.value)}
                  placeholder="Np. przeciek przy windzie w piwnicy, potrzebny hydraulik…"
                  rows={8}
                  disabled={aiBusy}
                  className="min-h-[180px] resize-none pb-12 pr-14 text-base"
                />
                {speechSupported ? (
                  <Button
                    type="button"
                    size="icon"
                    variant={isRecording ? "destructive" : "secondary"}
                    className={cn(
                      "absolute bottom-3 right-3 h-11 w-11 rounded-full shadow-md",
                      isRecording && "animate-pulse",
                    )}
                    disabled={aiBusy}
                    aria-pressed={isRecording}
                    aria-label={isRecording ? "Zatrzymaj dyktowanie" : "Dyktuj tekst mikrofonem"}
                    onClick={() => {
                      if (isRecording) {
                        stop();
                      } else {
                        start(aiText);
                      }
                    }}
                  >
                    <Mic className="h-5 w-5" aria-hidden />
                  </Button>
                ) : null}
              </div>
              {!propertiesLoading && properties.length === 0 ? (
                <p className="text-sm text-destructive">
                  Brak budynków w organizacji — dodaj nieruchomość lub skontaktuj się z administratorem.
                </p>
              ) : null}
              <Button
                type="button"
                className="w-full"
                size="lg"
                disabled={!canRunAi || aiBusy}
                onClick={() => void handleProcessAi()}
              >
                {aiBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
                Przetwórz zgłoszenie
              </Button>
            </CardContent>
          </Card>

          {locationNeedsManual ? (
            <Alert>
              <AlertTitle>Wymagany wybór budynku</AlertTitle>
              <AlertDescription>
                Nie udało się jednoznacznie dopasować lokalizacji do listy dostępnych budynków. Uzupełnij pole
                „Budynek” ręcznie przed wysłaniem zgłoszenia.
              </AlertDescription>
            </Alert>
          ) : null}

          <Card className="border-border/80 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Zgłoszenie (podgląd i edycja)</CardTitle>
              <CardDescription>
                Pola wypełnia asystent — możesz je poprawić przed utworzeniem zgłoszenia.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CreateIssueForm
                enabled={tab === "ai"}
                fieldServiceMode
                aiPrefill={aiPrefill}
                onSuccess={() => {
                  setAiText("");
                  setAiPrefill(undefined);
                  setLocationNeedsManual(false);
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="standard" className="mt-4">
          <Card className="border-border/80 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Formularz zgłoszenia</CardTitle>
              <CardDescription>
                Ten sam formularz co w skrzynce zgłoszeń — jedno źródło prawdy pól i walidacji.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CreateIssueForm enabled={tab === "standard"} fieldServiceMode />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
