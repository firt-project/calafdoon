import { useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MapPin, Shield, X } from "lucide-react";
import { chat, matching, ApiClientError } from "@hel/api-client";
import { useTranslation } from "@/lib/i18n/context";
import { userFacingError } from "@/platform/errors";

export type PeerProfileData = {
  name?: string | null;
  age?: number | string | null;
  gender?: string | null;
  city?: string | null;
  country?: string | null;
  height?: number | null;
  education?: string | null;
  occupation?: string | null;
  religiousLevel?: string | null;
  prayerFrequency?: string | null;
  bio?: string | null;
  maritalStatus?: string | null;
  marriageTimeline?: string | null;
  wantChildren?: string | null;
  languagesSpoken?: string[];
  qualities?: string[];
  hobbies?: string[];
  interests?: string[];
  imageUrl?: string | null;
  photoUrl?: string | null;
  additionalImageUrls?: string[];
  photoHidden?: boolean;
  verified?: boolean | null;
  hasPaid?: boolean | null;
  hasPersonalSupport?: boolean | null;
  questionnaireComplete?: boolean | null;
  approved?: boolean | null;
  reviewStatus?: string | null;
  score?: number | null;
  compatibilityScore?: number | null;
  userId?: string;
};

function Field({ label, value }: { label: string; value?: unknown }) {
  if (value == null || value === "") return null;
  const text = Array.isArray(value)
    ? value.filter(Boolean).join(", ")
    : String(value);
  if (!text.trim()) return null;
  return (
    <div className="peer-field">
      <dt>{label}</dt>
      <dd>{text}</dd>
    </div>
  );
}

function mergeProfile(
  base: PeerProfileData | null | undefined,
  next: PeerProfileData | null | undefined
): PeerProfileData {
  const a = base ?? {};
  const b = next ?? {};
  const pick = <K extends keyof PeerProfileData>(key: K): PeerProfileData[K] => {
    const bv = b[key];
    const av = a[key];
    if (Array.isArray(bv) && bv.length > 0) return bv;
    if (bv != null && bv !== "") return bv;
    return av;
  };
  return {
    name: pick("name"),
    age: pick("age"),
    gender: pick("gender"),
    city: pick("city"),
    country: pick("country"),
    height: pick("height"),
    education: pick("education"),
    occupation: pick("occupation"),
    religiousLevel: pick("religiousLevel"),
    prayerFrequency: pick("prayerFrequency"),
    bio: pick("bio"),
    maritalStatus: pick("maritalStatus"),
    marriageTimeline: pick("marriageTimeline"),
    wantChildren: pick("wantChildren"),
    languagesSpoken: pick("languagesSpoken"),
    qualities: pick("qualities"),
    hobbies: pick("hobbies") ?? pick("interests"),
    imageUrl: pick("imageUrl") ?? pick("photoUrl"),
    additionalImageUrls: pick("additionalImageUrls"),
    photoHidden: pick("photoHidden"),
    verified: pick("verified"),
    hasPaid: pick("hasPaid"),
    hasPersonalSupport: pick("hasPersonalSupport"),
    questionnaireComplete: pick("questionnaireComplete"),
    approved: pick("approved"),
    reviewStatus: pick("reviewStatus"),
    score: pick("score") ?? pick("compatibilityScore"),
    userId: pick("userId"),
  };
}

function hasLimitedDetails(p: PeerProfileData): boolean {
  const lists = [p.languagesSpoken, p.qualities, p.hobbies].filter(
    (arr) => (arr?.length ?? 0) > 0
  );
  const facts = [
    p.bio,
    p.education,
    p.occupation,
    p.religiousLevel,
    p.prayerFrequency,
    p.maritalStatus,
    p.marriageTimeline,
    p.wantChildren,
    p.height,
    p.city,
    p.country,
    p.gender,
  ].filter((v) => v != null && String(v).trim() !== "");
  return facts.length + lists.length < 2;
}

function asProfile(raw: unknown): PeerProfileData | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.profile && typeof o.profile === "object") {
    const nested = o.profile as PeerProfileData;
    return mergeProfile(nested, {
      score: typeof o.score === "number" ? o.score : nested.score,
      userId:
        typeof o.userId === "string"
          ? o.userId
          : (nested as { userId?: string }).userId,
    });
  }
  return o as PeerProfileData;
}

