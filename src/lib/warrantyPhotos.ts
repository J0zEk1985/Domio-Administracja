export const WARRANTY_PHOTOS_BUCKET = "warranty-photos";

export function warrantyPhotoObjectPath(url: string): string | null {
  const marker = `/${WARRANTY_PHOTOS_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index < 0) return null;
  const path = decodeURIComponent(url.slice(index + marker.length).split("?")[0] ?? "");
  if (!path || path.includes("..")) return null;
  return path;
}
