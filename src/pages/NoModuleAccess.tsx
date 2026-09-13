import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { HUB_LOGIN_URL } from "@/lib/hubLogin";

export default function NoModuleAccess() {
  const hubDashboard = `${HUB_LOGIN_URL.replace(/\/?$/, "")}/dashboard`;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex flex-1 flex-col items-center justify-center px-4">
        <h1 className="mb-2 text-center text-3xl font-black tracking-tight text-foreground sm:text-4xl">
          DOMIO <span className="text-primary">Administracja</span>
        </h1>
        <Card className="mt-8 w-full max-w-md border-border/50 bg-card/80">
          <CardContent className="flex flex-col items-center gap-6 p-8">
            <p className="text-center text-lg font-semibold">Brak dostępu do aplikacji Administracja</p>
            <p className="text-center text-sm text-muted-foreground">
              Twoja organizacja nie ma aktywnej subskrypcji tego modułu. Wróć do panelu DOMIO i
              otwórz wykupione aplikacje albo wybierz plan Administracji.
            </p>
            <Button asChild size="lg" className="w-full">
              <a href={hubDashboard}>Wróć do panelu DOMIO</a>
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
