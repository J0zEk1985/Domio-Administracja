import { describe, expect, it } from "vitest";

import {
  acceptStyleDraft,
  buildStyleInstructions,
  mailSamplesToText,
  redactContacts,
} from "../../supabase/functions/_shared/agentStyleDraft.ts";

describe("operator style draft", () => {
  it("drops a thin model answer and keeps a usable rule", () => {
    expect(acceptStyleDraft("ZA_MALO_MATERIALU")).toBeNull();
    expect(acceptStyleDraft("krótko")).toBeNull();
    const draft = acceptStyleDraft(
      "Ton rzeczowy, bez zdrobnień. Stały zwrot na początku to Dzień dobry. Sprawy sporne opisuje faktami i prosi o termin, bez groźby.",
    );
    expect(draft).toContain("Dzień dobry");
  });

  it("redacts addresses before the draft can be saved", () => {
    const draft = acceptStyleDraft(
      "Ton spokojny. Kontakt tylko przez biuro jan.kowalski@wspolnota.pl i numer 48111222333 zostaje poza pismem do mieszkańca, a podpis to imię i funkcja.",
    );
    expect(draft).not.toContain("jan.kowalski@wspolnota.pl");
    expect(draft).not.toContain("48111222333");
    expect(draft).toContain("[adres]");
  });

  it("keeps the model instructions free of template markers", () => {
    const instructions = buildStyleInstructions();
    expect(instructions).toContain("ZA_MALO_MATERIALU");
    expect(instructions).not.toContain("{{");
  });

  it("uses sent letters only when the body is long enough", () => {
    const text = mailSamplesToText([
      { subject: "Wezwanie", body: "x" },
      { subject: "Balkon", body: "Dzień dobry. Proszę o usunięcie przedmiotów z balkonu do piątku. Pozdrawiam, Anna Nowak, zarządca." },
    ]);
    expect(text).toContain("Balkon");
    expect(text).not.toContain("Wezwanie");
    expect(redactContacts("a@b.pl")).toBe("[adres]");
  });
});
