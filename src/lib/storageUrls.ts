import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function isLocalPhotoRef(value: string): boolean {
  return value.startsWith("blob:") || value.startsWith("data:");
}

const STORAGE_MARKERS = [
  "/storage/v1/object/public/",
  "/storage/v1/object/sign/",
] as const;

export function parseStorageObjectRef(
  pathOrUrl: string,
  fallbackBucket?: string,
): { bucket: string; path: string } | null {
  const trimmed = pathOrUrl.trim();
  if (!trimmed || isLocalPhotoRef(trimmed)) return null;

  for (const marker of STORAGE_MARKERS) {
    const index = trimmed.indexOf(marker);
    if (index < 0) continue;
    const rest = trimmed.slice(index + marker.length);
    const slash = rest.indexOf("/");
    if (slash <= 0) return null;
    const bucket = rest.slice(0, slash);
    const path = decodeURIComponent(rest.slice(slash + 1).split("?")[0]);
    if (bucket && path) return { bucket, path };
  }

  if (fallbackBucket && !/^https?:\/\//i.test(trimmed)) {
    return { bucket: fallbackBucket, path: trimmed.replace(/^\//, "") };
  }

  return null;
}

export async function resolvePrivateStorageUrl(
  pathOrUrl: string,
  fallbackBucket?: string,
  ttlSeconds = 3600,
): Promise<string | null> {
  const trimmed = pathOrUrl.trim();
  if (!trimmed) return null;
  if (isLocalPhotoRef(trimmed)) return trimmed;

  const parsed = parseStorageObjectRef(trimmed, fallbackBucket);
  if (!parsed) {
    return /^https?:\/\//i.test(trimmed) ? trimmed : null;
  }

  const { data, error } = await supabase.storage
    .from(parsed.bucket)
    .createSignedUrl(parsed.path, ttlSeconds);

  if (error) {
    console.error("[storageUrls] Nie udało się podpisać adresu zdjęcia:", error);
    return null;
  }
  return data.signedUrl;
}

export function useSignedStorageUrl(
  pathOrUrl: string | null | undefined,
  fallbackBucket?: string,
): string | null {
  const [src, setSrc] = useState<string | null>(() =>
    pathOrUrl && isLocalPhotoRef(pathOrUrl) ? pathOrUrl : null,
  );

  useEffect(() => {
    if (!pathOrUrl) {
      setSrc(null);
      return;
    }
    if (isLocalPhotoRef(pathOrUrl)) {
      setSrc(pathOrUrl);
      return;
    }
    let cancelled = false;
    void resolvePrivateStorageUrl(pathOrUrl, fallbackBucket).then((url) => {
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [pathOrUrl, fallbackBucket]);

  return src;
}

export function useSignedStorageUrls(
  pathOrUrls: string[],
  fallbackBucket?: string,
): string[] {
  const [urls, setUrls] = useState<string[]>([]);

  const key = pathOrUrls.join("\0");

  useEffect(() => {
    let cancelled = false;
    const items = key.length === 0 ? [] : key.split("\0");
    if (items.length === 0) {
      setUrls([]);
      return;
    }
    void Promise.all(
      items.map((item) => resolvePrivateStorageUrl(item, fallbackBucket)),
    ).then((resolved) => {
      if (!cancelled) {
        setUrls(resolved.filter((url): url is string => Boolean(url)));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [key, fallbackBucket]);

  return urls;
}
