import { useState } from "react";

import { AiTriagePanel } from "@/components/field/AiTriagePanel";
import { FieldAnnouncementForm } from "@/components/field/FieldAnnouncementForm";
import { CreateIssueForm } from "@/components/triage/CreateIssueForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** Flip to true to restore the AI assistant tab in the field panel. */
const SHOW_AI_ASSISTANT = false;

type FieldTab = "standard" | "notice" | "ai";

export default function QuickActions() {
  const [tab, setTab] = useState<FieldTab>("standard");

  return (
    <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-lg flex-col gap-4 px-4 pb-10 pt-4 md:pt-6">
      <div>
        <h1 className="font-display text-xl font-semibold tracking-tight md:text-2xl">Panel terenowy</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Szybkie zgłoszenia i ogłoszenia w terenie — budynek podpowiada GPS.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as FieldTab)} className="w-full">
        <TabsList className={SHOW_AI_ASSISTANT ? "grid w-full grid-cols-3" : "grid w-full grid-cols-2"}>
          {SHOW_AI_ASSISTANT ? <TabsTrigger value="ai">Asystent AI</TabsTrigger> : null}
          <TabsTrigger value="standard">Zgłoszenie</TabsTrigger>
          <TabsTrigger value="notice">Ogłoszenie</TabsTrigger>
        </TabsList>

        {SHOW_AI_ASSISTANT ? (
          <TabsContent value="ai" className="mt-4">
            <AiTriagePanel enabled={tab === "ai"} />
          </TabsContent>
        ) : null}

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

        <TabsContent value="notice" className="mt-4">
          <Card className="border-border/80 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Ogłoszenie na nieruchomości</CardTitle>
              <CardDescription>
                GPS wybiera najbliższy budynek — ogłoszenie pojawi się na tablicy tej nieruchomości.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldAnnouncementForm enabled={tab === "notice"} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
