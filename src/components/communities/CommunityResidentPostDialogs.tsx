import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { Textarea } from "@/components/ui/textarea";
import {
  isResidentPostType,
  parseResidentPrice,
  RESIDENT_POST_TYPE_LABEL,
  RESIDENT_POST_TYPES,
  type ResidentComment,
  type ResidentPost,
  type ResidentPostType,
} from "@/lib/communityResidentPosts";

export type ResidentPostDraft = {
  id: string;
  title: string;
  content: string;
  postType: ResidentPostType;
  isFree: boolean;
  price: number | null;
};

export function EditPostDialog({
  post,
  pending,
  onClose,
  onSave,
}: {
  post: ResidentPost | null;
  pending: boolean;
  onClose: () => void;
  onSave: (input: ResidentPostDraft) => void;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [postType, setPostType] = useState<ResidentPostType>("general");
  const [isFree, setIsFree] = useState(false);
  const [priceInput, setPriceInput] = useState("");

  useEffect(() => {
    if (!post) return;
    setTitle(post.title);
    setContent(post.content);
    setPostType(post.post_type);
    setIsFree(post.is_free);
    setPriceInput(post.price != null ? String(post.price).replace(".", ",") : "");
  }, [post]);

  const submit = () => {
    if (!post) return;
    const nextTitle = title.trim();
    const nextContent = content.trim();
    if (!nextTitle || nextTitle.length > 150) {
      toast.error("Tytuł musi mieć od 1 do 150 znaków.");
      return;
    }
    if (!nextContent || nextContent.length > 4000) {
      toast.error("Treść musi mieć od 1 do 4000 znaków.");
      return;
    }
    const price = parseResidentPrice(priceInput);
    if (postType === "offer" && !isFree && price == null) {
      toast.error("Podaj cenę albo zaznacz, że oferta jest bezpłatna.");
      return;
    }
    onSave({ id: post.id, title: nextTitle, content: nextContent, postType, isFree, price });
  };

  return (
    <Dialog open={post != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Popraw wpis mieszkańca</DialogTitle>
          <DialogDescription>
            Zmiana jest widoczna od razu. Automatyczna weryfikacja nie blokuje tej poprawki.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="resident-post-type">Kategoria</Label>
            <Select value={postType} onValueChange={(value) => isResidentPostType(value) && setPostType(value)}>
              <SelectTrigger id="resident-post-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESIDENT_POST_TYPES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {RESIDENT_POST_TYPE_LABEL[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="resident-post-title">Tytuł</Label>
            <Input id="resident-post-title" value={title} maxLength={150} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="resident-post-content">Treść</Label>
            <Textarea
              id="resident-post-content"
              value={content}
              maxLength={4000}
              className="min-h-28"
              onChange={(event) => setContent(event.target.value)}
            />
          </div>
          {postType === "offer" ? (
            <div className="space-y-2 rounded-md border p-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isFree} onChange={(event) => setIsFree(event.target.checked)} />
                Bezpłatnie
              </label>
              {!isFree ? (
                <div className="space-y-1.5">
                  <Label htmlFor="resident-post-price">Cena (PLN)</Label>
                  <Input
                    id="resident-post-price"
                    inputMode="decimal"
                    value={priceInput}
                    onChange={(event) => setPriceInput(event.target.value)}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Anuluj
          </Button>
          <Button type="button" onClick={submit} disabled={pending}>
            Zapisz
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EditCommentDialog({
  comment,
  pending,
  onClose,
  onSave,
}: {
  comment: ResidentComment | null;
  pending: boolean;
  onClose: () => void;
  onSave: (content: string) => void;
}) {
  const [content, setContent] = useState("");

  useEffect(() => {
    if (comment) setContent(comment.content);
  }, [comment]);

  const submit = () => {
    const next = content.trim();
    if (!next || next.length > 2000) {
      toast.error("Komentarz musi mieć od 1 do 2000 znaków.");
      return;
    }
    onSave(next);
  };

  return (
    <Dialog open={comment != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Popraw komentarz</DialogTitle>
          <DialogDescription>Zapisz wersję bez treści, która nie powinna być na tablicy.</DialogDescription>
        </DialogHeader>
        <Textarea value={content} maxLength={2000} className="min-h-28" onChange={(event) => setContent(event.target.value)} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Anuluj
          </Button>
          <Button type="button" onClick={submit} disabled={pending}>
            Zapisz
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
