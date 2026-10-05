import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useMyProfile, useUpdateMyProfile } from "@/hooks/useMyProfile";
import { PROFILE_FULL_NAME_MAX } from "@/lib/profileDisplayName";

export default function MyProfile() {
  const profileQuery = useMyProfile();
  const updateProfile = useUpdateMyProfile();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (!profileQuery.data) return;
    setFullName(profileQuery.data.fullName);
    setPhone(profileQuery.data.phone);
  }, [profileQuery.data]);

  const loaded = profileQuery.data;
  const nameDirty = loaded ? fullName.trim() !== loaded.fullName.trim() : false;
  const phoneDirty = loaded ? phone !== loaded.phone : false;
  const dirty = nameDirty || phoneDirty;
  const saving = updateProfile.isPending;

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Mój profil</h1>
        <p className="text-sm text-muted-foreground">
          Imię i nazwisko jest widoczne przy komentarzach i zadaniach, które dodajesz.
        </p>
      </div>

      {profileQuery.isLoading ? (
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="max-w-lg space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      ) : profileQuery.isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            {profileQuery.error instanceof Error
              ? profileQuery.error.message
              : "Nie udało się wczytać profilu."}
          </AlertDescription>
        </Alert>
      ) : loaded ? (
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Dane osobowe</CardTitle>
            <CardDescription>E-mail logowania nie zmienia się w tym panelu.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="max-w-lg space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!dirty || saving) return;
                updateProfile.mutate({ fullName, phone });
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="my-profile-email">E-mail (konto)</Label>
                <Input
                  id="my-profile-email"
                  type="text"
                  value={loaded.email || "—"}
                  readOnly
                  disabled
                  className="bg-muted/40"
                  aria-readonly="true"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="my-profile-full-name">Imię i nazwisko</Label>
                <Input
                  id="my-profile-full-name"
                  type="text"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={saving}
                  placeholder="np. Anna Kowalska"
                  maxLength={PROFILE_FULL_NAME_MAX}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="my-profile-phone">Telefon</Label>
                <Input
                  id="my-profile-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={saving}
                  placeholder="np. +48 …"
                />
              </div>

              <Button type="submit" disabled={!dirty || saving} className="gap-2">
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Zapisywanie…
                  </>
                ) : (
                  "Zapisz zmiany"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
