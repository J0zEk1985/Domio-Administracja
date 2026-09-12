import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSaveVendorEmailTemplate, useVendorEmailTemplates } from "@/hooks/useVendorEmail";
import {
  VENDOR_EMAIL_EVENT_LABEL,
  VENDOR_EMAIL_INBOUND_CAPTURE_PLACEHOLDERS,
  type VendorEmailEventType,
  type VendorEmailInboundTemplate,
} from "@/types/vendorEmail";

const EVENT_TYPES: VendorEmailEventType[] = [
  "accepted",
  "assigned_technician",
  "completed",
  "rejected",
];

type Draft = {
  subjectPattern: string;
  bodyPattern: string;
  sampleBody: string;
};

function draftFrom(templates: VendorEmailInboundTemplate[], eventType: VendorEmailEventType): Draft {
  const row = templates.find((t) => t.eventType === eventType);
  return {
    subjectPattern: row?.subjectPattern ?? "",
    bodyPattern: row?.bodyPattern ?? "",
    sampleBody: row?.sampleBody ?? "",
  };
}

type Props = {
  vendorId: string;
};

export function VendorEmailInboundTemplatesCard({ vendorId }: Props) {
  const templatesQuery = useVendorEmailTemplates(vendorId);
  const save = useSaveVendorEmailTemplate(vendorId);
  const templates = templatesQuery.data ?? [];
  const [drafts, setDrafts] = useState<Record<VendorEmailEventType, Draft>>({
    accepted: draftFrom([], "accepted"),
    assigned_technician: draftFrom([], "assigned_technician"),
    completed: draftFrom([], "completed"),
    rejected: draftFrom([], "rejected"),
  });

  useEffect(() => {
    setDrafts({
      accepted: draftFrom(templates, "accepted"),
      assigned_technician: draftFrom(templates, "assigned_technician"),
      completed: draftFrom(templates, "completed"),
      rejected: draftFrom(templates, "rejected"),
    });
  }, [templates, vendorId]);

  if (templatesQuery.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Wzorce statusów z CRM</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Wczytywanie wzorców…</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Wzorce statusów z CRM</CardTitle>
        <CardDescription>
          Wklej przykładową wiadomość i oznacz zmienne:{" "}
          {VENDOR_EMAIL_INBOUND_CAPTURE_PLACEHOLDERS.join(", ")}. Stały tekst musi być identyczny jak
          w mailu firmy.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {EVENT_TYPES.map((eventType) => {
          const draft = drafts[eventType];
          return (
            <div key={eventType} className="space-y-3 rounded-xl border border-border/60 p-4">
              <h3 className="text-sm font-semibold">{VENDOR_EMAIL_EVENT_LABEL[eventType]}</h3>
              <div className="space-y-1.5">
                <Label htmlFor={`subj-${eventType}`}>Temat (opcjonalny wzorzec)</Label>
                <Input
                  id={`subj-${eventType}`}
                  value={draft.subjectPattern}
                  onChange={(ev) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [eventType]: { ...prev[eventType], subjectPattern: ev.target.value },
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`sample-${eventType}`}>Przykładowa treść z ich systemu</Label>
                <Textarea
                  id={`sample-${eventType}`}
                  value={draft.sampleBody}
                  onChange={(ev) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [eventType]: { ...prev[eventType], sampleBody: ev.target.value },
                    }))
                  }
                  rows={4}
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`body-${eventType}`}>Wzorzec dopasowania</Label>
                <Textarea
                  id={`body-${eventType}`}
                  value={draft.bodyPattern}
                  onChange={(ev) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [eventType]: { ...prev[eventType], bodyPattern: ev.target.value },
                    }))
                  }
                  rows={6}
                  className="font-mono text-xs"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!draft.sampleBody.trim()}
                  onClick={() =>
                    setDrafts((prev) => ({
                      ...prev,
                      [eventType]: {
                        ...prev[eventType],
                        bodyPattern: prev[eventType].sampleBody,
                      },
                    }))
                  }
                >
                  Użyj próbki jako wzorca
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={save.isPending || draft.bodyPattern.trim().length === 0}
                  onClick={() =>
                    save.mutate({
                      vendorId,
                      eventType,
                      subjectPattern: draft.subjectPattern,
                      bodyPattern: draft.bodyPattern,
                      sampleBody: draft.sampleBody,
                    })
                  }
                >
                  {save.isPending ? "Zapisywanie…" : "Zapisz wzorzec"}
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
