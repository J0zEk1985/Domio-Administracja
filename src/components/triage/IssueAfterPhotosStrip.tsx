import { useState } from "react";
import { ImageIcon } from "lucide-react";

import { collectAfterPhotoEntries, type IssuePhotoEntry } from "@/lib/collectIssuePhotoUrls";
import type { TriageIssue } from "@/hooks/useTriageIssues";
import { ImageLightboxDialog } from "@/components/triage/ImageLightboxDialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type IssueAfterPhotosStripProps = {
  issue: TriageIssue;
  onOpenProtocol: () => void;
};

export function IssueAfterPhotosStrip({ issue, onOpenProtocol }: IssueAfterPhotosStripProps) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const entries: IssuePhotoEntry[] = collectAfterPhotoEntries(issue);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border/80 bg-muted/15 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ImageIcon className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
          Brak zdjęć „Po”.
        </div>
        <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={onOpenProtocol}>
          Zobacz Protokół
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-3">
        {entries.map((entry, idx) => (
          <button
            key={`${entry.url}-${idx}`}
            type="button"
            onClick={() => setLightboxUrl(entry.url)}
            className={cn(
              "group relative aspect-square overflow-hidden rounded-lg border border-border/60 bg-muted/30",
              "ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              "hover:border-primary/40 hover:shadow-sm",
            )}
          >
            <img
              src={entry.url}
              alt={entry.label}
              className="h-full w-full object-cover transition group-hover:scale-[1.02]"
              loading="lazy"
            />
            <span className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 text-left text-[11px] font-medium text-white">
              {entry.label}
            </span>
          </button>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0 self-start sm:mt-0"
        onClick={onOpenProtocol}
      >
        Zobacz Protokół
      </Button>
      <ImageLightboxDialog
        url={lightboxUrl}
        open={lightboxUrl != null}
        onOpenChange={(o) => {
          if (!o) setLightboxUrl(null);
        }}
      />
    </div>
  );
}
