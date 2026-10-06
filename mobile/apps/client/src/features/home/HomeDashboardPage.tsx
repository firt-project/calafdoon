import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Heart,
  Handshake,
  MapPin,
  MessageCircle,
  Sparkles,
  Users,
} from "lucide-react";
import { matching, profile as profileApi, ApiClientError } from "@hel/api-client";
import { useSession } from "@/features/auth/SessionProvider";
import { useTranslation } from "@/lib/i18n/context";
import { SkeletonCard } from "@/ui/mobile-kit";
import { Avatar, ScreenContainer } from "@/ui/design-system";
import { userFacingError } from "@/platform/errors";
import {
  memberId,
  type DiscoverMember,
} from "@/features/discover/types";
import { hapticError, hapticMedium, hapticSuccess } from "@/platform/haptics";
import { useRealtimeRefresh } from "@/platform/useRealtimeRefresh";

type HomeFeed = {
  dayKey?: string;
  discoverCount?: number;
  newMembersCount?: number;
  newMutualCount?: number;
  pendingChatCount?: number;
  likedYouCount?: number;
  likedYouLocked?: boolean;
  isPremium?: boolean;
  dailyMatch?: DiscoverMember | null;
  recentlyActive?: Array<{
    userId?: string;
    name?: string;
    imageUrl?: string | null;
    activeNow?: boolean;
    city?: string;
    age?: number | null;
  }>;
  nearYou?: DiscoverMember[];
  recentMutuals?: Array<{
    matchId?: string;
    conversationId?: string | null;
    score?: number;
    isNew?: boolean;
    name?: string;
    imageUrl?: string | null;
    userId?: string;
  }>;
};

type CardLabels = {
  viewProfile: string;
  message: string;
  like: string;
  more: string;
  verified: string;
  locationPrivate: string;
};

