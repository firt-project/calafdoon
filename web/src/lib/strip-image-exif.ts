const MAX_EDGE = 1920;
/** Accept phone photos up to a normal 10MB; larger files are rejected before compress. */
const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 1.5 * 1024 * 1024;
const MAX_RAW_UPLOAD_BYTES = 2 * 1024 * 1024;

/**
 * Re-encode an image as a clear, reasonably sized JPEG (EXIF stripped).
 * Large phone photos are downscaled during decode to avoid mobile OOM crashes.
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("Image is too large. Please choose a photo under 10MB.");
  }

  const type = file.type || guessMimeFromName(file.name);
  if (type && !type.startsWith("image/") && type !== "application/octet-stream") {
    throw new Error("Please choose an image file.");
  }

  if (/heic|heif/i.test(type) || /\.(heic|heif)$/i.test(file.name)) {
    // Try decode anyway (some browsers can); otherwise clear error.
    try {
      return await compressToJpeg(file);
    } catch {
      throw new Error(
        "This photo format is not supported. Please upload a JPG or PNG."
      );
    }
  }

  if (type === "image/svg+xml") {
    throw new Error("Please upload a JPG or PNG photo.");
  }

  try {
    return await compressToJpeg(file);
  } catch (error) {
    // Small already-safe files can upload as-is if compression fails.
    if (
      file.size <= MAX_RAW_UPLOAD_BYTES &&
      (type === "image/jpeg" || type === "image/png" || type === "image/webp")
    ) {
      return file;
    }
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Could not process this photo. Please try another JPG or PNG.";
    throw new Error(message);
  }
}

async function compressToJpeg(file: File): Promise<File> {
  const bitmap = await decodeDownscaled(file);
  try {
    if (!bitmap.width || !bitmap.height) {
      throw new Error("Could not read this photo.");
    }

    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      throw new Error("Could not process this photo on this device.");
    }

    ctx.imageSmoothingEnabled = true;
    try {
      ctx.imageSmoothingQuality = "high";
    } catch {
      // Older browsers may not support this property.
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);

    let quality = 0.88;
    let blob = await canvasToJpegBlob(canvas, quality);
    if (!blob) {
      throw new Error("Could not process this photo on this device.");
    }

    // Step quality down until under the output budget (mobile-friendly upload).
    while (blob.size > MAX_OUTPUT_BYTES && quality > 0.55) {
      quality -= 0.08;
      const next = await canvasToJpegBlob(canvas, quality);
      if (!next) break;
      blob = next;
    }

    // Still huge? shrink dimensions once more.
    if (blob.size > MAX_OUTPUT_BYTES && Math.max(width, height) > 1280) {
      const shrink = 1280 / Math.max(width, height);
      const w2 = Math.max(1, Math.round(width * shrink));
      const h2 = Math.max(1, Math.round(height * shrink));
      canvas.width = w2;
      canvas.height = h2;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w2, h2);
      ctx.drawImage(bitmap, 0, 0, w2, h2);
      blob = (await canvasToJpegBlob(canvas, 0.8)) ?? blob;
    }

    const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    bitmap.close();
  }
}

/**
 * Decode and downscale early so multi‑MB phone photos do not OOM on mobile.
 */
async function decodeDownscaled(file: File): Promise<ImageBitmap> {
  const large = file.size > 1_500_000;

  if (large && typeof createImageBitmap === "function") {
    // Try constraining width, then height (covers landscape + portrait phones).
    for (const opts of [
      { resizeWidth: MAX_EDGE, resizeQuality: "high" as const },
      { resizeHeight: MAX_EDGE, resizeQuality: "high" as const },
    ]) {
      try {
        let bmp = await createImageBitmap(file, opts);
        bmp = await ensureMaxEdge(bmp);
        return bmp;
      } catch {
        // try next strategy
      }
    }
  }

  // Full decode (OK for smaller files) + scale if needed.
  try {
    let bmp = await createImageBitmap(file);
    bmp = await ensureMaxEdge(bmp);
    return bmp;
  } catch {
    // HTMLImageElement fallback
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await loadHtmlImage(url);
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (!width || !height) {
      throw new Error("Could not read this photo.");
    }
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    return await createImageBitmap(img, {
      resizeWidth: w,
      resizeHeight: h,
      resizeQuality: "high",
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function ensureMaxEdge(bitmap: ImageBitmap): Promise<ImageBitmap> {
  const longest = Math.max(bitmap.width, bitmap.height);
  if (longest <= MAX_EDGE) return bitmap;

  const scale = MAX_EDGE / longest;
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  try {
    const next = await createImageBitmap(bitmap, {
      resizeWidth: w,
      resizeHeight: h,
      resizeQuality: "high",
    });
    bitmap.close();
    return next;
  } catch {
    return bitmap;
  }
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read this photo."));
    img.src = url;
  });
}

function canvasToJpegBlob(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
    } catch {
      resolve(null);
    }
  });
}

function guessMimeFromName(name: string): string {
  if (/\.jpe?g$/i.test(name)) return "image/jpeg";
  if (/\.png$/i.test(name)) return "image/png";
  if (/\.webp$/i.test(name)) return "image/webp";
  if (/\.gif$/i.test(name)) return "image/gif";
  if (/\.bmp$/i.test(name)) return "image/bmp";
  if (/\.heic$/i.test(name)) return "image/heic";
  if (/\.heif$/i.test(name)) return "image/heif";
  return "";
}
