import { useCallback, useEffect, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Loader2, RotateCw, Undo2, X, ZoomIn, ZoomOut } from "lucide-react";
import { prepareImageForUpload } from "@hel/api-client";

type Props = {
  open: boolean;
  imageSrc: string;
  title: string;
  confirmLabel: string;
  cancelLabel: string;
  resetLabel: string;
  rotateLabel: string;
  onCancel: () => void;
  onConfirm: (file: File) => void | Promise<void>;
};

async function cropToBlob(
  imageSrc: string,
  crop: Area,
  rotation: number
): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  const rad = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const bw = image.width * cos + image.height * sin;
  const bh = image.width * sin + image.height * cos;

  const rotCanvas = document.createElement("canvas");
  rotCanvas.width = Math.max(1, Math.round(bw));
  rotCanvas.height = Math.max(1, Math.round(bh));
  const rctx = rotCanvas.getContext("2d");
  if (!rctx) throw new Error("Canvas unavailable");
  rctx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
  rctx.rotate(rad);
  rctx.drawImage(image, -image.width / 2, -image.height / 2);

  canvas.width = Math.max(1, Math.round(crop.width));
  canvas.height = Math.max(1, Math.round(crop.height));
  ctx.drawImage(
    rotCanvas,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    canvas.width,
    canvas.height
  );

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92)
  );
  if (!blob) throw new Error("Could not crop image");
  return blob;
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = url;
  });
}

export function PhotoEditor({
  open,
  imageSrc,
  title,
  confirmLabel,
  cancelLabel,
  resetLabel,
  rotateLabel,
  onCancel,
  onConfirm,
}: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setArea(null);
    setError(null);
    abortRef.current = false;
  }, [open, imageSrc]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  const reset = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
  };

  const confirm = useCallback(async () => {
    if (!area || busy) return;
    setBusy(true);
    setError(null);
    try {
      const cropped = await cropToBlob(imageSrc, area, rotation);
      if (abortRef.current) return;
      const prepared = await prepareImageForUpload(cropped, {
        maxEdge: 1600,
        quality: 0.82,
      });
      if (abortRef.current) return;
      const file = new File([prepared], `profile-${Date.now()}.jpg`, {
        type: "image/jpeg",
      });
      await onConfirm(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not prepare photo");
    } finally {
      setBusy(false);
    }
  }, [area, busy, imageSrc, onConfirm, rotation]);

  if (!open) return null;

  return (
    <div className="pe" role="dialog" aria-modal="true" aria-label={title}>
      <header className="pe-top">
        <button type="button" className="pe-icon" onClick={onCancel} disabled={busy} aria-label={cancelLabel}>
          <X size={22} aria-hidden />
        </button>
        <h1 className="pe-title">{title}</h1>
        <span className="pe-top-spacer" aria-hidden />
      </header>

      {error && (
        <div className="form-error pe-error" role="alert">
          {error}
        </div>
      )}

      <div className="pe-stage">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          rotation={rotation}
          aspect={3 / 4}
          showGrid
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onRotationChange={setRotation}
          onCropComplete={(_, a) => setArea(a)}
        />
        {busy && (
          <div className="pe-busy" role="status">
            <Loader2 size={30} className="ph-spin" aria-hidden />
            <span>Preparing your photo…</span>
          </div>
        )}
      </div>

      <p className="pe-hint">Drag to move · pinch or use the slider to zoom</p>

      <div className="pe-panel">
        <div className="pe-zoom">
          <ZoomOut size={18} aria-hidden />
          <input
            type="range"
            min={1}
            max={3}
            step={0.02}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label="Zoom"
          />
          <ZoomIn size={18} aria-hidden />
        </div>
        <div className="pe-tools">
          <button type="button" className="pe-tool" onClick={() => setRotation((r) => r + 90)} disabled={busy}>
            <span className="pe-tool-icon">
              <RotateCw size={20} aria-hidden />
            </span>
            {rotateLabel}
          </button>
          <button type="button" className="pe-tool" onClick={reset} disabled={busy}>
            <span className="pe-tool-icon">
              <Undo2 size={20} aria-hidden />
            </span>
            {resetLabel}
          </button>
        </div>
        <button type="button" className="pe-confirm" onClick={() => void confirm()} disabled={busy || !area}>
          {busy ? "Preparing…" : confirmLabel === "Upload" ? "Use this photo" : confirmLabel}
        </button>
        <button type="button" className="pe-cancel" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
