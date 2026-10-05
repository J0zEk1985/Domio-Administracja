/** Canonical issue categories — same values as Serwis `ISSUE_CATEGORY_OPTIONS`. */
export const ISSUE_CATEGORY_VALUES = [
  "Hydrauliczna",
  "Elektryczna",
  "Ślusarska",
  "Ogólnobudowlana",
  "Inna",
] as const;

export type IssueCategoryValue = (typeof ISSUE_CATEGORY_VALUES)[number];

export const ISSUE_CATEGORY_OPTIONS: ReadonlyArray<{
  value: IssueCategoryValue;
  label: IssueCategoryValue;
}> = ISSUE_CATEGORY_VALUES.map((value) => ({ value, label: value }));

const CANONICAL = new Set<string>(ISSUE_CATEGORY_VALUES);

/** Empty / null stays unset. Any other historical label (Sprzęt, sprzątanie, …) becomes Inna. */
export function coerceIssueCategory(raw: string | null | undefined): IssueCategoryValue | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  return CANONICAL.has(t) ? (t as IssueCategoryValue) : "Inna";
}
