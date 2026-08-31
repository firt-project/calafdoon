import { useEffect, useMemo, useRef, useState } from "react";
import { photos as photosApi } from "@hel/api-client";
import { userFacingError } from "@/platform/errors";
import { hapticError, hapticSuccess } from "@/platform/haptics";
import { SafeImage } from "@/ui/SafeImage";

export type ManagedPhoto = {
  mediaId: string;
  url?: string | null;
  isMain?: boolean;
  status?: "ready" | "uploading" | "failed";
};

type Props = {
  photos: ManagedPhoto[];
  maxPhotos: number;
  busy?: boolean;
  labels: {
    primary: string;
    remove: string;
    confirmRemove: string;
    moveUp: string;
    moveDown: string;
    retry: string;
    empty: string;
    saving: string;
  };
  onReload: () => Promise<void>;
  onAddRequest: () => void;
};

export function PhotoManager({
  photos,
  maxPhotos,
  busy,
  labels,
  onReload,
  onAddRequest,
}: Props) {
  const [ordered, setOrdered] = useState(photos);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);

  useEffect(() => {
    setOrdered(photos);
  }, [photos]);

  const canAdd = ordered.length < maxPhotos && !busy && !saving;

  async function persistOrder(next: ManagedPhoto[]) {
    const ids = next.map((p) => p.mediaId).filter(Boolean);
    if (ids.length === 0) return;
    setSaving(true);
    setError(null);
    const previous = ordered;
    setOrdered(next);
    try {
      await photosApi.reorder({ orderedMediaIds: ids });
      await hapticSuccess();
      await onReload();
    } catch (e) {
      setOrdered(previous);
      await hapticError();
      setError(userFacingError(e));
    } finally {
      setSaving(false);
    }
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= ordered.length) return;
    const next = [...ordered];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    void persistOrder(next);
  }

  async function remove(mediaId: string) {
    setConfirmId(null);
    setSaving(true);
    setError(null);
    try {
      await photosApi.removeAdditional(mediaId);
      await hapticSuccess();
      await onReload();
    } catch (e) {
      await hapticError();
      setError(userFacingError(e));
    } finally {
      setSaving(false);
    }
  }

  const list = useMemo(() => ordered, [ordered]);

  return (
    <div className="photo-manager">
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {saving && (
        <p className="muted small" role="status">
          {labels.saving}
        </p>
      )}
      {list.length === 0 ? (
        <p className="muted">{labels.empty}</p>
      ) : (
        <ul className="photo-grid" aria-label="Profile photos">
          {list.map((photo, index) => (
            <li
              key={photo.mediaId}
              className="photo-tile"
              draggable={!saving}
              onDragStart={() => {
                dragId.current = photo.mediaId;
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                const fromId = dragId.current;
                dragId.current = null;
                if (!fromId || fromId === photo.mediaId) return;
                const from = list.findIndex((p) => p.mediaId === fromId);
                const to = list.findIndex((p) => p.mediaId === photo.mediaId);
                if (from < 0 || to < 0) return;
                const next = [...list];
                const [item] = next.splice(from, 1);
                next.splice(to, 0, item);
                void persistOrder(next);
              }}
            >
              <SafeImage
                src={photo.url}
                alt={`Photo ${index + 1}`}
                aspectRatio="1 / 1"
                fallbackText={String(index + 1)}
              />
              {index === 0 && <span className="photo-badge">{labels.primary}</span>}
              {photo.status === "failed" && (
                <span className="photo-badge danger">{labels.retry}</span>
              )}
              <div className="photo-tile-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-icon"
                  aria-label={labels.moveUp}
                  disabled={saving || index === 0}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon"
                  aria-label={labels.moveDown}
                  disabled={saving || index === list.length - 1}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon"
                  aria-label={labels.remove}
                  disabled={saving}
                  onClick={() => setConfirmId(photo.mediaId)}
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="btn btn-secondary btn-block"
        disabled={!canAdd}
        onClick={onAddRequest}
      >
        Add photo ({list.length}/{maxPhotos})
      </button>

      {confirmId && (
        <div className="sheet" role="dialog" aria-modal="true" aria-label={labels.confirmRemove}>
          <div className="sheet-handle" />
          <p>{labels.confirmRemove}</p>
          <div className="stack">
            <button
              type="button"
              className="btn btn-danger btn-block"
              onClick={() => void remove(confirmId)}
            >
              {labels.remove}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-block"
              onClick={() => setConfirmId(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
