import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useResidentBuildingIssueScope,
  type ResidentBuildingIssueScope,
} from "@/hooks/useResidentBuildingIssueScope";

type Props = {
  locationId: string;
  orgId: string;
  canManage: boolean;
  accessPending?: boolean;
};

const OPTIONS: { value: ResidentBuildingIssueScope; title: string; hint: string }[] = [
  {
    value: "resident_reports",
    title: "Tylko zgłoszenia mieszkańców",
    hint: "Aplikacja DOMIO Home i formularz z kodu QR. Zgłoszenia administracji, serwisu, sprzątania i e-mail pozostają niewidoczne.",
  },
  {
    value: "all_open",
    title: "Wszystkie otwarte usterki",
    hint: "Mieszkańcy widzą opis i status każdej otwartej usterki w budynku, bez imienia i telefonu zgłaszającego. Opis może zawierać numer lokalu.",
  },
];

export function PropertyResidentIssueVisibilityCard({
  locationId,
  orgId,
  canManage,
  accessPending,
}: Props) {
  const { scope, isLoading, isError, isSaving, save } = useResidentBuildingIssueScope(locationId, orgId);
  const disabled = !canManage || accessPending || isLoading || isSaving;

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Usterki w portalu mieszkańca</CardTitle>
        <CardDescription>
          Zakładka „Budynek” w DOMIO Home. „Moje zgłoszenia” zawsze pokazuje własne zgłoszenia zalogowanego mieszkańca,
          także te oczekujące na akceptację.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {accessPending || isLoading ? (
          <p className="text-xs text-muted-foreground" role="status">
            Wczytywanie ustawienia…
          </p>
        ) : null}
        {isError ? (
          <p className="text-sm text-destructive">Nie udało się wczytać widoczności usterek.</p>
        ) : (
          <RadioGroup
            value={scope}
            onValueChange={(value) => {
              if (value === "resident_reports" || value === "all_open") {
                if (value !== scope) save(value);
              }
            }}
            className="gap-3"
          >
            {OPTIONS.map((option) => {
              const inputId = `resident-issue-scope-${option.value}`;
              return (
                <div
                  key={option.value}
                  className="flex items-start gap-3 rounded-md border border-border/60 bg-muted/15 px-3 py-3"
                >
                  <RadioGroupItem id={inputId} value={option.value} className="mt-0.5" disabled={disabled} />
                  <div className="space-y-1">
                    <Label htmlFor={inputId} className="text-sm font-medium">
                      {option.title}
                    </Label>
                    <p className="text-xs text-muted-foreground">{option.hint}</p>
                  </div>
                </div>
              );
            })}
          </RadioGroup>
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
