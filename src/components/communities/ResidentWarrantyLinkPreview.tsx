import { Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { residentWarrantyPublicUrl } from "@/lib/residentWarrantyPublicUrl";

type Props = {
  token: string;
};

async function copyUrl(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Link dla mieszkańców skopiowano do schowka.");
  } catch (error) {
    console.error("[ResidentWarrantyLinkPreview] clipboard:", error);
    toast.error("Nie udało się skopiować do schowka.");
  }
}

export function ResidentWarrantyLinkPreview({ token }: Props) {
  const url = residentWarrantyPublicUrl(token);

  return (
    <section className="mt-4 space-y-3 border-t border-border/60 pt-4" aria-labelledby="resident-warranty-link-heading">
      <h3 id="resident-warranty-link-heading" className="text-sm font-medium text-foreground">
        Link dla mieszkańców
      </h3>
      <p className="text-xs text-muted-foreground">
        Ten adres otwiera rejestr tylko do odczytu, bez logowania i bez możliwości edycji. Ten sam odnośnik pojawia się w aplikacji Domio Home.
      </p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-md border border-border/60 bg-muted/20 px-3 py-2 font-mono text-xs break-all text-primary underline-offset-2 hover:underline"
      >
        {url}
      </a>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => void copyUrl(url)}>
          <Copy className="h-3.5 w-3.5" aria-hidden />
          Kopiuj link
        </Button>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" asChild>
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            Otwórz podgląd
          </a>
        </Button>
      </div>
    </section>
  );
}
