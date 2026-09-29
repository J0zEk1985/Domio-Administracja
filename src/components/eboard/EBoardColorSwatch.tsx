import { EBOARD_DEFAULT_BG, EBOARD_DEFAULT_TEXT, isHexColor } from "@/lib/eboardDisplayColors";

type Props = {
  bg: string | null;
  text: string | null;
};

export function EBoardColorSwatch({ bg, text }: Props) {
  const background = isHexColor(bg) ? bg : EBOARD_DEFAULT_BG;
  const foreground = isHexColor(text) ? text : EBOARD_DEFAULT_TEXT;
  return (
    <span
      className="inline-flex h-5 w-8 shrink-0 overflow-hidden rounded border border-border"
      title={`Tło ${background}, napisy ${foreground}`}
      aria-hidden
    >
      <span className="h-full w-1/2" style={{ backgroundColor: background }} />
      <span className="h-full w-1/2" style={{ backgroundColor: foreground }} />
    </span>
  );
}
