import { useState } from "react";

export type AiQuotaSnapshot = {
  ai_parses_limit: number;
  ai_parses_used: number;
  ai_parses_remaining: number;
  ai_prepaid_balance?: number;
  has_ai_auto: boolean;
};

const EMAIL_TEMPLATE = `Adres: ul. Przykładowa 1, 00-001 Warszawa
Opis: Cieknący kran w łazience na 2. piętrze
Kategoria: Hydrauliczna
Priorytet: medium
Zgłaszający: Jan Kowalski
Telefon: 500600700`;

export function InboundMailboxGuide({ quota }: { quota: AiQuotaSnapshot | null }) {
  const [prepaidNote, setPrepaidNote] = useState(false);
  const used = quota?.ai_parses_used ?? 0;
  const limit = quota?.ai_parses_limit ?? 20;
  const prepaid = quota?.ai_prepaid_balance ?? 0;
  const remaining = quota?.ai_parses_remaining ?? Math.max(limit - used, 0) + prepaid;
  const capacity = limit + prepaid;
  const pct = capacity > 0 ? Math.min(100, Math.round((used / capacity) * 100)) : 0;

  return (
    <div className="space-y-4">
      {quota ? (
        <div className="rounded-xl border border-border/70 bg-muted/30 px-4 py-3 space-y-2">
          <p className="text-sm font-medium">
            Analizy AI w tym miesiącu: {used} / {limit}
            {quota.has_ai_auto ? " · forward automatyczny dostępny" : " · próbka planu bazowego"}
          </p>
          <p className="text-sm text-muted-foreground">
            Pre-paid: {prepaid} (nie wygasają). Pozostało łącznie: {remaining}.
          </p>
          <div className="h-2 rounded-full bg-muted overflow-hidden" aria-hidden>
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">
            Pasek: wykorzystanie miesiąca wobec limitu planu i salda pre-paid ({used} / {capacity}).
          </p>
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs hover:bg-muted/60"
            onClick={() => setPrepaidNote(true)}
          >
            Dokup pakiet
          </button>
          {prepaidNote ? (
            <p className="text-sm text-muted-foreground">
              Zakup pakietu pre-paid nie jest jeszcze podpięty do płatności. Aktualne saldo niewygasających analiz:{" "}
              {prepaid}. Limit miesięczny resetuje się z początkiem miesiąca UTC i nie przechodzi na kolejny okres.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-xl border border-border/70 px-4 py-3 space-y-2 text-sm">
        <h3 className="font-medium">Tryb szablonu i tryb AI</h3>
        <p className="text-muted-foreground">
          Tryb ustrukturyzowany czyta etykiety w mailu (Adres, Opis, Kategoria, Priorytet, Zgłaszający, Telefon).
          Gdy limit AI jest dostępny, DOMIO i tak może uruchomić analizę i zużyć jedną analizę.
        </p>
        <p className="text-muted-foreground">
          Tryb automatyczny (forward od razu) wymaga planu z AI. Po wyczerpaniu limitu miesięcznego schodzą kredyty
          pre-paid. Gdy obie pule są puste, zostaje sam wzorzec. Mail bez dopasowanego budynku trafia do Triage jako
          nieprzypisany — nie jest odrzucany.
        </p>
        <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2 text-xs leading-relaxed">{EMAIL_TEMPLATE}</pre>
      </div>

      <div className="rounded-xl border border-border/70 px-4 py-3 space-y-2 text-sm">
        <h3 className="font-medium">Przekierowanie na alias DOMIO</h3>
        <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>Skopiuj alias z karty poniżej (usterki+moduł-skrót@domio.com.pl).</li>
          <li>
            Zimbra: Preferencje → Poczta → Odbieranie wiadomości → włącz przekazanie kopii i wklej alias DOMIO.
          </li>
          <li>
            OVH: E-mail → konto → Przekierowania → dodaj przekierowanie na alias. Kopię na skrzynce firmowej możesz
            zostawić jako archiwum.
          </li>
          <li>cPanel: Forwarders → Add Forwarder, z adresu firmowego na alias DOMIO.</li>
          <li>Wyślij wiadomość testową ze wzorca. Sprawdź ją w Triage, także gdy budynek nie zostanie rozpoznany.</li>
        </ol>
      </div>
    </div>
  );
}
