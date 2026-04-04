import { useCallback, useMemo, useState } from "react";
import { Loader2, Mic, Sparkles } from "lucide-react";

import { CreateIssueForm } from "@/components/triage/CreateIssueForm";
import { useCreateIssue, type CreateIssueFormValues } from "@/hooks/useCreateIssue";
import { useProperties } from "@/hooks/useProperties";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { cn } from "@/lib/utils";

type AiPreview = {
  category: string;
  buildingLabel: string;
  locationId: string;
  description: string;
};

/**
 * Mock AI pipeline: parses free text and suggests triage fields (replace with real API later).
 */
async function processWithAI(
  raw: string,
  properties: { id: string; name: string; address: string }[],
): Promise<AiPreview | null> {
  await new Promise((r) => setTimeout(r, 700));
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const first = properties[0];
  if (!first) {
    return null;
  }
  const category = "Hydrauliczna";
  const description =
    trimmed.length >= 10 ? trimmed : `${trimmed} — dopisano treść, aby spełnić minimum znaków.`;
  return {
    category,
    buildingLabel: `${first.name} — ${first.address}`,
    locationId: first.id,
    description,
  };
}

export default function QuickActions() {
  const [tab, setTab] = useState<"ai" | "standard">("ai");
  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [preview, setPreview] = useState<AiPreview | null>(null);

  const { data: properties = [], isLoading: propertiesLoading } = useProperties(tab === "ai");

  const createIssue = useCreateIssue();

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
    setPreview(null);
    try {
      const result = await processWithAI(aiText, properties);
      setPreview(result);
    } catch (e) {
      console.error("[QuickActions] processWithAI:", e);
    } finally {
      setAiBusy(false);
    }
  }

  function handleConfirmAi() {
    if (!preview) return;
    const match = properties.find((p) => p.id === preview.locationId);
    const values: CreateIssueFormValues = {
      location_id: preview.locationId,
      community_id: match?.communityId ?? "",
      category: preview.category,
      priority: "medium",
      description: preview.description,
    };
    createIssue.mutate(values, {
      onSuccess: () => {
        setAiText("");
        setPreview(null);
      },
    });
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
                Wklej lub dyktuj treść — symulacja rozpozna kategorię i przypisze budynek (pierwszy z listy w
                organizacji).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Textarea
                  value={aiText}
                  onChange={(e) => setAiText(e.target.value)}
                  placeholder="Np. przeciek przy windzie w piwnicy, potrzebny hydraulik…"
                  rows={8}
                  disabled={aiBusy || createIssue.isPending}
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
                    disabled={aiBusy || createIssue.isPending}
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

          {preview ? (
            <Card className="border-primary/25 bg-muted/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Podgląd</CardTitle>
                <CardDescription>Wynik analizy (mock) — sprawdź i zatwierdź.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Wykryto kategorię: </span>
                  <span className="font-medium">{preview.category}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Budynek: </span>
                  <span className="font-medium">{preview.buildingLabel}</span>
                </div>
                <p className="rounded-md border bg-background/80 p-3 text-muted-foreground">
                  {preview.description}
                </p>
                <Button
                  type="button"
                  className="w-full"
                  disabled={createIssue.isPending}
                  onClick={handleConfirmAi}
                >
                  {createIssue.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  ) : null}
                  Zatwierdź i wyślij
                </Button>
              </CardContent>
            </Card>
          ) : null}
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
