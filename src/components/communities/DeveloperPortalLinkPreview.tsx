import { Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { developerPortalUrl } from "@/lib/developerPortalUrl";
import { cn } from "@/lib/utils";

type Props = {
  accessToken: string;
  pendingActivation: boolean;
  loginEnabled: boolean;
};

async function copyPortalUrl(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Link skopiowano do schowka.");
  } catch (error) {
    console.error("[DeveloperPortalLinkPreview] clipboard:", error);
    toast.error("Nie udało się skopiować do schowka.");
  }
}

export function DeveloperPortalLinkPreview({ accessToken, pendingActivation, loginEnabled }: Props) {
  const portalUrl = developerPortalUrl(accessToken);
  const hint = pendingActivation
    ? "Deweloper otwiera ten adres po ustawieniu PIN-u. Ten sam link jest w mailu aktywacyjnym."
    : loginEnabled
      ? "Deweloper otwiera ten adres i loguje się PIN-em. Ten sam link jest w mailu aktywacyjnym."
      : "Logowanie tym adresem jest wyłączone do czasu przywrócenia dostępu.";

  return (
    <section className="space-y-3" aria-labelledby="developer-portal-link-heading">
      <h3 id="developer-portal-link-heading" className="text-sm font-medium text-foreground">
        Link do portalu usterek
      </h3>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <a
        href={portalUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "block rounded-md border border-border/60 bg-muted/20 px-3 py-2 font-mono text-xs break-all text-primary underline-offset-2 hover:underline",
        )}
      >
        {portalUrl}
      </a>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => void copyPortalUrl(portalUrl)}
        >
          <Copy className="h-3.5 w-3.5" aria-hidden />
          Kopiuj link
        </Button>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" asChild>
          <a href={portalUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            Otwórz stronę
          </a>
        </Button>
      </div>
    </section>
  );
}
