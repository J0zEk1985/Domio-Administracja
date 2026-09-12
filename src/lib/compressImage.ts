export type CompressImageOptions = {
  maxWidthOrHeight?: number;
  initialQuality?: number;
  timeoutMs?: number;
};

/**
 * Canvas + object URL compression (no Base64). Falls back to the original file on failure.
 */
export async function compressImage(
  file: File,
  options: CompressImageOptions = {},
): Promise<File> {
  const maxWidthOrHeight = options.maxWidthOrHeight ?? 1920;
  const qualityVal = options.initialQuality ?? 0.7;
  const timeoutMs = options.timeoutMs ?? 8000;

  return new Promise((resolve) => {
    const img = new Image();
    let objectUrl: string | null = null;
    let settled = false;
    let watchdog: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (watchdog) {
        clearTimeout(watchdog);
        watchdog = null;
      }
      img.onload = null;
      img.onerror = null;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
    };

    const settleOnce = (result: File) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    watchdog = setTimeout(() => {
      console.warn(`[compressImage] Timeout ${timeoutMs}ms. Using original file.`);
      settleOnce(file);
    }, timeoutMs);

    img.onload = () => {
      try {
        let width = img.width;
        let height = img.height;
        const maxDim = Math.max(width, height);
        if (maxDim > maxWidthOrHeight) {
          const scale = maxWidthOrHeight / maxDim;
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          console.error("[compressImage] Canvas unavailable. Using original file.");
          settleOnce(file);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              console.error("[compressImage] toBlob returned null. Using original file.");
              settleOnce(file);
              return;
            }
            try {
              const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
                type: "image/jpeg",
                lastModified: Date.now(),
              });
              settleOnce(compressedFile);
            } catch (error) {
              console.error("[compressImage] File constructor failed. Using original file.", error);
              settleOnce(file);
            }
          },
          "image/jpeg",
          qualityVal,
        );
      } catch (error) {
        console.error("[compressImage] Compression failed. Using original file.", error);
        settleOnce(file);
      }
    };

    img.onerror = () => {
      console.error("[compressImage] Image load failed. Using original file.");
      settleOnce(file);
    };

    try {
      objectUrl = URL.createObjectURL(file);
      img.src = objectUrl;
    } catch (error) {
      console.error("[compressImage] Object URL failed. Using original file.", error);
      settleOnce(file);
    }
  });
}
