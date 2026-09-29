import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  RESIDENT_ORDER_TEMPLATE_TOKENS,
  type ResidentOrderTemplateTokenGroup,
} from "@/lib/residentOrderTemplateTokens";

const PRIMARY_GROUPS: { id: ResidentOrderTemplateTokenGroup; title: string }[] = [
  { id: "order", title: "Zamówienie" },
  { id: "place", title: "Miejsce" },
  { id: "resident", title: "Mieszkaniec" },
  { id: "sender", title: "Twoja firma" },
];

type Props = {
  onInsert: (friendlyToken: string) => void;
};

export function OrderEmailTokenList({ onInsert }: Props) {
  const [showExtra, setShowExtra] = useState(false);
  const extra = RESIDENT_ORDER_TEMPLATE_TOKENS.filter((token) => token.group === "extra");

  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="space-y-1">
        <p className="text-sm font-medium">Pola do wstawienia</p>
        <p className="text-sm text-muted-foreground">
          Kliknij pole, aby wstawić je w miejscu kursora. Przy wysyłce system wpisze tam dane zamówienia.
        </p>
      </div>
      <div className="space-y-3">
        {PRIMARY_GROUPS.map((group) => (
          <TokenGroup
            key={group.id}
            title={group.title}
            tokens={RESIDENT_ORDER_TEMPLATE_TOKENS.filter((token) => token.group === group.id)}
            onInsert={onInsert}
          />
        ))}
      </div>
      <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={() => setShowExtra((open) => !open)}>
        {showExtra ? "Ukryj pozostałe pola" : "Pokaż pozostałe pola"}
      </Button>
      {showExtra ? (
        <div className="space-y-1">
          <p className="px-2 text-sm text-muted-foreground">
            Dane firmy, wspólnoty i dodatkowego kontaktu. Zwykle nie są potrzebne.
          </p>
          {extra.map((token) => (
            <TokenButton key={token.friendly} friendly={token.friendly} label={token.label} onInsert={onInsert} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TokenGroup({
  title,
  tokens,
  onInsert,
}: {
  title: string;
  tokens: readonly { friendly: string; label: string }[];
  onInsert: (friendlyToken: string) => void;
}) {
  return (
    <div className="space-y-0.5">
      <p className="px-2 text-sm font-medium">{title}</p>
      {tokens.map((token) => (
        <TokenButton key={token.friendly} friendly={token.friendly} label={token.label} onInsert={onInsert} />
      ))}
    </div>
  );
}

function TokenButton({
  friendly,
  label,
  onInsert,
}: {
  friendly: string;
  label: string;
  onInsert: (friendlyToken: string) => void;
}) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onInsert(friendly)}
      className="grid w-full grid-cols-1 gap-0.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-background sm:grid-cols-[14.5rem_minmax(0,1fr)] sm:items-baseline sm:gap-3"
    >
      <span className="font-medium text-foreground">{friendly}</span>
      <span className="text-muted-foreground">{label}</span>
    </button>
  );
}
