import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreatePropertyIssue } from "@/hooks/usePropertyIssues";
import type { Database } from "@/types/supabase";

type Priority = Database["public"]["Enums"]["issue_priority_enum"];

export type NewPropertyIssueDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locationId: string;
};

export function NewPropertyIssueDialog({ open, onOpenChange, locationId }: NewPropertyIssueDialogProps) {
  const createMut = useCreatePropertyIssue();
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");

  useEffect(() => {
    if (!open) {
      setDescription("");
      setCategory("");
      setPriority("medium");
    }
  }, [open]);

  function handleSubmit() {
    createMut.mutate(
      {
        locationId,
        description,
        category,
        priority,
      },
      {
        onSuccess: () => onOpenChange(false),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nowe zgłoszenie usterki</DialogTitle>
          <DialogDescription>
            Zgłoszenie trafi do kolejki triage z statusem „Nowe”. Możesz uzupełnić szczegóły później z poziomu
            globalnej skrzynki.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="pi-category">Kategoria (opcjonalnie)</Label>
            <Input
              id="pi-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Np. hydraulika, elektryka…"
              disabled={createMut.isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pi-priority">Priorytet</Label>
            <Select
              value={priority}
              onValueChange={(v) => setPriority(v as Priority)}
              disabled={createMut.isPending}
            >
              <SelectTrigger id="pi-priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Niski</SelectItem>
                <SelectItem value="medium">Średni</SelectItem>
                <SelectItem value="high">Wysoki</SelectItem>
                <SelectItem value="critical">Krytyczny</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pi-desc">Opis</Label>
            <Textarea
              id="pi-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Opisz problem, miejsce w budynku i ewentualne zagrożenia…"
              rows={5}
              disabled={createMut.isPending}
              className="resize-none"
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={createMut.isPending}>
            Anuluj
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!description.trim() || createMut.isPending}
          >
            Zapisz zgłoszenie
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
