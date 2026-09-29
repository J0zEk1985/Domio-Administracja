import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

type CollapsibleSectionProps = {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
};

export function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [mounted, setMounted] = useState(defaultOpen);

  function onToggle() {
    setMounted(true);
    setOpen((current) => !current);
  }

  return (
    <section className="rounded-xl border border-border/60 bg-card shadow-sm">
      <h2>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 rounded-xl px-5 py-4 text-left text-base font-semibold text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-expanded={open}
          onClick={onToggle}
        >
          <span>{title}</span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </button>
      </h2>
      {mounted ? (
        <div hidden={!open} className="space-y-6 border-t border-border/60 px-5 py-5">
          {children}
        </div>
      ) : null}
    </section>
  );
}
