import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

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
    const photo = await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: source === "camera" ? CameraSource.Camera : CameraSource.Photos,
      correctOrientation: true,
    });
    if (!photo.dataUrl) throw new Error("No photo returned");
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
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new Error("No file selected"));
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
