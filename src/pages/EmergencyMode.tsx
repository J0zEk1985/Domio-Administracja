import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Siren } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IssuePhotoPicker } from "@/components/triage/IssuePhotoPicker";
import { toast } from "@/components/ui/sonner";
import { useProperties } from "@/hooks/useProperties";
import { createEmergencyIssue } from "@/lib/emergencyDutyApi";
import { MAX_ISSUE_PHOTOS, uploadIssuePhotos } from "@/lib/issuePhotos";
import { supabase } from "@/lib/supabase";

const TRADES = ["Elektryczna", "Hydrauliczna", "Ogólnobudowlana", "Sprzęt"] as const;

type EmergencyIssueRow = {
  id: string;
  description: string | null;
  category: string | null;
  status: string | null;
  created_at: string | null;
  location: { name: string | null; address: string | null } | null;
};

export default function EmergencyMode() {
  const { data: properties = [], isLoading: propsLoading } = useProperties();
  const [locationId, setLocationId] = useState("");
  const [category, setCategory] = useState<string>(TRADES[0]);
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const buildings = useMemo(
    () => properties.filter((p) => Boolean(p.communityId)),
    [properties],
  );

  const listQuery = useQuery({
    queryKey: ["emergency-issues"],
    queryFn: async (): Promise<EmergencyIssueRow[]> => {
      const { data: orgId, error: orgErr } = await supabase.rpc("get_my_org_id_safe");
      if (orgErr) throw orgErr;
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("property_issues")
        .select("id, description, category, status, created_at, location:cleaning_locations(name, address)")
        .eq("org_id", String(orgId))
        .eq("emergency_mode", true)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as EmergencyIssueRow[];
    },
  });

  const submit = async () => {
    if (!locationId || description.trim().length < 10) {
      toast.error("Wybierz budynek i wpisz opis (min. 10 znaków).");
      return;
    }
    setBusy(true);
    try {
      const { data: orgId, error: orgErr } = await supabase.rpc("get_my_org_id_safe");
      if (orgErr) throw orgErr;
      const created = await createEmergencyIssue({
        locationId,
        category,
        description: description.trim(),
      });
      if (photos.length > 0 && orgId) {
        const photosBefore = await uploadIssuePhotos({
          orgId: String(orgId),
          issueId: created.issue_id,
          files: photos,
        });
        const { error: photoErr } = await supabase
          .from("property_issues")
          .update({ photos_before: photosBefore })
          .eq("id", created.issue_id);
        if (photoErr) throw photoErr;
      }
      toast.success("Zgłoszenie awaryjne przekazane do pogotowia 24h.");
      setDescription("");
      setPhotos([]);
      await listQuery.refetch();
    } catch (err) {
      console.error("[EmergencyMode]", err);
      toast.error(err instanceof Error ? err.message : "Nie udało się wysłać zgłoszenia.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <div className="flex items-center gap-2">
        <Siren className="h-5 w-5 text-destructive" />
        <h1 className="text-xl font-semibold">Tryb awaryjny</h1>
      </div>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle>Nowe zgłoszenie do pogotowia 24h</CardTitle>
          <CardDescription>
            Osobny kanał poza skrzynką triażu. Zgłoszenie trafia do firmy pogotowia z wybranej branży.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Budynek</Label>
            <Select value={locationId} onValueChange={setLocationId} disabled={propsLoading}>
              <SelectTrigger>
                <SelectValue placeholder="Wybierz budynek" />
              </SelectTrigger>
              <SelectContent>
                {buildings.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} — {p.address}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Branża</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRADES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="emergency-desc">Opis usterki</Label>
            <Textarea
              id="emergency-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Co się stało i gdzie..."
            />
          </div>
          <IssuePhotoPicker files={photos} onChange={setPhotos} maxPhotos={MAX_ISSUE_PHOTOS} />
          <Button type="button" onClick={() => void submit()} disabled={busy}>
            Wyślij do pogotowia 24h
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Otrzymane usterki awaryjne</CardTitle>
          <CardDescription>Zgłoszenia przekazane do realizacji pogotowia 24h.</CardDescription>
        </CardHeader>
        <CardContent>
          {listQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Wczytywanie…</p>
          ) : (listQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak zgłoszeń awaryjnych.</p>
          ) : (
            <ul className="space-y-2">
              {(listQuery.data ?? []).map((row) => (
                <li key={row.id} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">{row.category ?? "—"} · {row.status}</p>
                  <p className="text-muted-foreground">
                    {row.location?.name ?? row.location?.address ?? "Budynek"}
                  </p>
                  <p className="mt-1">{row.description}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
