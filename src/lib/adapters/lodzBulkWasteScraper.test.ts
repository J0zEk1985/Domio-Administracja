import { describe, expect, it, vi } from "vitest";

import {
  buildLodzBulkWasteRequestUrl,
  normalizeLodzStreet,
  parseLodzBulkWasteHtml,
  queryLodzBulkWasteSchedule,
} from "@/lib/adapters/lodzBulkWasteScraper";

const CALENDAR_HTML = `
<script>
  events: [
    { "id": "2", "title": "Gabaryty", "start": "2026-11-30", "description": "Gabaryty" },
    { "id": "1", "title": "Gabaryty", "start": "2026-10-09", "description": "Gabaryty" },
    { "id": "3", "title": "Gabaryty", "start": "2026-10-09T06:00:00", "description": "Gabaryty" },
    { "id": "4", "title": "Szkło", "start": "2026-10-01", "description": "Szkło" }
  ],
  eventDidMount: function () {}
</script>
`;

describe("parseLodzBulkWasteHtml", () => {
  it("returns unique bulky-waste dates sorted ascending", () => {
    expect(parseLodzBulkWasteHtml(CALENDAR_HTML)).toEqual([
      { wasteType: "bulk", collectionDate: "2026-10-09" },
      { wasteType: "bulk", collectionDate: "2026-11-30" },
    ]);
  });

  it("ignores the upstream-error sentence embedded in the page script", () => {
    const html = `${CALENDAR_HTML}
      posExc = data.indexOf('Ups... stało się coś nieoczekiwanego... wystąpił błąd');
    `;
    expect(parseLodzBulkWasteHtml(html)).toHaveLength(2);
  });

  it("reports a missing address schedule", () => {
    expect(() =>
      parseLodzBulkWasteHtml(
        `<div class="alert alert-info">Brak dostępnego harmonogramu dla wskazanego adresu!</div>`,
      ),
    ).toThrow("Brak dostępnego harmonogramu dla wskazanego adresu.");
  });
});

describe("buildLodzBulkWasteRequestUrl", () => {
  it("targets the bulky-waste fraction for the given address", () => {
    const url = buildLodzBulkWasteRequestUrl("Pienista", "51");
    expect(url).toContain("https://kartalodzianina.pl/wywozOdpadowTypy?ajax&");
    expect(url).toContain("typyOdpadow=470331414");
    expect(url).toContain("ulica=Pienista");
    expect(url).toContain("nrDomu=51");
    expect(url).toContain("rodzajZabudowy=2");
  });

  it("encodes Polish street names", () => {
    expect(normalizeLodzStreet("ul. Piotrkowska")).toBe("Piotrkowska");
    expect(buildLodzBulkWasteRequestUrl("Świętojańska", "12A")).toContain(
      "ulica=%C5%9Awi%C4%99toja%C5%84ska",
    );
    expect(buildLodzBulkWasteRequestUrl("Świętojańska", "12A")).toContain("nrDomu=12A");
  });
});

describe("queryLodzBulkWasteSchedule", () => {
  it("posts to Karta Łodzianina and returns parsed dates", async () => {
    const fetchImpl = vi.fn(async () => new Response(CALENDAR_HTML, { status: 200 }));

    const result = await queryLodzBulkWasteSchedule("ul. Pienista", "51", fetchImpl);

    expect(result.success).toBe(true);
    expect(result.schedules.map((item) => item.collectionDate)).toEqual([
      "2026-10-09",
      "2026-11-30",
    ]);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("ulica=Pienista");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-requested-with"]).toBe("XMLHttpRequest");
  });
});
