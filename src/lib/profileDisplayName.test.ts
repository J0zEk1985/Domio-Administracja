import { describe, expect, it } from "vitest";
import { firstProfileEmbed, profileDisplayName } from "@/lib/profileDisplayName";

describe("profileDisplayName", () => {
  it("uses full_name when present", () => {
    expect(
      profileDisplayName({ full_name: "Marcin Józefiak", email: "a@b.pl" }, "Użytkownik"),
    ).toBe("Marcin Józefiak");
  });

  it("falls back to email when full_name is empty", () => {
    expect(
      profileDisplayName({ full_name: "  ", email: "jozefiakmarcin@o2.pl" }, "Użytkownik"),
    ).toBe("jozefiakmarcin@o2.pl");
  });

  it("falls back to contact_email when name and email are missing", () => {
    expect(
      profileDisplayName({ full_name: null, email: null, contact_email: "biuro@domio.pl" }, "Użytkownik"),
    ).toBe("biuro@domio.pl");
  });

  it("uses fallback when profile has no identity fields", () => {
    expect(profileDisplayName({ full_name: null, email: null }, "Użytkownik")).toBe("Użytkownik");
    expect(profileDisplayName(null, "—")).toBe("—");
  });

  it("unwraps array embeds from PostgREST", () => {
    expect(profileDisplayName([{ full_name: "", email: "a@b.pl" }], "Użytkownik")).toBe("a@b.pl");
  });
});

describe("firstProfileEmbed", () => {
  it("returns the first element of an array embed", () => {
    expect(firstProfileEmbed([{ id: "1" }, { id: "2" }])).toEqual({ id: "1" });
  });

  it("returns the object embed as-is", () => {
    expect(firstProfileEmbed({ id: "1" })).toEqual({ id: "1" });
  });
});
