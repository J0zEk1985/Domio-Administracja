import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { format, isValid, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import { Moon, Sun } from "lucide-react";

import { useEBoardMessagesForDisplay, type EBoardDisplayItem } from "@/hooks/useEBoardMessages";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SLIDE_MS = 10_000;

function formatMsgType(t: EBoardDisplayItem["msg_type"]): string {
  if (t === "official") return "Oficjalne";
  if (t === "advertisement") return "Reklama";
  if (t === "resident") return "Mieszkaniec";
  return t;
}

function formatValidUntil(iso: string | null | undefined): string {
  if (!iso?.trim()) return "";
  try {
    const d = parseISO(iso);
    if (!isValid(d)) return "";
    return format(d, "d MMMM yyyy", { locale: pl });
  } catch {
    return "";
  }
}

export default function EBoardDisplay() {
  const { communityId } = useParams<{ communityId: string }>();
  const { data: items = [], isPending, isError, error } = useEBoardMessagesForDisplay(communityId);
  const [index, setIndex] = useState(0);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  const list = useMemo(() => items.filter((r) => r.title?.trim() || r.content?.trim()), [items]);

  useEffect(() => {
    setIndex(0);
  }, [communityId, list.length]);

  useEffect(() => {
    if (list.length <= 1) return;
    const t = window.setInterval(() => {
      setIndex((i) => (i + 1) % list.length);
    }, SLIDE_MS);
    return () => window.clearInterval(t);
  }, [list.length]);

  const current = list[index];

  const shell = theme === "dark" ? "bg-zinc-950 text-zinc-50" : "bg-zinc-50 text-zinc-950";

  return (
    <div
      className={cn(
        "relative flex min-h-dvh min-h-screen flex-col transition-colors duration-500",
        shell,
      )}
    >
      <div className="absolute right-4 top-4 z-20 flex gap-2">
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className={cn(
            "h-11 w-11 rounded-full border shadow-md backdrop-blur",
            theme === "dark" ? "border-white/10 bg-black/30 text-zinc-100" : "border-black/10 bg-white/80",
          )}
          onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          aria-label={theme === "dark" ? "Włącz tryb jasny" : "Włącz tryb ciemny"}
        >
          {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 md:px-16">
        {isPending ? (
          <div className="max-w-4xl space-y-4 text-center">
            <div className="mx-auto h-3 w-48 animate-pulse rounded-full bg-white/10" />
            <div className="mx-auto h-3 w-full max-w-2xl animate-pulse rounded-full bg-white/10" />
            <div className="mx-auto h-3 w-full max-w-xl animate-pulse rounded-full bg-white/10" />
          </div>
        ) : isError ? (
          <p className="max-w-lg text-center text-lg text-red-400">
            {error instanceof Error ? error.message : "Nie udało się wczytać ogłoszeń."}
          </p>
        ) : list.length === 0 ? (
          <div className="max-w-2xl text-center">
            <p
              className={cn(
                "text-2xl font-light tracking-tight md:text-3xl",
                theme === "dark" ? "text-white/90" : "text-zinc-900",
              )}
            >
              Brak aktywnych ogłoszeń
            </p>
            <p className={cn("mt-4 text-sm", theme === "dark" ? "text-white/50" : "text-zinc-500")}>
              Gdy administrator opublikuje komunikat, pojawi się on automatycznie na tym ekranie.
            </p>
          </div>
        ) : current ? (
          <article
            key={current.id}
            className="w-full max-w-5xl animate-in fade-in duration-700"
            aria-live="polite"
          >
            <p
              className={cn(
                "mb-3 text-center text-xs font-medium uppercase tracking-[0.2em]",
                theme === "dark" ? "text-emerald-400/90" : "text-emerald-700",
              )}
            >
              {formatMsgType(current.msg_type)}
              {formatValidUntil(current.valid_until) ? ` · ważne do ${formatValidUntil(current.valid_until)}` : ""}
            </p>
            <h1
              className={cn(
                "text-center font-display text-4xl font-semibold leading-tight tracking-tight md:text-5xl lg:text-6xl",
                theme === "dark" ? "text-white" : "text-zinc-900",
              )}
            >
              {current.title?.trim() || "Ogłoszenie"}
            </h1>
            <div
              className={cn(
                "mx-auto mt-10 max-h-[min(50vh,520px)] overflow-y-auto text-pretty text-center text-xl leading-relaxed md:text-2xl md:leading-relaxed",
                theme === "dark" ? "text-zinc-300" : "text-zinc-700",
              )}
            >
              {current.content?.trim().split("\n").map((para, i) => (
                <p key={i} className={i > 0 ? "mt-6" : ""}>
                  {para}
                </p>
              ))}
            </div>
          </article>
        ) : null}
      </div>

      {list.length > 1 ? (
        <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-2">
          {list.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Slajd ${i + 1} z ${list.length}`}
              className={cn(
                "h-2.5 rounded-full transition-all",
                i === index ? "w-10 bg-emerald-500" : "w-2.5 bg-white/25 hover:bg-white/40",
              )}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      ) : null}

      <footer
        className={cn(
          "pointer-events-none py-4 text-center text-[11px] tabular-nums",
          theme === "dark" ? "text-white/35" : "text-zinc-500",
        )}
      >
        {new Date().toLocaleString("pl-PL", { dateStyle: "medium", timeStyle: "short" })}
      </footer>
    </div>
  );
}
