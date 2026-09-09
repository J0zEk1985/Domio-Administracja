import { describe, expect, it } from "vitest";
import { firstChecklistActivityName, formatMissedCleaningDetail } from "@/lib/dashboardMissedCleaning";

describe("firstChecklistActivityName", () => {
  it("reads name from the first SOP checklist item", () => {
    expect(
      firstChecklistActivityName([{ id: "1", name: "Mycie podłogi klatki", completed: false }]),
    ).toBe("Mycie podłogi klatki");
  });

  it("falls back to task_name", () => {
    expect(firstChecklistActivityName([{ task_name: "Odkurzanie" }])).toBe("Odkurzanie");
  });

  it("returns null for empty or unknown shapes", () => {
    expect(firstChecklistActivityName(null)).toBeNull();
    expect(firstChecklistActivityName([])).toBeNull();
    expect(firstChecklistActivityName({ completed: false })).toBeNull();
  });
});

describe("formatMissedCleaningDetail", () => {
  it("shows section and activity instead of generic SOP", () => {
    expect(
      formatMissedCleaningDetail({
        task_type: "sop_standard",
        coordinator_notes: null,
        section: { name: "Parter" },
        checklist: [{ name: "Mycie schodów" }],
      }),
    ).toBe("Parter · Mycie schodów");
  });

  it("uses coordinator notes when checklist has no name", () => {
    expect(
      formatMissedCleaningDetail({
        task_type: "employee_extra",
        coordinator_notes: "Wywóz mebli",
        section: { name: "Klatka A" },
        checklist: [],
      }),
    ).toBe("Klatka A · Wywóz mebli");
  });

  it("falls back to task type when nothing else is present", () => {
    expect(
      formatMissedCleaningDetail({
        task_type: "sop_standard",
        coordinator_notes: null,
        section: null,
        checklist: null,
      }),
    ).toBe("SOP");
  });
});
