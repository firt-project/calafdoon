import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Ban,
  Bookmark,
  Briefcase,
  CheckCircle2,
  GraduationCap,
  Heart,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { matching, moderation, ApiClientError } from "@hel/api-client";
import { useSession } from "@/features/auth/SessionProvider";
import { useTranslation } from "@/lib/i18n/context";
import { BottomSheet } from "@/ui/mobile-kit";
import { CompatBadge } from "@/ui/design-system";
import { PhotoGuard } from "@/ui/PhotoGuard";
import { hapticError, hapticMedium, hapticSuccess } from "@/platform/haptics";
import { userFacingError } from "@/platform/errors";
import type { DiscoverMember, LookingForPrefs } from "@/features/discover/types";
import {
  memberPhoto,
  memberPlace,
  memberScore,
} from "@/features/discover/types";
import { cn } from "@/utils/cn";

function asMember(raw: unknown, fallback?: DiscoverMember | null): DiscoverMember {
  const base = fallback ?? {};
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const nested =
    o.profile && typeof o.profile === "object"
      ? (o.profile as Record<string, unknown>)
      : o;
  const lookingRaw = nested.lookingFor ?? o.lookingFor;
  const lookingFor =
    lookingRaw && typeof lookingRaw === "object"
      ? ({
          ...(base.lookingFor ?? null),
          ...(lookingRaw as LookingForPrefs),
        } as LookingForPrefs)
      : base.lookingFor ?? null;

  return {
    ...base,
    userId: String(nested.userId ?? o.userId ?? base.userId ?? ""),
    name: (nested.name as string) ?? base.name,
    age: (nested.age as number | string) ?? base.age,
    gender: (nested.gender as string) ?? base.gender,
    city: (nested.city as string) ?? base.city,
    country: (nested.country as string) ?? base.country,
    height: (nested.height as number) ?? base.height,
    bio: (nested.bio as string) ?? base.bio,
    occupation: (nested.occupation as string) ?? base.occupation,
    education: (nested.education as string) ?? base.education,
    imageUrl:
      (nested.imageUrl as string) ?? (nested.photoUrl as string) ?? base.imageUrl,
    photoUrl: (nested.photoUrl as string) ?? base.photoUrl,
    additionalImageUrls:
      (nested.additionalImageUrls as string[]) ?? base.additionalImageUrls,
    languagesSpoken:
      (nested.languagesSpoken as string[]) ?? base.languagesSpoken,
    hobbies: (nested.hobbies as string[]) ?? base.hobbies,
    interests: (nested.interests as string[]) ?? base.interests,
    qualities: (nested.qualities as string[]) ?? base.qualities,
    prayerFrequency:
      (nested.prayerFrequency as string) ?? base.prayerFrequency,
    religiousLevel: (nested.religiousLevel as string) ?? base.religiousLevel,
    madhhab: (nested.madhhab as string) ?? base.madhhab,
    maritalStatus: (nested.maritalStatus as string) ?? base.maritalStatus,
    marriageTimeline:
      (nested.marriageTimeline as string) ?? base.marriageTimeline,
    wantChildren: (nested.wantChildren as string) ?? base.wantChildren,
    marrySomeoneWithChildren:
      (nested.marrySomeoneWithChildren as string) ??
      base.marrySomeoneWithChildren,
    familyInvolvement:
      (nested.familyInvolvement as string) ?? base.familyInvolvement,
    livingSituation: (nested.livingSituation as string) ?? base.livingSituation,
    readyToRelocate: (nested.readyToRelocate as string) ?? base.readyToRelocate,
    financialReadiness:
      (nested.financialReadiness as string) ?? base.financialReadiness,
    marriageWorkPreference:
      (nested.marriageWorkPreference as string) ?? base.marriageWorkPreference,
    exercise: (nested.exercise as string) ?? base.exercise,
    smokes: (nested.smokes as string) ?? base.smokes,
    drinksAlcohol: (nested.drinksAlcohol as string) ?? base.drinksAlcohol,
    polygynyOpenness:
      (nested.polygynyOpenness as string) ?? base.polygynyOpenness,
    loveLanguage: (nested.loveLanguage as string) ?? base.loveLanguage,
    children: (nested.children as number) ?? base.children,
    verified: (nested.verified as boolean) ?? base.verified,
    advisorReviewed:
      (nested.advisorReviewed as boolean) ?? base.advisorReviewed,
    online: (nested.online as boolean) ?? base.online,
    lastSeenAt:
      (nested.lastSeenAt as string | null | undefined) ?? base.lastSeenAt,
    liked: (nested.liked as boolean) ?? base.liked,
    shortlisted: (nested.shortlisted as boolean) ?? base.shortlisted,
    lookingFor,
    score:
      (nested.score as number) ??
      (nested.compatibilityScore as number) ??
      (o.score as number) ??
      base.score,
    compatibilityScore:
      (nested.compatibilityScore as number) ?? base.compatibilityScore,
  };
}

function ProfileSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="fp-section">
      <h2 className="fp-section-title">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value?: unknown }) {
  if (value == null || value === "") return null;
  const text = Array.isArray(value)
    ? value.filter(Boolean).join(", ")
    : String(value);
  if (!text.trim()) return null;
  return (
    <div className="fp-field">
      <dt>{label}</dt>
      <dd>{text}</dd>
    </div>
  );
}

function ChipList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="fp-chips">
      {items.map((c) => (
        <span key={c} className="fp-chip">
          {c}
        </span>
      ))}
    </div>
  );
}

function ProfileGallery({
  photos,
  name,
  index,
  onIndexChange,
}: {
  photos: string[];
  name: string;
  index: number;
  onIndexChange: (i: number) => void;
}) {
  const touchX = useRef<number | null>(null);
  const safeIndex = photos.length ? Math.min(index, photos.length - 1) : 0;

  return (
    <section className="fp-gallery" aria-label="Photos">
      <div
        className="fp-gallery-frame"
        onTouchStart={(e) => {
          touchX.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          const start = touchX.current;
          const end = e.changedTouches[0]?.clientX;
          touchX.current = null;
          if (start == null || end == null || photos.length < 2) return;
          const delta = end - start;
          if (Math.abs(delta) < 40) return;
          if (delta < 0) onIndexChange(Math.min(safeIndex + 1, photos.length - 1));
          else onIndexChange(Math.max(safeIndex - 1, 0));
        }}
      >
        {photos.length > 0 ? (
          <>
            <img
              src={photos[safeIndex]}
              alt={`${name}`}
              draggable={false}
              onContextMenu={(e) => e.preventDefault()}
            />
            <PhotoGuard />
          </>
        ) : (
          <div className="fp-gallery-fallback" aria-hidden>
            {name.slice(0, 1)}
          </div>
        )}
        {photos.length > 1 ? (
          <div className="fp-gallery-count" aria-hidden>
            {safeIndex + 1}/{photos.length}
          </div>
        ) : null}
      </div>
      {photos.length > 1 ? (
        <div className="fp-gallery-thumbs" role="tablist" aria-label="Photo gallery">
          {photos.map((src, i) => (
            <button
              key={`${src}-${i}`}
              type="button"
              role="tab"
              aria-selected={i === safeIndex}
              aria-label={`Photo ${i + 1} of ${photos.length}`}
              className={cn("fp-thumb", i === safeIndex && "is-active")}
              onClick={() => onIndexChange(i)}
            >
              <img src={src} alt="" />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function FullProfilePage() {
  const { userId = "" } = useParams<{ userId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { offline } = useSession();
  const { t } = useTranslation();
  const seed =
    (location.state as { member?: DiscoverMember } | null)?.member ?? null;
  const seedRef = useRef(seed);
  seedRef.current = seed;

  const [member, setMember] = useState<DiscoverMember | null>(
    seed ? { ...seed, userId: seed.userId ?? userId } : { userId }
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [liked, setLiked] = useState(Boolean(seed?.liked));
  const [saved, setSaved] = useState(Boolean(seed?.shortlisted));
  const [menuOpen, setMenuOpen] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      const fallback = seedRef.current;
      try {
        const card = await matching.getPeerCard(userId);
        if (!alive) return;
        const next = asMember(card, fallback);
        setMember(next);
        setLiked(Boolean(next.liked));
        setSaved(Boolean(next.shortlisted));
        try {
          const br = (await matching.getCompatibilityBreakdown(userId)) as {
            storedScore?: number | null;
            total?: number | null;
          } | null;
          if (br && alive) {
            setMember((prev) =>
              prev
                ? {
                    ...prev,
                    score:
                      prev.score ?? br.storedScore ?? br.total ?? undefined,
                  }
                : prev
            );
          }
        } catch {
          /* optional */
        }
      } catch (e) {
        if (!alive) return;
        if (fallback && (fallback.name || fallback.imageUrl || fallback.bio)) {
          setMember({ ...fallback, userId: fallback.userId ?? userId });
        } else if (
          e instanceof ApiClientError &&
          (e.status === 403 || e.status === 404)
        ) {
          setError(t("discoverFeed.profileUnavailable"));
        } else {
          setError(userFacingError(e));
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId, t]);

  const gallery = useMemo(() => {
    if (!member) return [] as string[];
    const main = memberPhoto(member);
    const rest = member.additionalImageUrls ?? [];
    return [main, ...rest].filter((u): u is string => Boolean(u));
  }, [member]);

  useEffect(() => {
    setPhotoIndex(0);
  }, [userId, gallery.length]);

  async function message() {
    if (!userId || busy || offline) return;
    setBusy(true);
    try {
      const res = await matching.startChat(userId);
      await hapticSuccess();
      if (res?.conversationId) navigate(`/messages/${res.conversationId}`);
      else navigate("/messages");
    } catch (e) {
      await hapticError();
      setError(userFacingError(e));
    } finally {
      setBusy(false);
    }
  }

  async function like() {
    if (!userId || busy || offline) return;
    setBusy(true);
    try {
      const res = (await matching.likeUser(userId, "like")) as {
        conversationId?: string;
      };
      await hapticSuccess();
      setLiked(true);
      if (res?.conversationId) navigate(`/messages/${res.conversationId}`);
    } catch (e) {
      await hapticError();
      setError(userFacingError(e));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!userId || busy || offline) return;
    setBusy(true);
    try {
      await matching.likeUser(userId, "shortlist");
      await hapticSuccess();
      setSaved(true);
    } catch (e) {
      await hapticError();
      setError(userFacingError(e));
    } finally {
      setBusy(false);
    }
  }

  async function hide() {
    if (!userId || busy || offline) return;
    setBusy(true);
    try {
      await matching.likeUser(userId, "pass");
      await hapticMedium();
      setMenuOpen(false);
      navigate("/discover", { replace: true });
    } catch (e) {
      await hapticError();
      setError(userFacingError(e));
    } finally {
      setBusy(false);
    }
  }

  async function reportOrBlock(kind: "report" | "block") {
    if (!userId || busy || offline) return;
    setBusy(true);
    try {
      if (kind === "block") {
        await moderation.blockUser(userId);
        await hapticMedium();
        setMenuOpen(false);
        navigate("/discover", { replace: true });
        return;
      }
      await moderation.reportUser({
        userId,
        reason: "other",
        details: t("safety.reportFromMatches", {
          name: member?.name ?? "member",
        }),
      });
      await hapticMedium();
      setMenuOpen(false);
    } catch (e) {
      await hapticError();
      setError(userFacingError(e));
    } finally {
      setBusy(false);
    }
  }

  const name = member?.name ?? "Member";
  const place = member ? memberPlace(member) : "";
  const score = member ? memberScore(member) : null;
  const interests = [
    ...(member?.hobbies ?? []),
    ...(member?.interests ?? []),
    ...(member?.qualities ?? []),
  ].filter((v, i, arr) => v && arr.indexOf(v) === i);
  const looking = member?.lookingFor;
  const ageRange =
    looking?.minAge != null && looking?.maxAge != null
      ? `${looking.minAge}–${looking.maxAge}`
      : null;

  const hasBasics =
    member?.occupation || member?.education || member?.religiousLevel || place;
  const hasLifestyle =
    member?.exercise ||
    member?.smokes ||
    member?.drinksAlcohol ||
    member?.livingSituation ||
    member?.loveLanguage;
  const hasQuestions =
    member?.prayerFrequency ||
    member?.madhhab ||
    member?.maritalStatus ||
    member?.children != null ||
    member?.marriageTimeline ||
    member?.wantChildren ||
    member?.marrySomeoneWithChildren ||
    member?.familyInvolvement ||
    member?.readyToRelocate ||
    member?.financialReadiness ||
    member?.marriageWorkPreference ||
    member?.polygynyOpenness ||
    member?.languagesSpoken?.length;
  const hasLooking =
    ageRange ||
    looking?.preferredCountries?.length ||
    looking?.educationLevel ||
    looking?.religiousLevel ||
    looking?.acceptDivorcee ||
    looking?.acceptWidow ||
    looking?.acceptChildren ||
    looking?.readyToRelocate ||
    looking?.qualities?.length ||
    looking?.hobbies?.length;

  return (
    <div className="screen full-profile-screen fp-screen">
      <header className="fp-topbar">
        <button
          type="button"
          className="back-btn"
          aria-label={t("discoverFeed.back")}
          onClick={() => navigate(-1)}
        >
          ←
        </button>
        <div className="fp-topbar-title">
          <span>{t("discoverFeed.profileTitle")}</span>
        </div>
        <button
          type="button"
          className="btn btn-ghost fp-icon-btn"
          aria-label={t("discoverFeed.moreActions")}
          onClick={() => setMenuOpen(true)}
        >
          <MoreHorizontal size={18} />
        </button>
      </header>

      {loading && (
        <p className="muted center fp-loading">{t("discoverFeed.loadingProfile")}</p>
      )}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}

      {!loading && member && (
        <div className="fp-body">
          <ProfileGallery
            photos={gallery}
            name={name}
            index={photoIndex}
            onIndexChange={setPhotoIndex}
          />

          <div className="fp-hero">
            <div className="fp-hero-main">
              <h1 className="fp-name">
                {name}
                {member.age != null ? (
                  <span className="fp-age">, {member.age}</span>
                ) : null}
              </h1>
              <div className="fp-hero-meta">
                {score != null ? <CompatBadge score={score} /> : null}
                <span
                  className={cn(
                    "fp-presence",
                    member.online ? "is-online" : "is-offline"
                  )}
                >
                  <span className="fp-presence-dot" aria-hidden />
                  {member.online
                    ? t("chatPage.activeNow")
                    : t("discoverFeed.offlineStatus")}
                </span>
              </div>
            </div>

            <div className="fp-quick-facts">
              {place ? (
                <p>
                  <MapPin size={14} aria-hidden /> {place}
                </p>
              ) : null}
              {member.occupation ? (
                <p>
                  <Briefcase size={14} aria-hidden /> {member.occupation}
                </p>
              ) : null}
              {member.education ? (
                <p>
                  <GraduationCap size={14} aria-hidden /> {member.education}
                </p>
              ) : null}
              {member.religiousLevel ? (
                <p>
                  <ShieldCheck size={14} aria-hidden /> {member.religiousLevel}
                </p>
              ) : null}
            </div>
          </div>

          {member.bio ? (
            <ProfileSection title={t("discoverFeed.about")}>
              <p className="fp-bio">{member.bio}</p>
            </ProfileSection>
          ) : null}

          {interests.length > 0 ? (
            <ProfileSection title={t("discoverFeed.interests")}>
              <ChipList items={interests} />
            </ProfileSection>
          ) : null}

          {hasQuestions ? (
            <ProfileSection title={t("discoverFeed.questions")}>
              <dl className="fp-fields">
                <Field
                  label={t("discoverFeed.prayer")}
                  value={member.prayerFrequency}
                />
                <Field label={t("discoverFeed.madhhab")} value={member.madhhab} />
                <Field
                  label={t("matchesPage.maritalStatus")}
                  value={member.maritalStatus}
                />
                <Field
                  label={t("adminDetail.children")}
                  value={member.children}
                />
                <Field
                  label={t("matchesPage.marriageTimeline")}
                  value={member.marriageTimeline}
                />
                <Field
                  label={t("matchesPage.wantChildren")}
                  value={member.wantChildren}
                />
                <Field
                  label={t("adminDetail.marryWithChildren")}
                  value={member.marrySomeoneWithChildren}
                />
                <Field
                  label={t("discoverFeed.family")}
                  value={member.familyInvolvement}
                />
                <Field
                  label={t("discoverFeed.relocate")}
                  value={member.readyToRelocate}
                />
                <Field
                  label={t("discoverFeed.finance")}
                  value={member.financialReadiness}
                />
                <Field
                  label={t("discoverFeed.workAfterMarriage")}
                  value={member.marriageWorkPreference}
                />
                <Field
                  label={t("discoverFeed.polygyny")}
                  value={member.polygynyOpenness}
                />
                <Field
                  label={t("discoverFeed.languages")}
                  value={member.languagesSpoken}
                />
                {member.height != null ? (
                  <Field
                    label={t("matchesPage.height")}
                    value={`${member.height} cm`}
                  />
                ) : null}
              </dl>
            </ProfileSection>
          ) : null}

          {hasLifestyle ? (
            <ProfileSection title={t("discoverFeed.lifestyle")}>
              <dl className="fp-fields">
                <Field label={t("discoverFeed.exercise")} value={member.exercise} />
                <Field label={t("discoverFeed.smoking")} value={member.smokes} />
                <Field
                  label={t("discoverFeed.alcohol")}
                  value={member.drinksAlcohol}
                />
                <Field
                  label={t("discoverFeed.living")}
                  value={member.livingSituation}
                />
                <Field
                  label={t("discoverFeed.loveLanguage")}
                  value={member.loveLanguage}
                />
              </dl>
            </ProfileSection>
          ) : null}

          {hasLooking ? (
            <ProfileSection title={t("discoverFeed.lookingFor")}>
              <dl className="fp-fields">
                <Field label={t("discoverFeed.preferredAge")} value={ageRange} />
                <Field
                  label={t("discoverFeed.preferredCountries")}
                  value={looking?.preferredCountries}
                />
                <Field
                  label={t("matchesPage.education")}
                  value={looking?.educationLevel}
                />
                <Field
                  label={t("matchesPage.religion")}
                  value={looking?.religiousLevel}
                />
                <Field
                  label={t("adminDetail.acceptDivorcee")}
                  value={looking?.acceptDivorcee}
                />
                <Field
                  label={t("adminDetail.acceptWidow")}
                  value={looking?.acceptWidow}
                />
                <Field
                  label={t("discoverFeed.acceptChildren")}
                  value={looking?.acceptChildren}
                />
                <Field
                  label={t("discoverFeed.relocate")}
                  value={looking?.readyToRelocate}
                />
              </dl>
              {looking?.qualities?.length ? (
                <div className="fp-looking-chips">
                  <p className="fp-looking-label">{t("discoverFeed.desiredTraits")}</p>
                  <ChipList items={looking.qualities} />
                </div>
              ) : null}
              {looking?.hobbies?.length ? (
                <div className="fp-looking-chips">
                  <p className="fp-looking-label">{t("discoverFeed.sharedInterests")}</p>
                  <ChipList items={looking.hobbies} />
                </div>
              ) : null}
            </ProfileSection>
          ) : null}

          <ProfileSection title={t("discoverFeed.verification")}>
            <ul className="fp-verify-list">
              <li className={member.verified ? "is-yes" : "is-no"}>
                <CheckCircle2 size={16} aria-hidden />
                {member.verified
                  ? t("trustBadges.verified")
                  : t("discoverFeed.notVerified")}
              </li>
              <li className={member.advisorReviewed ? "is-yes" : "is-no"}>
                <ShieldCheck size={16} aria-hidden />
                {member.advisorReviewed
                  ? t("trustBadges.advisorReviewed")
                  : t("discoverFeed.notAdvisorReviewed")}
              </li>
              {hasBasics ? (
                <li className="is-yes">
                  <ShieldCheck size={16} aria-hidden />
                  {t("discoverFeed.profileCompleteBadge")}
                </li>
              ) : null}
            </ul>
            <p className="muted small fp-privacy-note">
              {t("discoverFeed.privacyNote")}
            </p>
          </ProfileSection>

          {gallery.length > 0 ? (
            <ProfileSection title={t("discoverFeed.photos")}>
              <div className="fp-photo-grid">
                {gallery.map((src, i) => (
                  <button
                    key={`${src}-${i}`}
                    type="button"
                    className="fp-photo-tile"
                    onClick={() => setPhotoIndex(i)}
                    aria-label={`Photo ${i + 1}`}
                  >
                    <img src={src} alt="" loading="lazy" />
                  </button>
                ))}
              </div>
            </ProfileSection>
          ) : null}
        </div>
      )}

      <div className="fp-sticky" role="toolbar" aria-label={t("discoverFeed.actions")}>
        <button
          type="button"
          className="btn btn-primary fp-action-message"
          disabled={busy || offline || !userId}
          onClick={() => void message()}
        >
          <MessageCircle size={16} aria-hidden /> {t("dashboard.message")}
        </button>
        <button
          type="button"
          className={cn("btn btn-secondary fp-action-icon", liked && "is-liked")}
          aria-label={t("matchesPage.like")}
          aria-pressed={liked}
          disabled={busy || offline || !userId}
          onClick={() => void like()}
        >
          <Heart size={17} fill={liked ? "currentColor" : "none"} />
          <span>{liked ? t("matchesPage.liked") : t("matchesPage.like")}</span>
        </button>
        <button
          type="button"
          className={cn("btn btn-secondary fp-action-icon", saved && "is-saved")}
          aria-label={t("matchesPage.shortlist")}
          aria-pressed={saved}
          disabled={busy || offline || !userId}
          onClick={() => void save()}
        >
          <Bookmark size={17} fill={saved ? "currentColor" : "none"} />
          <span>
            {saved ? t("matchesPage.shortlisted") : t("matchesPage.shortlist")}
          </span>
        </button>
      </div>

      <BottomSheet
        open={menuOpen}
        title={t("discoverFeed.moreActions")}
        onClose={() => setMenuOpen(false)}
      >
        <div className="stack">
          <button
            type="button"
            className="btn btn-secondary btn-block"
            disabled={busy || offline}
            onClick={() => void hide()}
          >
            {t("discoverFeed.hideProfile")}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            disabled={busy || offline}
            onClick={() => void reportOrBlock("report")}
          >
            <ShieldAlert size={16} /> {t("safety.reportUser")}
          </button>
          <button
            type="button"
            className="btn btn-danger btn-block"
            disabled={busy || offline}
            onClick={() => void reportOrBlock("block")}
          >
            <Ban size={16} /> {t("safety.blockUser")}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}

/** @deprecated Prefer named exports above; kept for older imports. */
export const ProfileInformationSection = ProfileSection;
export const ProfilePhotoGallery = ProfileGallery;
