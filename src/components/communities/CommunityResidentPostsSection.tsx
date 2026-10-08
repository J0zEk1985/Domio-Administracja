import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";

import {
  EditCommentDialog,
  EditPostDialog,
  type ResidentPostDraft,
} from "@/components/communities/CommunityResidentPostDialogs";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";
import {
  fetchResidentBoard,
  RESIDENT_POST_TYPE_LABEL,
  type ResidentComment,
  type ResidentPost,
} from "@/lib/communityResidentPosts";
import { supabase } from "@/lib/supabase";

type Props = {
  communityId: string;
  buildingIds: string[];
  canManage: boolean;
};

export function CommunityResidentPostsSection({ communityId, buildingIds, canManage }: Props) {
  const queryClient = useQueryClient();
  const queryKey = ["community-resident-posts", communityId, buildingIds.join(",")] as const;
  const boardQuery = useQuery({
    queryKey,
    queryFn: () => fetchResidentBoard(buildingIds),
    enabled: canManage && buildingIds.length > 0,
  });

  const [editPost, setEditPost] = useState<ResidentPost | null>(null);
  const [editComment, setEditComment] = useState<ResidentComment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: "post" | "comment"; id: string } | null>(null);

  const board = boardQuery.data;
  const posts = board && !Array.isArray(board) ? board.posts : [];
  const comments = board && !Array.isArray(board) ? board.comments : [];
  const commentsByPost = useMemo(() => {
    const grouped = new Map<string, ResidentComment[]>();
    for (const comment of comments) {
      const list = grouped.get(comment.postId) ?? [];
      list.push(comment);
      grouped.set(comment.postId, list);
    }
    return grouped;
  }, [comments]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey });
  };

  const savePost = useMutation({
    mutationFn: async (input: ResidentPostDraft) => {
      const { data, error } = await supabase
        .from("community_board")
        .update({
          title: input.title,
          content: input.content,
          post_type: input.postType,
          is_free: input.postType === "offer" ? input.isFree : false,
          price: input.postType === "offer" && !input.isFree ? input.price : null,
        })
        .eq("id", input.id)
        .eq("status", "active")
        .select("id");
      if (error) {
        console.error("[CommunityResidentPosts] update post", error);
        throw error;
      }
      if (!data?.length) throw new Error("Brak uprawnień albo wpis już nie istnieje.");
    },
    onSuccess: () => {
      toast.success("Wpis został zapisany.");
      setEditPost(null);
      invalidate();
    },
    onError: () => toast.error("Nie udało się zapisać wpisu."),
  });

  const saveComment = useMutation({
    mutationFn: async (input: { id: string; content: string }) => {
      const { data, error } = await supabase
        .from("community_comments")
        .update({ content: input.content })
        .eq("id", input.id)
        .eq("is_deleted", false)
        .select("id");
      if (error) {
        console.error("[CommunityResidentPosts] update comment", error);
        throw error;
      }
      if (!data?.length) throw new Error("Brak uprawnień albo komentarz już nie istnieje.");
    },
    onSuccess: () => {
      toast.success("Komentarz został zapisany.");
      setEditComment(null);
      invalidate();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Nie udało się zapisać komentarza.");
    },
  });

  const remove = useMutation({
    mutationFn: async (target: { kind: "post" | "comment"; id: string }) => {
      if (target.kind === "post") {
        const { data, error } = await supabase.from("community_board").delete().eq("id", target.id).select("id");
        if (error) {
          console.error("[CommunityResidentPosts] delete post", error);
          throw error;
        }
        if (!data?.length) throw new Error("Brak uprawnień albo wpis już nie istnieje.");
        return;
      }
      const { data, error } = await supabase
        .from("community_comments")
        .update({ is_deleted: true })
        .eq("id", target.id)
        .select("id");
      if (error) {
        console.error("[CommunityResidentPosts] delete comment", error);
        throw error;
      }
      if (!data?.length) throw new Error("Brak uprawnień albo komentarz już nie istnieje.");
    },
    onSuccess: () => {
      toast.success("Treść została usunięta.");
      setDeleteTarget(null);
      invalidate();
    },
    onError: () => toast.error("Nie udało się usunąć treści."),
  });

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-semibold text-foreground">Wpisy mieszkańców</h3>
        <p className="text-xs text-muted-foreground">
          Opublikowane ogłoszenia i komentarze. Popraw lub usuń treść, której nie wychwyciła automatyczna weryfikacja.
        </p>
      </div>

      {!canManage ? (
        <p className="text-sm text-muted-foreground">Ta wspólnota jest nieaktywna.</p>
      ) : buildingIds.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Dodaj co najmniej jeden budynek, aby moderować wpisy mieszkańców.
        </p>
      ) : boardQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Wczytywanie wpisów…</p>
      ) : boardQuery.isError ? (
        <p className="text-sm text-destructive">Nie udało się wczytać wpisów mieszkańców.</p>
      ) : posts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Brak opublikowanych wpisów mieszkańców.</p>
      ) : (
        posts.map((post) => (
          <Card key={post.id}>
            <CardHeader className="space-y-1 pb-2">
              <CardTitle className="text-base">{post.title}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {post.authorName} · {post.locationName} · {RESIDENT_POST_TYPE_LABEL[post.post_type]} ·{" "}
                {new Date(post.created_at).toLocaleString("pl-PL")}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="whitespace-pre-wrap text-sm text-foreground">{post.content}</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setEditPost(post)}>
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  Edytuj
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setDeleteTarget({ kind: "post", id: post.id })}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Usuń
                </Button>
              </div>
              {(commentsByPost.get(post.id) ?? []).map((comment) => (
                <div key={comment.id} className="rounded-md border border-border/70 p-3">
                  <p className="text-xs text-muted-foreground">
                    Komentarz · {comment.authorName} · {new Date(comment.created_at).toLocaleString("pl-PL")}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{comment.content}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setEditComment(comment)}>
                      Edytuj
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget({ kind: "comment", id: comment.id })}
                    >
                      Usuń
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}

      <EditPostDialog
        post={editPost}
        pending={savePost.isPending}
        onClose={() => setEditPost(null)}
        onSave={(input) => savePost.mutate(input)}
      />
      <EditCommentDialog
        comment={editComment}
        pending={saveComment.isPending}
        onClose={() => setEditComment(null)}
        onSave={(content) => {
          if (!editComment) return;
          saveComment.mutate({ id: editComment.id, content });
        }}
      />
      <AlertDialog open={deleteTarget != null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.kind === "comment" ? "Usunąć komentarz?" : "Usunąć wpis mieszkańca?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.kind === "comment"
                ? "Komentarz zniknie z tablicy sąsiadów."
                : "Wpis zniknie z tablicy razem z komentarzami."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Anuluj</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={remove.isPending || !deleteTarget}
              onClick={() => deleteTarget && remove.mutate(deleteTarget)}
            >
              Usuń
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
