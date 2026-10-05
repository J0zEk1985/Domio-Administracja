import { useRef, useState } from "react";

import { OrderEmailTokenList } from "@/components/communities/OrderEmailTokenList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  RESIDENT_ORDER_SIMPLE_BODY,
  RESIDENT_ORDER_SIMPLE_SUBJECT,
  insertResidentOrderToken,
  isFactoryResidentOrderTemplate,
  residentOrderTemplateToTechnical,
} from "@/lib/residentOrderTemplateTokens";

type ActiveField = "subject" | "body";

type Props = {
  subject: string;
  body: string;
  onSubjectChange: (value: string) => void;
  onBodyChange: (value: string) => void;
};

export function OrderEmailTemplateFields({ subject, body, onSubjectChange, onBodyChange }: Props) {
  const [activeField, setActiveField] = useState<ActiveField>("body");
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const technicalSubject = residentOrderTemplateToTechnical(subject);
  const technicalBody = residentOrderTemplateToTechnical(body);
  const usingFactoryTemplate = isFactoryResidentOrderTemplate(technicalSubject, technicalBody);

  function insertToken(friendly: string) {
    const field = activeField;
    const current = field === "subject" ? subject : body;
    const element = field === "subject" ? subjectRef.current : bodyRef.current;
    const start = element?.selectionStart ?? current.length;
    const end = element?.selectionEnd ?? current.length;
    const next = insertResidentOrderToken(current, friendly, start, end);
    if (field === "subject") onSubjectChange(next.value);
    else onBodyChange(next.value);
    requestAnimationFrame(() => {
      const node = field === "subject" ? subjectRef.current : bodyRef.current;
      node?.focus();
      node?.setSelectionRange(next.cursor, next.cursor);
    });
  }

  function applySimpleTemplate() {
    const alreadySimple = subject === RESIDENT_ORDER_SIMPLE_SUBJECT && body === RESIDENT_ORDER_SIMPLE_BODY;
    if (!usingFactoryTemplate && !alreadySimple) {
      const confirmed = window.confirm("Zastąpić obecną treść prostym szablonem?");
      if (!confirmed) return;
    }
    onSubjectChange(RESIDENT_ORDER_SIMPLE_SUBJECT);
    onBodyChange(RESIDENT_ORDER_SIMPLE_BODY);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="order-subject">Temat wiadomości</Label>
        <Input
          id="order-subject"
          ref={subjectRef}
          value={subject}
          onChange={(ev) => onSubjectChange(ev.target.value)}
          onFocus={() => setActiveField("subject")}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="order-body">Treść wiadomości</Label>
        <Textarea
          id="order-body"
          ref={bodyRef}
          value={body}
          onChange={(ev) => onBodyChange(ev.target.value)}
          onFocus={() => setActiveField("body")}
          rows={10}
          className="text-sm leading-relaxed"
        />
      </div>
      <OrderEmailTokenList onInsert={insertToken} />
      {usingFactoryTemplate ? (
        <p className="text-sm text-muted-foreground">
          Ten szablon zawiera dużo dodatkowych danych. Prosta wersja zostawia tylko to, czego firma potrzebuje do
          realizacji.
        </p>
      ) : null}
      <Button type="button" variant="outline" onClick={applySimpleTemplate}>
        Wstaw prosty szablon
      </Button>
    </div>
  );
}
