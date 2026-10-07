import { describe, expect, it } from "vitest";

import {
  minimumStoredCollectionDate,
  planWasteScheduleInserts,
} from "@/lib/wasteScheduleSyncPlan";

describe("planWasteScheduleInserts", () => {
  it("keeps dates inside the 7-day window and drops duplicates", () => {
    expect(minimumStoredCollectionDate("2026-10-07")).toBe("2026-09-30");

    const plan = planWasteScheduleInserts(
      [
        { wasteType: "bulk", collectionDate: "2026-09-29" },
        { wasteType: "bulk", collectionDate: "2026-10-20" },
        { wasteType: "bulk", collectionDate: "2026-10-20" },
        { wasteType: "bulk", collectionDate: "2026-11-30" },
      ],
      new Set(["bulk|2026-11-30"]),
      "2026-10-07",
    );

    expect(plan.toInsert).toEqual([{ wasteType: "bulk", collectionDate: "2026-10-20" }]);
    expect(plan.skippedTooOld).toBe(1);
    expect(plan.skippedExisting).toBe(2);
  });
});
