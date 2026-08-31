/**
 * Resize/compress images before upload. Avoids storing full-resolution blobs
 * and reduces EXIF footprint by re-encoding through canvas.
 */
export async function prepareImageForUpload(
  file: Blob,
  opts?: { maxEdge?: number; quality?: number }
): Promise<Blob> {
  const maxEdge = opts?.maxEdge ?? 1600;
  const quality = opts?.quality ?? 0.82;

  if (typeof createImageBitmap === "undefined" || typeof document === "undefined") {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality)
    );
    return blob ?? file;
  } catch {
    return file;
  }
}
