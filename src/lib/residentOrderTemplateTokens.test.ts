import { describe, expect, it } from "vitest";

import {
  RESIDENT_ORDER_FACTORY_BODY,
  RESIDENT_ORDER_FACTORY_SUBJECT,
  RESIDENT_ORDER_SIMPLE_BODY,
  RESIDENT_ORDER_SIMPLE_SUBJECT,
  RESIDENT_ORDER_TEMPLATE_TOKENS,
  insertResidentOrderToken,
  isFactoryResidentOrderTemplate,
  residentOrderTemplateToFriendly,
  residentOrderTemplateToTechnical,
} from "@/lib/residentOrderTemplateTokens";

describe("residentOrderTemplate tokens", () => {
  it("uses unique friendly and technical names", () => {
    const friendly = RESIDENT_ORDER_TEMPLATE_TOKENS.map((token) => token.friendly);
    const technical = RESIDENT_ORDER_TEMPLATE_TOKENS.map((token) => token.technical);
    expect(new Set(friendly).size).toBe(friendly.length);
    expect(new Set(technical).size).toBe(technical.length);
  });

  it("maps the company name to #nazwa_firmy", () => {
    expect(residentOrderTemplateToFriendly("Firma: {{org.name}}")).toBe("Firma: #nazwa_firmy");
    expect(residentOrderTemplateToTechnical("Firma: #nazwa_firmy")).toBe("Firma: {{org.name}}");
  });

  it("round-trips every catalog token and the factory letter", () => {
    for (const token of RESIDENT_ORDER_TEMPLATE_TOKENS) {
      expect(residentOrderTemplateToFriendly(token.technical)).toBe(token.friendly);
      expect(residentOrderTemplateToTechnical(token.friendly)).toBe(token.technical);
    }
    expect(residentOrderTemplateToTechnical(residentOrderTemplateToFriendly(RESIDENT_ORDER_FACTORY_SUBJECT))).toBe(
      RESIDENT_ORDER_FACTORY_SUBJECT,
    );
    expect(residentOrderTemplateToTechnical(residentOrderTemplateToFriendly(RESIDENT_ORDER_FACTORY_BODY))).toBe(
      RESIDENT_ORDER_FACTORY_BODY,
    );
  });

  it("stores the simple letter in the technical form used at send time", () => {
    const subject = residentOrderTemplateToTechnical(RESIDENT_ORDER_SIMPLE_SUBJECT);
    const body = residentOrderTemplateToTechnical(RESIDENT_ORDER_SIMPLE_BODY);
    expect(subject).toContain("{{item.name}}");
    expect(subject).not.toContain("#");
    expect(body).toContain("{{org.name}}");
    expect(body).not.toContain("#");
    expect(residentOrderTemplateToFriendly(body)).toBe(RESIDENT_ORDER_SIMPLE_BODY);
  });

  it("leaves unknown text and lookalike tokens untouched", () => {
    expect(residentOrderTemplateToTechnical("zwykły tekst i #nieznane")).toBe("zwykły tekst i #nieznane");
    expect(residentOrderTemplateToTechnical("kod #nazwa_firmy_x")).toBe("kod #nazwa_firmy_x");
  });

  it("recognizes the untouched factory template", () => {
    expect(isFactoryResidentOrderTemplate(RESIDENT_ORDER_FACTORY_SUBJECT, RESIDENT_ORDER_FACTORY_BODY)).toBe(true);
    expect(isFactoryResidentOrderTemplate(RESIDENT_ORDER_SIMPLE_SUBJECT, RESIDENT_ORDER_SIMPLE_BODY)).toBe(false);
  });
});

describe("insertResidentOrderToken", () => {
  it("inserts at the cursor and adds a space after a word", () => {
    const result = insertResidentOrderToken("Adres:", "#adres_budynku", 6, 6);
    expect(result).toEqual({ value: "Adres: #adres_budynku", cursor: "Adres: #adres_budynku".length });
  });

  it("replaces the current selection", () => {
    const result = insertResidentOrderToken("Lokal XX", "#numer_lokalu", 6, 8);
    expect(result.value).toBe("Lokal #numer_lokalu");
  });

  it("keeps the token separated from the following word", () => {
    const result = insertResidentOrderToken("Dzień dobry", "#cena", 0, 0);
    expect(result.value).toBe("#cena Dzień dobry");
  });
});
