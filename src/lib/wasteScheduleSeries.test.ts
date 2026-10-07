import { describe, expect, it } from "vitest";

import {
  addMonthsToIsoDate,
  generateWasteCollectionDates,
  MAX_WASTE_SERIES_DATES,
} from "@/lib/wasteScheduleSeries";

describe("addMonthsToIsoDate", () => {
  it("moves a date six months ahead for the default planning horizon", () => {
    expect(addMonthsToIsoDate("2026-10-08", 6)).toBe("2027-04-08");
  });

  it("keeps the same day of month when the target month is long enough", () => {
    expect(addMonthsToIsoDate("2026-01-31", 6)).toBe("2026-07-31");
  });
});

describe("generateWasteCollectionDates", () => {
  it("includes the first and last day of a weekly series", () => {
    const { dates, truncated } = generateWasteCollectionDates("2026-10-08", "2027-04-08", "weekly");

    expect(truncated).toBe(false);
    expect(dates[0]).toBe("2026-10-08");
    expect(dates.at(-1)).toBe("2027-04-08");
    expect(dates).toHaveLength(27);
    expect(dates[1]).toBe("2026-10-15");
  });

  it("steps every two weeks", () => {
    const { dates } = generateWasteCollectionDates("2026-10-08", "2026-11-19", "biweekly");
    expect(dates).toEqual(["2026-10-08", "2026-10-22", "2026-11-05", "2026-11-19"]);
  });

  it("returns to the original day of month after a short month", () => {
    const { dates } = generateWasteCollectionDates("2026-01-31", "2026-04-30", "monthly");
    expect(dates).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("returns no dates when the range is reversed or invalid", () => {
    expect(generateWasteCollectionDates("2026-10-08", "2026-10-01", "weekly").dates).toEqual([]);
    expect(generateWasteCollectionDates("not-a-date", "2026-10-08", "weekly").dates).toEqual([]);
  });

  it("stops at the safety cap and marks the series as truncated", () => {
    const { dates, truncated } = generateWasteCollectionDates(
      "2026-01-01",
      "2030-01-01",
      "weekly",
      3,
    );

    expect(dates).toEqual(["2026-01-01", "2026-01-08", "2026-01-15"]);
    expect(truncated).toBe(true);
    expect(MAX_WASTE_SERIES_DATES).toBeGreaterThan(3);
  });
});
