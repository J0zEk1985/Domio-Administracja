/**
 * Hook for uploading warranty issue photos to Supabase Storage
 */
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/sonner";

interface UploadProgress {
  fileName: string;
  progress: number;
  url?: string;
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
        const { data, error } = await supabase.storage
          .from("warranty-photos")
          .upload(filePath, file, {
            cacheControl: "3600",
            upsert: false,
          });

        if (error) {
          console.error("Upload error:", error);
          toast.error(`Nie udało się przesłać ${file.name}`);
          continue;
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from("warranty-photos")
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
      // Extract file path from URL
      const urlParts = url.split("/warranty-photos/");
      if (urlParts.length !== 2) {
        console.error("Invalid URL format");
        return false;
      }

      const filePath = `warranty-issues/${urlParts[1]}`;

      const { error } = await supabase.storage
        .from("warranty-photos")
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
