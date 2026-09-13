import { useSignedStorageUrl } from "@/lib/storageUrls";

type StoragePhotoProps = {
  pathOrUrl: string;
  alt: string;
  className?: string;
  fallbackBucket?: string;
  crossOrigin?: "anonymous" | "use-credentials";
  onClick?: (resolvedUrl: string) => void;
};

export function StoragePhoto({
  pathOrUrl,
  alt,
  className,
  fallbackBucket,
  crossOrigin,
  onClick,
}: StoragePhotoProps) {
  const src = useSignedStorageUrl(pathOrUrl, fallbackBucket);
  if (!src) return null;
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      crossOrigin={crossOrigin}
      loading="lazy"
      onClick={onClick ? () => onClick(src) : undefined}
    />
  );
}
