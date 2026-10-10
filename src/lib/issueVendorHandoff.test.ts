import { describe, expect, it } from "vitest";

import { partitionIssueVendors, vendorHasEmail } from "@/lib/issueVendorHandoff";

describe("issue vendor handoff", () => {
  it("treats a short or blank address as missing", () => {
    expect(vendorHasEmail(null)).toBe(false);
    expect(vendorHasEmail("  ")).toBe(false);
    expect(vendorHasEmail("biuro")).toBe(false);
    expect(vendorHasEmail("biuro@firma.pl")).toBe(true);
  });

  it("splits attached vendors from the rest of the catalog", () => {
    const vendors = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const split = partitionIssueVendors(vendors, new Set(["b"]));
    expect(split.attached.map((row) => row.id)).toEqual(["b"]);
    expect(split.other.map((row) => row.id)).toEqual(["a", "c"]);
  });
});
