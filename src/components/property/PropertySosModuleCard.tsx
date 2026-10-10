import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useBuildingSosModule } from "@/hooks/useBuildingSosModule";

type Props = {
  locationId: string;
  orgId: string;
  canManage: boolean;
  accessPending?: boolean;
};

export function PropertySosModuleCard({ locationId, orgId, canManage, accessPending }: Props) {
  const { enabled, isLoading, isError, isSaving, save } = useBuildingSosModule(locationId, orgId);
  const disabled = !canManage || accessPending || isLoading || isSaving;

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Moduł SOS</CardTitle>
        <CardDescription>
          Przycisk SOS i ustawienie „Gotowi pomóc” w aplikacji DOMIO Home są widoczne tylko po włączeniu modułu na tym
          budynku.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {accessPending || isLoading ? (
          <p className="text-xs text-muted-foreground" role="status">
            Wczytywanie ustawienia…
          </p>
        ) : null}
        {isError ? (
          <p className="text-sm text-destructive">Nie udało się wczytać modułu SOS.</p>
        ) : (
          <div className="flex items-center justify-between gap-4 rounded-md border border-border/60 bg-muted/15 px-3 py-3">
            <div className="space-y-1">
              <Label htmlFor="building-sos-module" className="text-sm font-medium">
                Sąsiedzka Tarcza
              </Label>
              <p className="text-xs text-muted-foreground">
                Mieszkańcy tego budynku mogą wezwać pomoc sąsiadów i zapisać się jako gotowi pomóc.
              </p>
            </div>
            <Switch
              id="building-sos-module"
              checked={enabled}
              disabled={disabled}
              onCheckedChange={(checked) => {
                if (checked !== enabled) save(checked);
              }}
              aria-label="Włącz moduł SOS na tym budynku"
            />
          </div>
        )}
        {!canManage && !accessPending ? (
          <p className="text-xs text-muted-foreground">
            Tylko właściciel organizacji lub administrator przypisany do budynku może zmienić to ustawienie.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
