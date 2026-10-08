import { supabase } from "@/lib/supabase";

export type ResidentPostType = "offer" | "request" | "event" | "general";

export type ResidentPost = {
  id: string;
  title: string;
  content: string;
  post_type: ResidentPostType;
  created_at: string;
  is_free: boolean;
  price: number | null;
  authorName: string;
  locationName: string;
};

export type ResidentComment = {
  id: string;
  postId: string;
  content: string;
  created_at: string;
  authorName: string;
};

export type ResidentBoard = {
  posts: ResidentPost[];
  comments: ResidentComment[];
};

export const RESIDENT_POST_TYPE_LABEL: Record<ResidentPostType, string> = {
  offer: "Oferuję usługę",
  request: "Szukam pomocy",
  event: "Wydarzenie",
  general: "Zwykłe ogłoszenie",
};

export const RESIDENT_POST_TYPES: ResidentPostType[] = ["general", "offer", "request", "event"];

export function isResidentPostType(value: string): value is ResidentPostType {
  return RESIDENT_POST_TYPES.includes(value as ResidentPostType);
}

function profileName(value: { full_name: string | null } | { full_name: string | null }[] | null): string {
  const row = Array.isArray(value) ? value[0] : value;
  return row?.full_name?.trim() || "Mieszkaniec";
}

export function parseResidentPrice(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (!normalized) return null;
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export async function fetchResidentBoard(buildingIds: string[]): Promise<ResidentBoard> {
  const { data: posts, error: postsError } = await supabase
    .from("community_board")
    .select(
      "id, title, content, post_type, created_at, is_free, price, profiles!community_board_author_id_fkey(full_name), cleaning_locations!community_board_location_id_fkey(name)",
    )
    .eq("status", "active")
    .in("location_id", buildingIds)
    .order("created_at", { ascending: false });

  if (postsError) {
    console.error("[CommunityResidentPosts] posts", postsError);
    throw postsError;
  }

  const mappedPosts: ResidentPost[] = (posts ?? []).map((row) => {
    const location = row.cleaning_locations as { name: string | null } | null;
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      post_type: isResidentPostType(row.post_type) ? row.post_type : "general",
      created_at: row.created_at,
      is_free: row.is_free,
      price: row.price,
      authorName: profileName(row.profiles as { full_name: string | null } | null),
      locationName: location?.name?.trim() || "Budynek",
    };
  });

  if (mappedPosts.length === 0) return { posts: [], comments: [] };

  const { data: comments, error: commentsError } = await supabase
    .from("community_comments")
    .select("id, post_id, content, created_at, profiles!community_comments_author_id_fkey(full_name)")
    .in(
      "post_id",
      mappedPosts.map((post) => post.id),
    )
    .eq("is_deleted", false)
    .order("created_at", { ascending: true });

  if (commentsError) {
    console.error("[CommunityResidentPosts] comments", commentsError);
    throw commentsError;
  }

  return {
    posts: mappedPosts,
    comments: (comments ?? []).map((row) => ({
      id: row.id,
      postId: row.post_id,
      content: row.content,
      created_at: row.created_at,
      authorName: profileName(row.profiles as { full_name: string | null } | null),
    })),
  };
}