function scoreOf(m: DiscoverMember): number | null {
  const n = Math.round(Number(m.score ?? m.compatibilityScore));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function Photo({ member }: { member: DiscoverMember }) {
  const src = member.imageUrl || member.photoUrl;
  const name = member.name ?? "Member";
  return src ? (
    <img src={src} alt="" loading="lazy" />
  ) : (
    <span className="hm-photo-fallback" aria-hidden>
      {name.slice(0, 1)}
    </span>
  );
}

/** Daily match: the one big, photo-first card on the page. */
function HeroMatch({
  member,
  liked,
  busy,
  labels,
  onOpen,
  onMessage,
  onLike,
}: {
  member: DiscoverMember;
  liked: boolean;
  busy: boolean;
  labels: CardLabels;
  onOpen: (m: DiscoverMember) => void;
  onMessage: (m: DiscoverMember) => void;
  onLike: (m: DiscoverMember) => void;
}) {
  const id = memberId(member);
  const score = scoreOf(member);
  const place = [member.city, member.country].filter(Boolean).join(", ");
  return (
    <article className="hm-hero" data-member-id={id || undefined}>
      <button
        type="button"
        className="hm-hero-photo"
        onClick={() => onOpen(member)}
        aria-label={labels.viewProfile}
      >
        <Photo member={member} />
        {score != null && <span className="hm-score">{score}% match</span>}
        {member.online && <span className="hm-online" aria-label="Online" />}
        <span className="hm-hero-info">
          <span className="hm-hero-name">
            {member.name ?? "Member"}
            {member.age != null ? `, ${member.age}` : ""}
          </span>
          <span className="hm-hero-meta">
            <MapPin size={13} aria-hidden /> {place || labels.locationPrivate}
            {member.occupation ? ` · ${member.occupation}` : ""}
          </span>
        </span>
      </button>
      <div className="hm-hero-actions">
        <button
          type="button"
          className="btn btn-primary hm-hero-msg"
          disabled={busy || !id}
          onClick={() => onMessage(member)}
        >
          <MessageCircle size={17} aria-hidden /> {labels.message}
        </button>
        <button
          type="button"
          className={liked ? "hm-icon-btn is-liked" : "hm-icon-btn"}
          aria-label={labels.like}
          aria-pressed={liked}
          disabled={busy || !id}
          onClick={() => onLike(member)}
        >
          <Heart size={20} fill={liked ? "currentColor" : "none"} aria-hidden />
        </button>
      </div>
    </article>
  );
}

/** Photo tile for horizontal rails: full name, never truncated to an initial. */
function MemberTile({
  member,
  onOpen,
}: {
  member: DiscoverMember;
  onOpen: (m: DiscoverMember) => void;
}) {
  const score = scoreOf(member);
  return (
    <button type="button" className="hm-tile" onClick={() => onOpen(member)}>
      <span className="hm-tile-photo">
        <Photo member={member} />
        {score != null && <span className="hm-score hm-score-sm">{score}%</span>}
        {member.online && <span className="hm-online" aria-label="Online" />}
      </span>
      <span className="hm-tile-name">
        {member.name ?? "Member"}
        {member.age != null ? `, ${member.age}` : ""}
      </span>
      <span className="hm-tile-meta">{member.city || member.country || ""}</span>
    </button>
  );
}

export function HomeDashboardPage() {
  const { user, offline } = useSession();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [feed, setFeed] = useState<HomeFeed | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [likedIds, setLikedIds] = useState<Set<string>>(() => new Set());

  const aliveRef = useRef(true);

  const reload = useCallback(
    async (showSpinner: boolean) => {
      if (showSpinner) setLoading(true);
      setError(null);
      try {
        const [home, me] = await Promise.all([
          matching.getHomeFeed() as Promise<HomeFeed>,
          profileApi.getProfile().catch(() => null) as Promise<Record<
            string,
            unknown
          > | null>,
        ]);
        if (!aliveRef.current) return;
        setFeed(home && typeof home === "object" ? home : null);
        const n =
          (typeof me?.name === "string" && me.name) ||
          (typeof user?.email === "string" ? user.email.split("@")[0] : "") ||
          t("dashboard.guestName");
        setName(String(n).split(" ")[0] || t("dashboard.guestName"));
      } catch (e) {
        if (aliveRef.current) {
          setError(e instanceof ApiClientError ? e.message : userFacingError(e));
        }
      } finally {
        if (aliveRef.current) setLoading(false);
      }
    },
    [t, user?.email]
  );

  useEffect(() => {
    aliveRef.current = true;
    void reload(true);
    return () => {
      aliveRef.current = false;
    };
  }, [reload]);

  // New match / like arrives → refresh the daily match + "waiting" counts.
  useRealtimeRefresh(
    ["notification:new", "unread:update", "conversation:updated"],
    () => void reload(false)
  );

  const daily = feed?.dailyMatch ?? null;
  const nearYou = feed?.nearYou ?? [];
  const recent = feed?.recentMutuals ?? [];
  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  function openPeer(member: DiscoverMember | { userId?: string; id?: string }) {
    const id = String(member.userId ?? ("id" in member ? member.id : "") ?? "");
    if (!id) return;
    navigate(`/discover/member/${id}`, {
      state: { member: member as DiscoverMember },
    });
  }

  async function messageMember(member: DiscoverMember) {
    const id = memberId(member);
    if (!id || offline || busyId) return;
    setBusyId(id);
    try {
      const res = await matching.startChat(id);
      await hapticSuccess();
      if (res?.conversationId) navigate(`/messages/${res.conversationId}`);
      else navigate("/messages");
    } catch (e) {
      await hapticError();
      setError(userFacingError(e));
    } finally {
      setBusyId(null);
    }
  }

  async function likeMember(member: DiscoverMember) {
    const id = memberId(member);
    if (!id || offline || busyId) return;
    setBusyId(id);
    try {
      await matching.likeUser(id, "like");
      await hapticMedium();
      setLikedIds((prev) => new Set(prev).add(id));
    } catch (e) {
      await hapticError();
      setError(userFacingError(e));
    } finally {
      setBusyId(null);
    }
  }

  const cardLabels = {
    viewProfile: t("homeFeed.viewProfile"),
    message: t("dashboard.message"),
    like: t("matchesPage.like"),
    more: t("homeFeed.moreActions"),
    verified: t("trustBadges.verified"),
    locationPrivate: t("homeFeed.locationPrivate"),
  };

  const glance = [
    {
      to: "/matches?tab=likedYou",
      icon: <Heart size={15} aria-hidden />,
      value: loading ? "—" : feed?.likedYouCount ?? 0,
      label: t("homeFeed.glanceLikes"),
    },
    {
      to: "/messages",
      icon: <MessageCircle size={15} aria-hidden />,
      value: loading ? "—" : feed?.pendingChatCount ?? 0,
      label: t("homeFeed.glanceMessages"),
    },
    {
      to: "/discover",
      icon: <Users size={15} aria-hidden />,
      value: loading
        ? "—"
        : feed?.newMembersCount ?? feed?.discoverCount ?? 0,
      label: t("homeFeed.glanceNewMembers"),
    },
    {
      to: "/matches",
      icon: <Handshake size={15} aria-hidden />,
      value: loading ? "—" : feed?.newMutualCount ?? 0,
      label: t("homeFeed.glanceMatches"),
    },
  ];

  return (
    <ScreenContainer className="home-flow hm" aria-label={t("app.home")}>
      <header className="hm-greeting">
        <p className="hm-eyebrow">
          {t("dashboard.greetingPeace")} · {todayLabel}
        </p>
        <h1 className="hm-title">{t("dashboard.hello", { name })}</h1>
      </header>

      {offline && (
        <div className="form-notice" role="status">
          You appear offline. Some updates may be out of date.
        </div>
      )}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}

      <nav className="hm-stats" aria-label={t("homeFeed.activityGlance")}>
        {glance.map((item) => (
          <Link key={item.to + item.label} to={item.to} className="hm-stat">
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      {loading && <SkeletonCard />}

      <section className="hm-section" aria-label={t("homeFeed.dailyMatch")}>
        <div className="hm-section-head">
          <h2>{t("homeFeed.dailyMatch")}</h2>
          <span className="hm-tag">{t("homeFeed.today")}</span>
        </div>
        {daily ? (
          <HeroMatch
            member={daily}
            liked={likedIds.has(memberId(daily))}
            busy={busyId === memberId(daily)}
            labels={cardLabels}
            onOpen={openPeer}
            onMessage={(m) => void messageMember(m)}
            onLike={(m) => void likeMember(m)}
          />
        ) : !loading ? (
          <div className="hm-empty">
            <p>{t("homeFeed.noDailyMatch")}</p>
            <Link to="/discover" className="btn btn-secondary">
              <Sparkles size={16} /> {t("homeFeed.browseMatches")}
            </Link>
          </div>
        ) : null}
      </section>

      <section className="hm-section" aria-label={t("homeFeed.peopleNearYou")}>
        <div className="hm-section-head">
          <h2>{t("homeFeed.peopleNearYou")}</h2>
          <Link to="/discover" className="hm-link">
            {t("dashboard.seeAll")}
          </Link>
        </div>
        {nearYou.length > 0 ? (
          <div className="hm-tiles">
            {nearYou.map((p) => (
              <MemberTile key={memberId(p) || p.name} member={p} onOpen={openPeer} />
            ))}
          </div>
        ) : (
          <p className="hm-muted">{t("homeFeed.noNearYou")}</p>
        )}
      </section>

      <section className="hm-section" aria-label={t("homeFeed.newMatches")}>
        <div className="hm-section-head">
          <h2>{t("homeFeed.newMatches")}</h2>
          <Link to="/matches" className="hm-link">
            {t("dashboard.seeAll")}
          </Link>
        </div>
        {recent.length > 0 ? (
          <div className="hm-matches">
            {recent.map((m) => (
              <button
                key={m.matchId ?? m.name}
                type="button"
                className={m.isNew ? "hm-match is-new" : "hm-match"}
                onClick={() =>
                  m.conversationId
                    ? navigate(`/messages/${m.conversationId}`)
                    : navigate("/matches")
                }
              >
                <Avatar src={m.imageUrl} name={m.name} size="lg" />
                <span className="hm-match-name">{m.name ?? "Match"}</span>
                <span className="hm-match-sub">
                  {m.isNew ? t("homeFeed.newBadge") : t("homeFeed.openChat")}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="hm-muted">{t("dashboard.noMatchesDesc")}</p>
        )}
      </section>

    </ScreenContainer>
  );
}
