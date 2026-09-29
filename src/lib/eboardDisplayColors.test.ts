import { describe, expect, it } from "vitest";
import {
  EBOARD_DEFAULT_BG,
  EBOARD_DEFAULT_LIGHT_BG,
  EBOARD_DEFAULT_LIGHT_TEXT,
  EBOARD_DEFAULT_TEXT,
  isDarkHex,
  isHexColor,
  normalizeHexColor,
  resolveEBoardDisplayColors,
} from "@/lib/eboardDisplayColors";

describe("eboardDisplayColors", () => {
  it("accepts #RRGGBB and rejects other formats", () => {
    expect(isHexColor("#09090b")).toBe(true);
    expect(isHexColor("#AABBCC")).toBe(true);
    expect(isHexColor("#fff")).toBe(false);
    expect(isHexColor("09090b")).toBe(false);
    expect(isHexColor(null)).toBe(false);
  });

  it("normalizes hex to lowercase", () => {
    expect(normalizeHexColor("  #AABBCC ")).toBe("#aabbcc");
    expect(normalizeHexColor("red")).toBeNull();
  });

  it("treats null colors as the kiosk theme", () => {
    expect(resolveEBoardDisplayColors(null, null, "dark")).toEqual({
      bg: EBOARD_DEFAULT_BG,
      text: EBOARD_DEFAULT_TEXT,
      custom: false,
    });
    expect(resolveEBoardDisplayColors(null, null, "light")).toEqual({
      bg: EBOARD_DEFAULT_LIGHT_BG,
      text: EBOARD_DEFAULT_LIGHT_TEXT,
      custom: false,
    });
  });

  it("uses custom colors when set and fills the other from theme", () => {
    expect(resolveEBoardDisplayColors("#112233", null, "dark")).toEqual({
      bg: "#112233",
      text: EBOARD_DEFAULT_TEXT,
      custom: true,
    });
    expect(resolveEBoardDisplayColors(null, "#ccddee", "light")).toEqual({
      bg: EBOARD_DEFAULT_LIGHT_BG,
      text: "#ccddee",
      custom: true,
    });
  });

  it("classifies luminance for accent contrast", () => {
    expect(isDarkHex("#09090b")).toBe(true);
    expect(isDarkHex("#fafafa")).toBe(false);
  });
});