async function loadDiscoverProfile(
  userId: string,
  seed?: PeerProfileData | null
): Promise<PeerProfileData> {
  let profile = mergeProfile(null, seed);
  if (!userId) return profile;
  try {
    const card = await matching.getPeerCard(userId);
    profile = mergeProfile(profile, asProfile(card));
  } catch (e) {
    if (!(e instanceof ApiClientError && (e.status === 404 || e.status === 403))) {
      // Keep seed if enrichment fails for any non-auth reason on older deploys
      if (!(e instanceof ApiClientError)) throw e;
    }
  }
  try {
    const br = (await matching.getCompatibilityBreakdown(userId)) as {
      storedScore?: number | null;
      total?: number | null;
    } | null;
    if (br && profile.score == null) {
      profile = mergeProfile(profile, {
        score: br.storedScore ?? br.total ?? null,
      });
    }
  } catch {
    /* optional */
  }
  return profile;
}

async function loadChatProfile(
  conversationId: string,
  seed?: PeerProfileData | null,
  fallbackUserId?: string | null
): Promise<PeerProfileData> {
  let profile = mergeProfile(null, seed);
  let userId = fallbackUserId ?? profile.userId ?? null;

  try {
    const partner = await chat.getPartner(conversationId);
    profile = mergeProfile(profile, asProfile(partner));
    if (profile.userId) userId = profile.userId;
    return profile;
  } catch (e) {
    if (!(e instanceof ApiClientError && (e.status === 404 || e.status === 403))) {
      // keep trying fallbacks for missing route / gate
      if (!(e instanceof ApiClientError && e.status >= 500)) {
        /* continue */
      }
    }
  }

  try {
    const conv = (await chat.getConversation(conversationId)) as {
      profile?: PeerProfileData | null;
      score?: number | null;
      userId?: string;
    } | null;
    if (conv?.profile) {
      profile = mergeProfile(profile, {
        ...conv.profile,
        score: conv.score ?? conv.profile.score,
        userId: conv.profile.userId ?? userId ?? undefined,
      });
      userId = profile.userId ?? userId;
    }
  } catch {
    /* optional */
  }

  if (userId) {
    try {
      const card = await matching.getPeerCard(userId);
      profile = mergeProfile(profile, asProfile(card));
    } catch {
      /* route may not exist on older deploys */
    }
    try {
      const mutuals = (await matching.getMyMatches("active")) as Array<{
        profile?: PeerProfileData | null;
        score?: number | null;
      }>;
      const hit = mutuals.find(
        (m) => String(m.profile?.userId ?? "") === String(userId)
      );
      if (hit?.profile) {
        profile = mergeProfile(profile, {
          ...hit.profile,
          score: hit.score ?? hit.profile.score,
        });
      }
    } catch {
      /* optional */
    }
    try {
      const br = (await matching.getCompatibilityBreakdown(userId)) as {
        storedScore?: number | null;
        total?: number | null;
      } | null;
      if (br && profile.score == null) {
        profile = mergeProfile(profile, {
          score: br.storedScore ?? br.total ?? null,
        });
      }
    } catch {
      /* optional */
    }
  }

  if (!profile.name && !profile.imageUrl && !seed?.name) {
    throw new ApiClientError({
      status: 404,
      message: "Profile unavailable",
    });
  }
  return profile;
}

