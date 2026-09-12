import { compressImage } from "@/lib/compressImage";
import { supabase } from "@/lib/supabase";

export const ISSUE_PHOTOS_BUCKET = "property-issues";
export const MAX_ISSUE_PHOTOS = 5;

const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif", "gif"]);

export function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  if (file.type) return false;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXT.has(ext);
}

export type AppendIssuePhotosResult = {
  files: File[];
  skippedNonImage: number;
  overflow: number;
};

export function appendIssuePhotos(
  current: File[],
  incoming: File[],
  max = MAX_ISSUE_PHOTOS,
): AppendIssuePhotosResult {
  const images = incoming.filter(isImageFile);
  const skippedNonImage = incoming.length - images.length;
  const free = Math.max(0, max - current.length);
  const accepted = images.slice(0, free);
  return {
    files: [...current, ...accepted],
    skippedNonImage,
    overflow: images.length - accepted.length,
  };
}

export async function compressIssuePhotos(files: File[]): Promise<File[]> {
  const out: File[] = [];
  for (const file of files) {
    try {
      out.push(await compressImage(file, { maxWidthOrHeight: 1920, initialQuality: 0.7 }));
    } catch (error) {
      console.error("[compressIssuePhotos]", error);
      out.push(file);
    }
  }
  return out;
}

export async function uploadIssuePhotos(params: {
  orgId: string;
  issueId: string;
  files: File[];
}): Promise<string[]> {
  const { orgId, issueId, files } = params;
  const urls: string[] = [];

  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    const path = `${orgId}/${issueId}/before/${Date.now()}-${index}.jpg`;
    const { error } = await supabase.storage.from(ISSUE_PHOTOS_BUCKET).upload(path, file, {
      cacheControl: "3600",
      contentType: file.type || "image/jpeg",
      upsert: false,
    });
    if (error) {
      console.error("[uploadIssuePhotos]", error);
      throw new Error(error.message || "Nie udało się przesłać zdjęcia.");
    }
    const {
      data: { publicUrl },
    } = supabase.storage.from(ISSUE_PHOTOS_BUCKET).getPublicUrl(path);
    if (!publicUrl?.trim()) {
      throw new Error("Nie udało się uzyskać adresu zdjęcia.");
    }
    urls.push(publicUrl);
  }

  return urls;
}
