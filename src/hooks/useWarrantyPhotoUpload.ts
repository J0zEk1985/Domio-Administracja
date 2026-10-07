/**
 * Hook for uploading warranty issue photos to Supabase Storage
 */
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/sonner";
import { WARRANTY_PHOTOS_BUCKET, warrantyPhotoObjectPath } from "@/lib/warrantyPhotos";

export { WARRANTY_PHOTOS_BUCKET, warrantyPhotoObjectPath };

interface UploadProgress {
  fileName: string;
  progress: number;
  url?: string;
}

function uploadFailureMessage(fileName: string, message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("bucket not found") || lower.includes("not found")) {
    return `Nie udało się przesłać ${fileName}. Magazyn zdjęć nie jest skonfigurowany.`;
  }
  if (
    lower.includes("row-level security") ||
    lower.includes("permission") ||
    lower.includes("unauthorized") ||
    lower.includes("403")
  ) {
    return `Nie udało się przesłać ${fileName}. Brak uprawnień do zapisu.`;
  }
  return `Nie udało się przesłać ${fileName}.`;
}

export function useWarrantyPhotoUpload() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress[]>([]);

  const uploadPhotos = async (files: File[]): Promise<string[]> => {
    if (files.length === 0) return [];

    setUploading(true);
    const uploadedUrls: string[] = [];

    try {
      // Initialize progress
      setProgress(
        files.map((file) => ({
          fileName: file.name,
          progress: 0,
        }))
      );

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Validate file
        if (!file.type.startsWith("image/")) {
          toast.error(`${file.name} nie jest obrazem`);
          continue;
        }

        // Check file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
          toast.error(`${file.name} przekracza limit 5MB`);
          continue;
        }

        // Generate unique filename
        const fileExt = file.name.split(".").pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `warranty-issues/${fileName}`;

        // Update progress
        setProgress((prev) =>
          prev.map((p, idx) =>
            idx === i ? { ...p, progress: 50 } : p
          )
        );

        // Upload to Supabase Storage
        const { error } = await supabase.storage
          .from(WARRANTY_PHOTOS_BUCKET)
          .upload(filePath, file, {
            cacheControl: "3600",
            contentType: file.type || "image/jpeg",
            upsert: false,
          });

        if (error) {
          console.error("Upload error:", error);
          toast.error(uploadFailureMessage(file.name, error.message));
          continue;
        }

        const { data: urlData } = supabase.storage
          .from(WARRANTY_PHOTOS_BUCKET)
          .getPublicUrl(filePath);

        const publicUrl = urlData.publicUrl;
        uploadedUrls.push(publicUrl);

        // Update progress
        setProgress((prev) =>
          prev.map((p, idx) =>
            idx === i ? { ...p, progress: 100, url: publicUrl } : p
          )
        );
      }

      if (uploadedUrls.length > 0) {
        toast.success(`Przesłano ${uploadedUrls.length} ${uploadedUrls.length === 1 ? "zdjęcie" : "zdjęć"}`);
      }

      return uploadedUrls;
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Wystąpił błąd podczas przesyłania zdjęć");
      return [];
    } finally {
      setUploading(false);
      setProgress([]);
    }
  };

  const deletePhoto = async (url: string): Promise<boolean> => {
    try {
      const filePath = warrantyPhotoObjectPath(url);
      if (!filePath) {
        console.error("Invalid URL format");
        return false;
      }

      const { error } = await supabase.storage
        .from(WARRANTY_PHOTOS_BUCKET)
        .remove([filePath]);

      if (error) {
        console.error("Delete error:", error);
        return false;
      }

      return true;
    } catch (error) {
      console.error("Delete error:", error);
      return false;
    }
  };

  return {
    uploadPhotos,
    deletePhoto,
    uploading,
    progress,
  };
}
