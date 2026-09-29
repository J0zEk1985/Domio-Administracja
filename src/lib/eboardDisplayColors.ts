export const EBOARD_DEFAULT_BG = "#09090b";
export const EBOARD_DEFAULT_TEXT = "#fafafa";
export const EBOARD_DEFAULT_LIGHT_BG = "#fafafa";
export const EBOARD_DEFAULT_LIGHT_TEXT = "#09090b";

export const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export type EBoardTheme = "dark" | "light";

export type EBoardResolvedColors = {
  bg: string;
  text: string;
  custom: boolean;
};

export function isHexColor(value: string | null | undefined): value is string {
  return typeof value === "string" && HEX_COLOR_RE.test(value);
}

export function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim();
  if (!HEX_COLOR_RE.test(trimmed)) return null;
  return `#${trimmed.slice(1).toLowerCase()}`;
}

export function isDarkHex(hex: string): boolean {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return true;
  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance < 0.55;
}

export function themeFallbackColors(theme: EBoardTheme): { bg: string; text: string } {
  if (theme === "light") {
    return { bg: EBOARD_DEFAULT_LIGHT_BG, text: EBOARD_DEFAULT_LIGHT_TEXT };
  }
  return { bg: EBOARD_DEFAULT_BG, text: EBOARD_DEFAULT_TEXT };
}

export function resolveEBoardDisplayColors(
  bg: string | null | undefined,
  text: string | null | undefined,
  theme: EBoardTheme,
): EBoardResolvedColors {
  const fallback = themeFallbackColors(theme);
  const bgOk = isHexColor(bg) ? normalizeHexColor(bg)! : null;
  const textOk = isHexColor(text) ? normalizeHexColor(text)! : null;
  if (!bgOk && !textOk) {
    return { bg: fallback.bg, text: fallback.text, custom: false };
  }
  return {
    bg: bgOk ?? fallback.bg,
    text: textOk ?? fallback.text,
    custom: true,
  };
}
