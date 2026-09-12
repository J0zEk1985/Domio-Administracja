import { describe, expect, it } from "vitest";
import {
  formatAccessCodeEntry,
  formatCommunityAccessCodesDisplay,
  parseJsonToAccessCodes,
  serializeAccessCodesForSave,
} from "./communitySchema";

describe("parseJsonToAccessCodes", () => {
  it("returns empty entries for null or invalid payloads", () => {
    expect(parseJsonToAccessCodes(null)).toEqual({ entries: [] });
    expect(parseJsonToAccessCodes(undefined)).toEqual({ entries: [] });
    expect(parseJsonToAccessCodes("1234")).toEqual({ entries: [] });
  });

  it("migrates the closed intercom/keypad/gate object", () => {
    expect(
      parseJsonToAccessCodes({
        intercom: "1111",
        keypad: " 2222 ",
        gate: "3333",
      }),
    ).toEqual({
      entries: [
        { id: "legacy-intercom", kind: "intercom", code: "1111", location: "" },
        { id: "legacy-keypad", kind: "keypad", code: "2222", location: "" },
        { id: "legacy-gate", kind: "gate", code: "3333", location: "" },
      ],
    });
  });

  it("falls back to legacyText when structured keys are empty", () => {
    expect(parseJsonToAccessCodes({ legacyText: "blob" })).toEqual({
      entries: [{ id: "legacy-text", kind: "other", code: "blob", location: "" }],
    });
  });

  it("reads the canonical entries array", () => {
    const raw = {
      entries: [
        { id: "a", kind: "keypad", code: "4455", location: "Klatka A" },
        { id: "b", kind: "gate", code: "99", location: "" },
      ],
    };
    expect(parseJsonToAccessCodes(raw)).toEqual(raw);
  });

  it("falls back to legacy keys when entries is empty", () => {
    expect(
      parseJsonToAccessCodes({
        entries: [],
        keypad: "5555",
      }),
    ).toEqual({
      entries: [{ id: "legacy-keypad", kind: "keypad", code: "5555", location: "" }],
    });
  });
});

describe("serializeAccessCodesForSave", () => {
  it("drops empty codes and trims fields", () => {
    expect(
      serializeAccessCodesForSave({
        entries: [
          { id: "keep", kind: "keypad", code: " 12# ", location: "  Klatka A  " },
          { id: "drop", kind: "intercom", code: "   ", location: "x" },
        ],
      }),
    ).toEqual({
      entries: [{ id: "keep", kind: "keypad", code: "12#", location: "Klatka A" }],
    });
  });
});

describe("formatAccessCodeEntry", () => {
  it("includes optional location in the staff-facing label", () => {
    expect(
      formatAccessCodeEntry({
        id: "1",
        kind: "keypad",
        code: "1234",
        location: "Klatka A",
      }),
    ).toBe("Szyfrator (Klatka A): 1234");
    expect(
      formatAccessCodeEntry({ id: "2", kind: "intercom", code: "99", location: "" }),
    ).toBe("Domofon: 99");
  });
});

describe("formatCommunityAccessCodesDisplay", () => {
  it("joins entries with newlines", () => {
    expect(
      formatCommunityAccessCodesDisplay({
        entries: [
          { id: "a", kind: "intercom", code: "1", location: "" },
          { id: "b", kind: "gate", code: "2", location: "wjazd" },
        ],
      }),
    ).toBe("Domofon: 1\nBrama (wjazd): 2");
  });
});
