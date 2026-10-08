import { describe, expect, it } from "vitest";

import { parseResidentPrice } from "@/lib/communityResidentPosts";

describe("parseResidentPrice", () => {
  it("accepts a comma decimal and rejects negatives", () => {
    expect(parseResidentPrice("49,99")).toBe(49.99);
    expect(parseResidentPrice("0")).toBe(0);
    expect(parseResidentPrice("")).toBeNull();
    expect(parseResidentPrice("-5")).toBeNull();
    expect(parseResidentPrice("abc")).toBeNull();
  });
});
