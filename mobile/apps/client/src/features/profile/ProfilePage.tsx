import { lazy, Suspense, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Camera, Image as ImageIcon, Share2 } from "lucide-react";
import { profile as profileApi, photos as photosApi } from "@hel/api-client";
import { useSession } from "@/features/auth/SessionProvider";
import { useTranslation } from "@/lib/i18n/context";
import { hapticError, hapticSuccess } from "@/platform/haptics";
import { userFacingError } from "@/platform/errors";
import { shareProfileLink } from "@/platform/share-profile";
import { PhotoManager, type ManagedPhoto } from "@/features/profile/PhotoManager";

const PhotoEditorLazy = lazy(() =>
  import("@/features/profile/PhotoEditor").then((m) => ({ default: m.PhotoEditor }))
);

type PhotoVisibility = "everyone" | "matches" | "private";

const VISIBILITY_OPTIONS: {
  value: PhotoVisibility;
  titleKey:
    | "profilePage.photoEveryone"
    | "profilePage.photoMatches"
    | "profilePage.photoPrivate";
  descKey:
    | "profilePage.photoEveryoneDesc"
    | "profilePage.photoMatchesDesc"
    | "profilePage.photoPrivateDesc";
}[] = [
  {
    value: "everyone",
    titleKey: "profilePage.photoEveryone",
    descKey: "profilePage.photoEveryoneDesc",
  },
  {
    value: "matches",
    titleKey: "profilePage.photoMatches",
    descKey: "profilePage.photoMatchesDesc",
  },
  {
    value: "private",
    titleKey: "profilePage.photoPrivate",
    descKey: "profilePage.photoPrivateDesc",
  },
];

