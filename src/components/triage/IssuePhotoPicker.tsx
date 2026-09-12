import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Camera, ImageIcon, Loader2, X } from "lucide-react";

import { ImageLightboxDialog } from "@/components/triage/ImageLightboxDialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import {
  appendIssuePhotos,
  compressIssuePhotos,
  MAX_ISSUE_PHOTOS,
} from "@/lib/issuePhotos";
import { cn } from "@/lib/utils";

export type IssuePhotoPickerProps = {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  maxPhotos?: number;
};

export function IssuePhotoPicker({
  files,
  onChange,
  disabled = false,
  maxPhotos = MAX_ISSUE_PHOTOS,
}: IssuePhotoPickerProps) {
  const reactId = useId().replace(/:/g, "");
  const cameraInputId = `issue-photo-camera-${reactId}`;
  const galleryInputId = `issue-photo-gallery-${reactId}`;
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [compressing, setCompressing] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);

  useEffect(() => {
    return () => {
      previews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previews]);

  const atLimit = files.length >= maxPhotos;
  const busy = disabled || compressing;

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = "";
    if (selected.length === 0) return;

    const result = appendIssuePhotos(files, selected, maxPhotos);
    if (result.skippedNonImage > 0) {
      toast.error("Wybierz plik graficzny.");
    }
    if (result.overflow > 0) {
      toast.error(`Maksymalnie ${maxPhotos} zdjęć.`);
    }
    const incoming = result.files.slice(files.length);
    if (incoming.length === 0) return;

    setCompressing(true);
    try {
      const compressed = await compressIssuePhotos(incoming);
      onChange([...files, ...compressed]);
    } catch (error) {
      console.error("[IssuePhotoPicker] compress:", error);
      toast.error("Nie udało się przetworzyć zdjęcia.");
    } finally {
      setCompressing(false);
    }
  }

  function removeAt(index: number) {
    onChange(files.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium leading-none">Zdjęcia (opcjonalnie)</p>
        <p className="text-xs text-muted-foreground">
          {files.length}/{maxPhotos}
        </p>
      </div>

      <input
        ref={cameraInputRef}
        id={cameraInputId}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        disabled={busy || atLimit}
        onChange={handleFiles}
      />
      <input
        ref={galleryInputRef}
        id={galleryInputId}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        disabled={busy || atLimit}
        onChange={handleFiles}
      />

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-11 touch-manipulation"
          disabled={busy || atLimit}
          onClick={() => cameraInputRef.current?.click()}
        >
          <Camera className="h-4 w-4" aria-hidden />
          Zrób zdjęcie
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 touch-manipulation"
          disabled={busy || atLimit}
          onClick={() => galleryInputRef.current?.click()}
        >
          <ImageIcon className="h-4 w-4" aria-hidden />
          Dodaj z galerii
        </Button>
      </div>

      {compressing ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Przetwarzanie zdjęcia…
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Możesz zrobić zdjęcie lub wybrać z galerii. Kliknij miniaturę, aby powiększyć.
        </p>
      )}

      {files.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {files.map((file, index) => (
            <li key={`${file.name}-${file.size}-${file.lastModified}-${index}`} className="relative">
              <button
                type="button"
                onClick={() => setLightboxUrl(previews[index] ?? null)}
                disabled={busy}
                className={cn(
                  "group relative aspect-square w-full overflow-hidden rounded-lg border border-border/60 bg-muted/30",
                  "ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  "hover:border-primary/40",
                )}
                aria-label={`Podgląd zdjęcia ${index + 1}`}
              >
                <img
                  src={previews[index]}
                  alt={`Zdjęcie ${index + 1}`}
                  className="h-full w-full object-cover"
                />
              </button>
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute -right-1.5 -top-1.5 h-7 w-7 rounded-full shadow-sm"
                disabled={busy}
                aria-label={`Usuń zdjęcie ${index + 1}`}
                onClick={() => removeAt(index)}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <ImageLightboxDialog
        url={lightboxUrl}
        open={lightboxUrl != null}
        onOpenChange={(open) => {
          if (!open) setLightboxUrl(null);
        }}
      />
    </div>
  );
}
