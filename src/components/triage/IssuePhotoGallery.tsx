import { useState } from "react";
import { ImageIcon } from "lucide-react";

import { collectIssuePhotoEntries, type IssuePhotoEntry } from "@/lib/collectIssuePhotoUrls";
import type { TriageIssue } from "@/hooks/useTriageIssues";
import { ImageLightboxDialog } from "@/components/triage/ImageLightboxDialog";
import { cn } from "@/lib/utils";

export type IssuePhotoGalleryProps = {
  issue: TriageIssue;
};

export function IssuePhotoGallery({ issue }: IssuePhotoGalleryProps) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const entries: IssuePhotoEntry[] = collectIssuePhotoEntries(issue);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/80 bg-muted/20 py-12 text-center">
        <ImageIcon className="h-10 w-10 text-muted-foreground/60" aria-hidden />
        <p className="mt-3 text-sm text-muted-foreground">Brak zdjęć przy tym zgłoszeniu.</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
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
      <ImageLightboxDialog
        url={lightboxUrl}
        open={lightboxUrl != null}
        onOpenChange={(o) => {
          if (!o) setLightboxUrl(null);
        }}
      />
    </>
  );
}