export function ProfilePage() {
  const { user, refresh, offline } = useSession();
  const { t } = useTranslation();
  const [info, setInfo] = useState<Record<string, unknown> | null>(null);
  const [gallery, setGallery] = useState<ManagedPhoto[]>([]);
  const [maxPhotos, setMaxPhotos] = useState(5);
  const [visibility, setVisibility] = useState<PhotoVisibility>("everyone");
  const [waliName, setWaliName] = useState("");
  const [waliPhone, setWaliPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editorSrc, setEditorSrc] = useState<string | null>(null);
  const [pendingSlot, setPendingSlot] = useState<"main" | "additional">("additional");

  async function reloadAll() {
    const [p, mine, wali] = await Promise.all([
      profileApi.getProfile(),
      photosApi.listMine() as Promise<{
        maxPhotos?: number;
        photos?: Array<{ mediaId?: string; url?: string | null; isMain?: boolean }>;
      }>,
      profileApi.getWali().catch(() => ({ waliName: null, waliPhone: null })),
    ]);
    const profile = (p as Record<string, unknown>) ?? null;
    setInfo(profile);
    const vis = String(profile?.photoVisibility ?? "everyone");
    setVisibility(
      vis === "matches" || vis === "private" || vis === "everyone" ? vis : "everyone"
    );
    setMaxPhotos(mine?.maxPhotos ?? 5);
    const photos = (mine?.photos ?? [])
      .filter((x) => x.mediaId)
      .map((x) => ({
        mediaId: String(x.mediaId),
        url: x.url,
        isMain: Boolean(x.isMain),
        status: "ready" as const,
      }));
    setGallery(photos);
    setWaliName(wali?.waliName ?? "");
    setWaliPhone(wali?.waliPhone ?? "");
  }

  useEffect(() => {
    reloadAll().catch((e) => setError(userFacingError(e)));
  }, []);

  async function beginPick(source: "camera" | "library") {
    setError(null);
    setStatus(null);
    if (gallery.length >= maxPhotos) {
      setError(`You can add up to ${maxPhotos} photos.`);
      return;
    }
    try {
      const { pickProfilePhoto } = await import("@/platform/camera");
      const picked = await pickProfilePhoto(source);
      if (editorSrc) URL.revokeObjectURL(editorSrc);
      const url = URL.createObjectURL(picked.blob);
      setPendingSlot(gallery.length === 0 ? "main" : "additional");
      setEditorSrc(url);
    } catch (e) {
      setError(userFacingError(e));
    }
  }

  async function confirmEdited(file: File) {
    setBusy(true);
    setError(null);
    try {
      await photosApi.uploadFile(file, { slot: pendingSlot });
      await hapticSuccess();
      setStatus(`Photo uploaded (${gallery.length + 1}/${maxPhotos}).`);
      if (editorSrc) URL.revokeObjectURL(editorSrc);
      setEditorSrc(null);
      await refresh();
      await reloadAll();
    } catch (e) {
      await hapticError();
      setError(userFacingError(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveVisibility(next: PhotoVisibility) {
    if (offline || next === visibility) return;
    setBusy(true);
    setError(null);
    try {
      await profileApi.updateProfile({ photoVisibility: next });
      setVisibility(next);
      setStatus(t("profilePage.privacyUpdated"));
      await hapticSuccess();
      await refresh();
    } catch (e) {
      await hapticError();
      setError(userFacingError(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveWali(e: React.FormEvent) {
    e.preventDefault();
    if (offline) return;
    setBusy(true);
    setError(null);
    try {
      await profileApi.updateWali({
        waliName: waliName.trim() || undefined,
        waliPhone: waliPhone.trim() || undefined,
      });
      setStatus("Calaf / guardian contact saved.");
      await hapticSuccess();
    } catch (err) {
      await hapticError();
      setError(userFacingError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onShare() {
    const publicId =
      (info?.convexId as string | undefined) ||
      (info && typeof info.profile === "object"
        ? ((info.profile as { convexId?: string }).convexId ?? "")
        : "");
    if (!publicId) {
      setError("Share is unavailable until your profile has a public identifier.");
      return;
    }
    const result = await shareProfileLink({
      publicId,
      title: "HelCalaf",
      text: "View my HelCalaf profile",
    });
    if (result.ok) {
      setStatus(
        result.method === "clipboard"
          ? "Profile link copied."
          : "Share sheet opened."
      );
      await hapticSuccess();
    } else {
      setError(result.message);
    }
  }

  const name =
    (info?.name as string | undefined) ||
    (info && typeof info.profile === "object"
      ? ((info.profile as { name?: string }).name ?? null)
      : null);

  const mainPhoto =
    gallery.find((p) => p.isMain)?.url || gallery[0]?.url || null;

  function detail(value: unknown): string {
    if (value == null || value === "") return "";
    if (Array.isArray(value)) return value.filter(Boolean).join(", ");
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return String(value);
  }

  const profileFacts: Array<{ label: string; value: string }> = [
    { label: t("profilePage.age"), value: detail(info?.age) },
    {
      label: t("profilePage.height"),
      value: info?.height != null ? `${info.height} cm` : "",
    },
    { label: t("profilePage.country"), value: detail(info?.country) },
    { label: t("profilePage.city"), value: detail(info?.city) },
    { label: t("profilePage.education"), value: detail(info?.education) },
    { label: t("profilePage.occupation"), value: detail(info?.occupation) },
    {
      label: t("profilePage.maritalStatus"),
      value: detail(info?.maritalStatus),
    },
    {
      label: t("profilePage.prayerFrequency"),
      value: detail(info?.prayerFrequency),
    },
    {
      label: t("profilePage.loveLanguage"),
      value: detail(info?.loveLanguage),
    },
    { label: t("profilePage.qualities"), value: detail(info?.qualities) },
    { label: t("profilePage.hobbies"), value: detail(info?.hobbies) },
  ].filter((row) => row.value);

  const questionnaireDone = info?.questionnaireComplete === true;

  return (
    <div className="screen pad-tab">
      <header className="screen-header">
        <div>
          <Link to="/settings" className="muted small" style={{ display: "inline-block", marginBottom: "0.25rem" }}>
            ← Settings
          </Link>
          <h1 style={{ margin: 0 }}>Profile</h1>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => void refresh()}>
          Refresh
        </button>
      </header>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {status && (
        <div className="form-success" role="status">
          {status}
        </div>
      )}
      <div className="profile-hero">
        <div
          className="avatar lg"
          style={
            mainPhoto
              ? {
                  backgroundImage: `url(${mainPhoto})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined
          }
        >
          {!mainPhoto
            ? (name ?? user?.email ?? "?").slice(0, 1).toUpperCase()
            : null}
        </div>
        <div className="center">
          <strong>{name ?? "Your profile"}</strong>
          <p className="muted small" style={{ margin: "0.25rem 0 0" }}>
            {user?.email}
          </p>
          <p className="muted small" style={{ margin: "0.35rem 0 0" }}>
            {questionnaireDone
              ? t("adminDetail.profileComplete")
              : t("adminDetail.profileIncomplete")}
          </p>
        </div>
      </div>
      <button
        type="button"
        className="btn btn-secondary btn-block"
        disabled={offline}
        onClick={() => void onShare()}
      >
        <Share2 size={16} /> Share profile
      </button>

      <section className="surface-card feed-section" aria-label="Profile details">
        <div className="feed-section-head">
          <div>
            <h2>{t("profilePage.profileDetails")}</h2>
            <p className="muted small">{t("profilePage.detailsSectionDesc")}</p>
          </div>
        </div>
        {profileFacts.length > 0 ? (
          <dl
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0.65rem 0.85rem",
              margin: 0,
            }}
          >
            {profileFacts.map((row) => (
              <div key={row.label}>
                <dt
                  className="muted small"
                  style={{ margin: 0, fontSize: "0.72rem" }}
                >
                  {row.label}
                </dt>
                <dd style={{ margin: "0.15rem 0 0", fontWeight: 600 }}>
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="muted small">{t("adminDetail.notProvided")}</p>
        )}
        <Link
          to="/onboarding/questionnaire"
          className="btn btn-primary btn-block"
          style={{ marginTop: "0.85rem" }}
        >
          {questionnaireDone
            ? t("profilePage.editDetails")
            : t("reminders.completeProfileAction")}
        </Link>
      </section>

      <section className="surface-card feed-section" aria-label="Photos">
        <div className="feed-section-head">
          <div>
            <h2>Photos</h2>
            <p className="muted small">
              Add up to {maxPhotos} photos ({gallery.length}/{maxPhotos}). First photo is your
              main profile picture.
            </p>
          </div>
        </div>
        <PhotoManager
          photos={gallery}
          maxPhotos={maxPhotos}
          busy={busy}
          onReload={reloadAll}
          onAddRequest={() => void beginPick("library")}
          labels={{
            primary: "Primary",
            remove: "Remove",
            confirmRemove: "Remove this photo from your profile?",
            moveUp: "Move photo earlier",
            moveDown: "Move photo later",
            retry: "Failed",
            empty: "No photos yet. Add at least one clear portrait.",
            saving: "Saving photo order…",
          }}
        />
        <div className="row" style={{ justifyContent: "center", marginTop: "0.75rem" }}>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || offline || gallery.length >= maxPhotos}
            onClick={() => void beginPick("camera")}
          >
            <Camera size={16} /> Take photo
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || offline || gallery.length >= maxPhotos}
            onClick={() => void beginPick("library")}
          >
            <ImageIcon size={16} /> Gallery
          </button>
        </div>
      </section>

      <section className="surface-card feed-section" aria-label="Photo privacy">
        <div className="feed-section-head">
          <div>
            <h2>{t("profilePage.photoPrivacyTitle")}</h2>
            <p className="muted small">{t("profilePage.photoPrivacyDesc")}</p>
          </div>
        </div>
        <div className="stack" style={{ gap: "0.5rem" }}>
          {VISIBILITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={
                visibility === opt.value
                  ? "btn btn-primary btn-block"
                  : "btn btn-secondary btn-block"
              }
              disabled={busy || offline}
              aria-pressed={visibility === opt.value}
              onClick={() => void saveVisibility(opt.value)}
              style={{ textAlign: "left" }}
            >
              <strong style={{ display: "block" }}>{t(opt.titleKey)}</strong>
              <span className="muted small" style={{ display: "block", opacity: 0.9 }}>
                {t(opt.descKey)}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="surface-card feed-section" aria-label="Calaf contact">
        <div className="feed-section-head">
          <div>
            <h2>{t("premium.waliTitle")}</h2>
            <p className="muted small">{t("premium.waliDesc")}</p>
          </div>
        </div>
        <form className="form" onSubmit={(e) => void saveWali(e)}>
          <label>
            Name
            <input
              value={waliName}
              onChange={(e) => setWaliName(e.target.value)}
              placeholder="Optional"
              autoComplete="name"
            />
          </label>
          <label>
            Phone
            <input
              value={waliPhone}
              onChange={(e) => setWaliPhone(e.target.value)}
              placeholder="Optional"
              inputMode="tel"
              autoComplete="tel"
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy || offline}>
            Save contact
          </button>
        </form>
      </section>

      <Link to="/plans" className="btn btn-secondary btn-block">
        Subscription / plan
      </Link>
      <Link to="/settings/change-password" className="btn btn-secondary btn-block">
        Change password
      </Link>
      {editorSrc && (
        <Suspense fallback={<div className="screen">Preparing editor…</div>}>
          <PhotoEditorLazy
            open
            imageSrc={editorSrc}
            title="Edit photo"
            confirmLabel="Upload"
            cancelLabel="Cancel"
            resetLabel="Reset"
            rotateLabel="Rotate"
            onCancel={() => {
              URL.revokeObjectURL(editorSrc);
              setEditorSrc(null);
            }}
            onConfirm={(file) => confirmEdited(file)}
          />
        </Suspense>
      )}
    </div>
  );
}
