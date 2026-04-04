/** Canonical issue categories for triage / property issues (PL labels, stable DB values). */
export const ISSUE_CATEGORY_OPTIONS = [
  { value: "Elektryczna", label: "Elektryczna" },
  { value: "Hydrauliczna", label: "Hydrauliczna" },
  { value: "Ogólnobudowlana", label: "Ogólnobudowlana" },
  { value: "Sprzęt", label: "Sprzęt" },
  { value: "Sprzątanie doraźne", label: "Sprzątanie doraźne" },
  { value: "Prace porządkowe", label: "Prace porządkowe" },
] as const;

export type IssueCategoryValue = (typeof ISSUE_CATEGORY_OPTIONS)[number]["value"];
