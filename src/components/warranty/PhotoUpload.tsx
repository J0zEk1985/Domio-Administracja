/**
 * Photo Upload Component for Warranty Issues
 */
import { useRef, useState } from "react";
import { Upload, X, Image as ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useWarrantyPhotoUpload } from "@/hooks/useWarrantyPhotoUpload";

interface PhotoUploadProps {
  photos: string[];
  onPhotosChange: (photos: string[]) => void;
  label?: string;
  description?: string;
  maxPhotos?: number;
  disabled?: boolean;
}

export function PhotoUpload({
  photos,
  onPhotosChange,
  label = "Zdjęcia",
  description,
  maxPhotos = 10,
  disabled = false,
}: PhotoUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const { uploadPhotos, deletePhoto, uploading } = useWarrantyPhotoUpload();

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || disabled) return;

    const remainingSlots = maxPhotos - photos.length;
    if (remainingSlots <= 0) {
      alert(`Możesz dodać maksymalnie ${maxPhotos} zdjęć`);
      return;
    }

    const filesToUpload = Array.from(files).slice(0, remainingSlots);
    const uploadedUrls = await uploadPhotos(filesToUpload);

    if (uploadedUrls.length > 0) {
      onPhotosChange([...photos, ...uploadedUrls]);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleRemovePhoto = async (url: string) => {
    // Optimistically remove from UI
    onPhotosChange(photos.filter((p) => p !== url));
    
    // Try to delete from storage (fire and forget)
    await deletePhoto(url);
  };

  return (
    <div className="space-y-3">
      <div>
        <Label>{label}</Label>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>

      {/* Photo Grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {photos.map((url, index) => (
            <Card key={index} className="relative aspect-square overflow-hidden group">
              <img
                src={url}
                alt={`Zdjęcie ${index + 1}`}
                className="w-full h-full object-cover"
              />
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => handleRemovePhoto(url)}
                disabled={disabled || uploading}
              >
                <X className="h-4 w-4" />
              </Button>
            </Card>
          ))}
        </div>
      )}

      {/* Upload Area */}
      {photos.length < maxPhotos && !disabled && (
        <div
          className={cn(
            "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
            dragActive
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-muted-foreground/50",
            uploading && "opacity-50 pointer-events-none"
          )}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
            disabled={disabled || uploading}
          />

          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Przesyłanie zdjęć...</p>
            </div>
          ) : (
            <>
              <div className="flex justify-center mb-3">
                <div className="p-3 rounded-full bg-muted">
                  <ImageIcon className="h-6 w-6 text-muted-foreground" />
                </div>
              </div>
              <p className="text-sm font-medium mb-1">
                Przeciągnij i upuść zdjęcia lub kliknij przycisk
              </p>
              <p className="text-xs text-muted-foreground mb-3">
                PNG, JPG, WEBP do 5MB • Pozostało {maxPhotos - photos.length} miejsc
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Wybierz zdjęcia
              </Button>
            </>
          )}
        </div>
      )}

      {photos.length >= maxPhotos && (
        <p className="text-sm text-muted-foreground text-center">
          Osiągnięto limit {maxPhotos} zdjęć
        </p>
      )}
    </div>
  );
}
