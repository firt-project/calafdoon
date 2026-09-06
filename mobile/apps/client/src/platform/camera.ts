import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Sentinel thrown when the user backs out of the camera / gallery picker. */
export class PhotoPickCancelled extends Error {
  constructor() {
    super("Photo selection cancelled");
    this.name = "PhotoPickCancelled";
  }
}

export function isPhotoPickCancelled(e: unknown): boolean {
  if (e instanceof PhotoPickCancelled) return true;
  const msg = e instanceof Error ? e.message.toLowerCase() : String(e).toLowerCase();
  return (
    msg.includes("cancel") ||
    msg.includes("no photo") ||
    msg.includes("no image") ||
    msg.includes("no file")
  );
}

export type PickedPhoto = {
  blob: Blob;
  fileName: string;
  contentType: string;
};

function validateBlob(blob: Blob): void {
  if (!ALLOWED.has(blob.type) && blob.type !== "") {
    throw new Error("Please choose a JPG, PNG, or WebP image.");
  }
  if (blob.size > MAX_BYTES) {
    throw new Error("Image is too large (max 8 MB).");
  }
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

/** Pick from camera or library; web falls back to file input. */
export async function pickProfilePhoto(
  source: "camera" | "library"
): Promise<PickedPhoto> {
  if (Capacitor.isNativePlatform()) {
    let photo;
    try {
      photo = await Camera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: source === "camera" ? CameraSource.Camera : CameraSource.Photos,
        correctOrientation: true,
      });
    } catch (e) {
      // Capacitor throws on back-out ("User cancelled photos app"). Normalize
      // so the caller can stay on the chat screen without an error toast.
      if (isPhotoPickCancelled(e)) throw new PhotoPickCancelled();
      throw e;
    }
    if (!photo.dataUrl) throw new PhotoPickCancelled();
    const blob = await dataUrlToBlob(photo.dataUrl);
    validateBlob(blob);
    return {
      blob,
      fileName: `photo.${photo.format || "jpeg"}`,
      contentType: blob.type || "image/jpeg",
    };
  }

  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp";
    if (source === "camera") {
      input.setAttribute("capture", "environment");
    }
    input.oncancel = () => reject(new PhotoPickCancelled());
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new PhotoPickCancelled());
        return;
      }
      try {
        validateBlob(file);
        resolve({
          blob: file,
          fileName: file.name,
          contentType: file.type || "image/jpeg",
        });
      } catch (e) {
        reject(e);
      }
    };
    input.click();
  });
}