export function PeerProfileSheet({
  open,
  onClose,
  title = "Profile",
  seed,
  source,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  seed?: PeerProfileData | null;
  source:
    | { type: "discover"; userId: string }
    | { type: "chat"; conversationId: string; userId?: string | null };
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const [profile, setProfile] = useState<PeerProfileData | null>(seed ?? null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Extracted so the effect dep array stays statically checkable.
  const peerKey =
    source.type === "discover" ? source.userId : source.conversationId;
  const chatUserId = source.type === "chat" ? source.userId : null;

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setError(null);
    setProfile(seed ?? null);

    const run =
      source.type === "discover"
        ? loadDiscoverProfile(source.userId, seed)
        : loadChatProfile(source.conversationId, seed, source.userId);

    run
      .then((p) => {
        if (!alive) return;
        setProfile(p);
      })
      .catch((e) => {
        if (!alive) return;
        if (seed && (seed.name || seed.imageUrl || seed.bio)) {
          setProfile(mergeProfile(null, seed));
          setError(null);
        } else if (
          e instanceof ApiClientError &&
          (e.status === 403 || e.status === 404)
        ) {
          setError("This profile is private or unavailable.");
        } else {
          setError(userFacingError(e));
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
    // seed is captured at open; avoid refetch loops from new object identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, source.type, peerKey, chatUserId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const location = [profile?.city, profile?.country].filter(Boolean).join(", ");
  const gallery = [
    profile?.imageUrl || profile?.photoUrl,
    ...(profile?.additionalImageUrls ?? []),
  ].filter((u): u is string => Boolean(u));
  const score = profile?.score ?? profile?.compatibilityScore;
  const limited = profile ? hasLimitedDetails(profile) : false;
  const hobbies = profile?.hobbies?.length
    ? profile.hobbies
    : profile?.interests;

  return createPortal(
    <div
      className="partner-sheet-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="partner-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="partner-sheet-handle" aria-hidden />
        <header className="partner-sheet-header">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>

        <div className="partner-sheet-body">
          {loading && !profile?.name && (
            <div className="partner-sheet-loading" role="status">
              <div className="partner-sheet-skel" />
              <div
                className="partner-sheet-skel"
                style={{
                  aspectRatio: "auto",
                  height: "1.15rem",
                  maxHeight: "none",
                  width: "55%",
                }}
              />
              <p className="muted small">Loading profile…</p>
            </div>
          )}

          {error && !profile && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          {profile && (
            <>
              {loading ? (
                <p className="muted small" style={{ margin: 0 }}>
                  Updating profile…
                </p>
              ) : null}

              <div className="peer-hero">
                {gallery[0] ? (
                  <img
                    src={gallery[0]}
                    alt={profile.name ? `Photo of ${profile.name}` : "Profile photo"}
                    className="peer-hero-photo"
                  />
                ) : (
                  <div className="peer-hero-fallback" aria-hidden>
                    {(profile.name ?? "?").slice(0, 1)}
                  </div>
                )}
                <div className="peer-hero-meta">
                  <h3>
                    {profile.name ?? "Member"}
                    {profile.age != null ? `, ${profile.age}` : ""}
                  </h3>
                  {location ? (
                    <p className="muted">
                      <MapPin size={14} style={{ verticalAlign: "middle" }} />{" "}
                      {location}
                    </p>
                  ) : null}
                  {score != null ? (
                    <span className="compat-badge">
                      {Math.round(Number(score))}%
                    </span>
                  ) : null}
                </div>
              </div>

              {gallery.length > 1 ? (
                <div className="peer-gallery" aria-label="More photos">
                  {gallery.slice(1).map((url) => (
                    <img key={url} src={url} alt="" loading="lazy" />
                  ))}
                </div>
              ) : null}

              <div className="peer-badges">
                {profile.verified ? (
                  <span className="admin-pill ok">
                    {t("trustBadges.verified")}
                  </span>
                ) : null}
                {profile.reviewStatus === "approved" || profile.approved ? (
                  <span className="admin-pill ok">
                    {t("trustBadges.approved")}
                  </span>
                ) : profile.reviewStatus === "pending_review" ? (
                  <span className="admin-pill warn">
                    {t("trustBadges.pendingReview")}
                  </span>
                ) : null}
                {profile.hasPersonalSupport ? (
                  <span className="admin-pill">{t("trustBadges.premium")}</span>
                ) : profile.hasPaid ? (
                  <span className="admin-pill ok">
                    {t("trustBadges.paidMember")}
                  </span>
                ) : null}
                {profile.questionnaireComplete ? (
                  <span className="admin-pill">
                    {t("trustBadges.profileComplete")}
                  </span>
                ) : null}
                {profile.photoHidden ? (
                  <span className="admin-pill warn">Photo private</span>
                ) : null}
              </div>

              <p className="peer-privacy muted small">
                <Shield size={14} style={{ verticalAlign: "middle" }} /> Contact
                details stay private. Email and phone are never shared here.
              </p>

              {limited ? (
                <p className="peer-limited muted">
                  This member has shared limited profile details.
                </p>
              ) : null}

              {profile.bio ? (
                <section className="peer-section">
                  <h3>About</h3>
                  <p>{profile.bio}</p>
                </section>
              ) : null}

              <section className="peer-section">
                <h3>Details</h3>
                <dl className="peer-grid">
                  <Field label="Gender" value={profile.gender} />
                  <Field label="Religion" value={profile.religiousLevel} />
                  <Field label="Prayer" value={profile.prayerFrequency} />
                  <Field label="Education" value={profile.education} />
                  <Field label="Work" value={profile.occupation} />
                  <Field
                    label="Height"
                    value={profile.height ? `${profile.height} cm` : undefined}
                  />
                  <Field label="Marital status" value={profile.maritalStatus} />
                  <Field
                    label="Marriage timeline"
                    value={profile.marriageTimeline}
                  />
                  <Field label="Children" value={profile.wantChildren} />
                </dl>
              </section>

              {(profile.languagesSpoken?.length ||
                profile.qualities?.length ||
                hobbies?.length) && (
                <section className="peer-section">
                  <h3>More about them</h3>
                  <dl className="peer-grid">
                    <Field label="Languages" value={profile.languagesSpoken} />
                    <Field label="Qualities" value={profile.qualities} />
                    <Field label="Hobbies" value={hobbies} />
                  </dl>
                </section>
              )}

              {footer}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
