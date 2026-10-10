export const ISSUE_VENDOR_OFFSITE_NO_EMAIL_PL =
  "Ta firma nie jest podpięta pod nieruchomość i nie ma adresu e-mail. Przekaż zgłoszenie inną drogą, na przykład telefonicznie.";

export function vendorHasEmail(email: string | null | undefined): boolean {
  const value = email?.trim() ?? "";
  return value.length >= 3 && value.includes("@");
}

export function partitionIssueVendors<T extends { id: string }>(
  vendors: readonly T[],
  attachedIds: ReadonlySet<string>,
): { attached: T[]; other: T[] } {
  const attached: T[] = [];
  const other: T[] = [];
  for (const vendor of vendors) {
    if (attachedIds.has(vendor.id)) attached.push(vendor);
    else other.push(vendor);
  }
  return { attached, other };
}
