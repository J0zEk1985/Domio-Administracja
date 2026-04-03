import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type ImageLightboxDialogProps = {
  url: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ImageLightboxDialog({ url, open, onOpenChange }: ImageLightboxDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "!fixed !inset-0 !left-0 !top-0 z-50 flex h-[100dvh] max-h-none w-[100vw] max-w-none !translate-x-0 !translate-y-0 flex-col gap-0 rounded-none border-0 bg-black/95 p-0 shadow-none",
          "[&>button]:right-4 [&>button]:top-4 [&>button]:text-white [&>button]:hover:bg-white/15 [&>button]:hover:text-white",
          "data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100",
        )}
      >
        <DialogTitle className="sr-only">Podgląd zdjęcia</DialogTitle>
        {url ? (
          <div className="flex flex-1 items-center justify-center p-4 pt-14">
            <img
              src={url}
              alt=""
              className="max-h-[calc(100dvh-5rem)] max-w-full object-contain"
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
