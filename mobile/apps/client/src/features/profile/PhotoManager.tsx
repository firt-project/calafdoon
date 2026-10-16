import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Star,
  Trash2,
} from "lucide-react";
import { photos as photosApi } from "@hel/api-client";
import { userFacingError } from "@/platform/errors";
import { hapticError, hapticSuccess } from "@/platform/haptics";
import { SafeImage } from "@/ui/SafeImage";
import { BottomSheet } from "@/ui/mobile-kit";
import { resetPhotoGate } from "@/features/profile/photo-gate";

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
    replace?: string;
  };
  onReload: () => Promise<void>;
  onAddRequest: () => void;
  /** Replace this photo with a new one. */
  onReplaceRequest?: (photo: ManagedPhoto) => void;
  /** Local preview of a photo that is being uploaded right now. */
  uploadingPreview?: string | null;
};

/**
 * Photo studio: one large main photo, a grid of extra photos (tap for actions) and an
 * "Add" tile. Every action also lives in a bottom sheet so tap targets stay large.
 */
export function PhotoManager({
  photos,
  maxPhotos,
  busy,
  labels,
  onReload,
  onAddRequest,
  onReplaceRequest,
  uploadingPreview,
}: Props) {
  const [ordered, setOrdered] = useState(photos);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    setOrdered(photos);
  }, [photos]);

  const list = ordered;
  const uploading = Boolean(uploadingPreview);
  const total = list.length + (uploading && list.length < maxPhotos ? 1 : 0);
  const canAdd = total < maxPhotos && !busy && !saving && !uploading;

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
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item!);
    void persistOrder(next);
  }

  function makeMain(index: number) {
    const next = [...list];
    const [item] = next.splice(index, 1);
    next.unshift(item!);
    void persistOrder(next);
  }

  async function remove(mediaId: string) {
    setConfirmId(null);
    setSaving(true);
    setError(null);
    const wasOnly = list.length === 1;
    try {
      await photosApi.removeAdditional(mediaId);
      await hapticSuccess();
      await onReload();
      if (wasOnly) {
        // A profile photo is required: send the member to add a new one.
        resetPhotoGate();
        navigate("/onboarding/photo", { replace: true });
      }
    } catch (e) {
      await hapticError();
      setError(userFacingError(e));
    } finally {
      setSaving(false);
    }
  }

  const primary = list[0];
  const extras = list.slice(1);
  const menuIndex = menuId ? list.findIndex((p) => p.mediaId === menuId) : -1;
  const menuPhoto = menuIndex >= 0 ? list[menuIndex]! : null;

  return (
    <div className="ph">
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}

      {list.length === 0 && !uploading ? (
        <button type="button" className="ph-empty" disabled={!canAdd} onClick={onAddRequest}>
          <span className="ph-empty-icon">
            <Camera size={30} aria-hidden />
          </span>
          <strong>Add your main photo</strong>
          <span className="muted small">{labels.empty}</span>
        </button>
      ) : (
        <>
          <div className="ph-hero">
            <div className="ph-hero-img">
              <SafeImage
                src={primary?.url ?? uploadingPreview}
                alt="Main photo"
                aspectRatio="4 / 5"
                fallbackText="1"
              />
              {primary ? (
                <span className="ph-chip">
                  <Star size={12} aria-hidden /> {labels.primary}
                </span>
              ) : null}
              {primary?.status === "failed" && <span className="ph-chip danger">{labels.retry}</span>}
              {!primary && uploading && (
                <div className="ph-busy">
                  <Loader2 size={26} className="ph-spin" aria-hidden />
                  <span>Uploading…</span>
                </div>
              )}
              {(saving || (primary && uploading && false)) && (
                <div className="ph-busy ph-busy-soft" role="status">
                  <Loader2 size={22} className="ph-spin" aria-hidden />
                </div>
              )}
            </div>
            {primary && (
              <div className="ph-actions">
                {onReplaceRequest && (
                  <button type="button" className="ph-btn" disabled={saving || busy || uploading} onClick={() => onReplaceRequest(primary)}>
                    <RefreshCw size={16} aria-hidden /> {labels.replace ?? "Replace"}
                  </button>
                )}
                <button type="button" className="ph-btn danger" disabled={saving || uploading} onClick={() => setConfirmId(primary.mediaId)}>
                  <Trash2 size={16} aria-hidden /> {labels.remove}
                </button>
              </div>
            )}
          </div>

          <div className="ph-row">
            <span className="ph-row-title">More photos</span>
            <span className="muted small">Tap a photo for options</span>
          </div>
          <ul className="ph-grid" aria-label="More profile photos">
            {extras.map((photo) => (
              <li key={photo.mediaId}>
                <button
                  type="button"
                  className="ph-tile"
                  aria-label="Photo options"
                  disabled={saving || uploading}
                  onClick={() => setMenuId(photo.mediaId)}
                >
                  <SafeImage src={photo.url} alt="Profile photo" aspectRatio="1 / 1" fallbackText="•" />
                  {photo.status === "failed" && <span className="ph-chip danger sm">{labels.retry}</span>}
                  <span className="ph-more" aria-hidden>
                    <MoreHorizontal size={16} />
                  </span>
                </button>
              </li>
            ))}
            {uploading && primary && (
              <li>
                <div className="ph-tile">
                  <SafeImage src={uploadingPreview} alt="Uploading photo" aspectRatio="1 / 1" fallbackText="•" />
                  <div className="ph-busy">
                    <Loader2 size={22} className="ph-spin" aria-hidden />
                  </div>
                </div>
              </li>
            )}
            {canAdd && (
              <li>
                <button type="button" className="ph-tile ph-add" onClick={onAddRequest}>
                  <span className="ph-add-inner">
                    <Plus size={22} aria-hidden />
                    <span>Add photo</span>
                  </span>
                </button>
              </li>
            )}
          </ul>
        </>
      )}

      <BottomSheet open={menuPhoto != null} title="Photo options" onClose={() => setMenuId(null)}>
        {menuPhoto && (
          <div className="stack">
            <div className="ph-sheet-preview">
              <SafeImage src={menuPhoto.url} alt="Selected photo" aspectRatio="1 / 1" fallbackText="•" />
            </div>
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={() => {
                makeMain(menuIndex);
                setMenuId(null);
              }}
            >
              <Star size={16} /> Make main photo
            </button>
            {onReplaceRequest && (
              <button
                type="button"
                className="btn btn-secondary btn-block"
                onClick={() => {
                  const p = menuPhoto;
                  setMenuId(null);
                  onReplaceRequest(p);
                }}
              >
                <RefreshCw size={16} /> {labels.replace ?? "Replace"} photo
              </button>
            )}
            <div className="ph-sheet-move">
              <button type="button" className="btn btn-secondary" disabled={menuIndex <= 1} onClick={() => { move(menuIndex, -1); setMenuId(null); }}>
                <ArrowLeft size={16} /> {labels.moveUp}
              </button>
              <button type="button" className="btn btn-secondary" disabled={menuIndex >= list.length - 1} onClick={() => { move(menuIndex, 1); setMenuId(null); }}>
                {labels.moveDown} <ArrowRight size={16} />
              </button>
            </div>
            <button
              type="button"
              className="btn btn-danger btn-block"
              onClick={() => {
                const id = menuPhoto.mediaId;
                setMenuId(null);
                setConfirmId(id);
              }}
            >
              <Trash2 size={16} /> {labels.remove}
            </button>
          </div>
        )}
      </BottomSheet>

      <BottomSheet open={confirmId != null} title="Remove this photo?" onClose={() => setConfirmId(null)}>
        <div className="stack">
          <p className="muted" style={{ margin: 0 }}>
            {list.length === 1
              ? "This is your only photo. After removing it you will be asked to add a new one."
              : labels.confirmRemove}
          </p>
          <button type="button" className="btn btn-danger btn-block" onClick={() => confirmId && void remove(confirmId)}>
            {labels.remove}
          </button>
          <button type="button" className="btn btn-secondary btn-block" onClick={() => setConfirmId(null)}>
            Cancel
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
