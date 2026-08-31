import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Heart,
  Handshake,
  MessageCircle,
  Sparkles,
  Users,
} from "lucide-react";
import { matching, profile as profileApi, ApiClientError } from "@hel/api-client";
import { useSession } from "@/features/auth/SessionProvider";
import { useTranslation } from "@/lib/i18n/context";
import { BottomSheet, SkeletonCard } from "@/ui/mobile-kit";
import {
  Avatar,
  PageTitle,
  ScreenContainer,
  SectionHeader,
  SurfaceCard,
} from "@/ui/design-system";
import { userFacingError } from "@/platform/errors";
import { CompactMemberCard } from "@/features/discover/CompactMemberCard";
import {
  memberId,
  type DiscoverMember,
} from "@/features/discover/types";
import { hapticError, hapticMedium, hapticSuccess } from "@/platform/haptics";

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
  const [menuFor, setMenuFor] = useState<DiscoverMember | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [home, me] = await Promise.all([
          matching.getHomeFeed() as Promise<HomeFeed>,
          profileApi.getProfile().catch(() => null) as Promise<Record<
            string,
            unknown
          > | null>,
        ]);
        if (cancelled) return;
        setFeed(home && typeof home === "object" ? home : null);
        const n =
          (typeof me?.name === "string" && me.name) ||
          (typeof user?.email === "string" ? user.email.split("@")[0] : "") ||
          t("dashboard.guestName");
        setName(String(n).split(" ")[0] || t("dashboard.guestName"));
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof ApiClientError ? e.message : userFacingError(e)
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t, user?.email]);

  const daily = feed?.dailyMatch ?? null;
  const recentlyActive = feed?.recentlyActive ?? [];
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
    <ScreenContainer className="home-flow" aria-label={t("app.home")}>
      <section className="home-greeting" aria-label="Greeting">
        <PageTitle
          eyebrow={`${t("dashboard.greetingPeace")} · ${todayLabel}`}
          title={t("dashboard.hello", { name })}
        >
          <p className="lead">{t("homeFeed.subtitle")}</p>
        </PageTitle>
      </section>

      {offline && (
        <div className="form-error" role="status">
          You appear offline. Some updates may be out of date.
        </div>
      )}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {loading && <SkeletonCard />}

      <section className="home-section" aria-label={t("homeFeed.dailyMatch")}>
        <SectionHeader
          title={t("homeFeed.dailyMatch")}
          subtitle={t("homeFeed.dailyMatchDesc")}
          action={<span className="chip chip-today">{t("homeFeed.today")}</span>}
        />
        {daily ? (
          <CompactMemberCard
            member={daily}
            liked={likedIds.has(memberId(daily))}
            busy={busyId === memberId(daily)}
            labels={cardLabels}
            onOpen={openPeer}
            onMessage={(m) => void messageMember(m)}
            onLike={(m) => void likeMember(m)}
            onMore={setMenuFor}
          />
        ) : !loading ? (
          <SurfaceCard>
            <p className="muted" style={{ margin: 0 }}>
              {t("homeFeed.noDailyMatch")}
            </p>
            <Link
              to="/discover"
              className="btn btn-secondary"
              style={{ marginTop: "0.75rem" }}
            >
              <Sparkles size={16} /> {t("homeFeed.browseMatches")}
            </Link>
          </SurfaceCard>
        ) : null}
      </section>

      <SurfaceCard
        className="home-section-card"
        aria-label={t("homeFeed.recentlyActive")}
      >
        <SectionHeader
          title={t("homeFeed.recentlyActive")}
          action={
            <Link to="/discover" className="btn btn-ghost">
              {t("dashboard.seeAll")}
            </Link>
          }
        />
        {recentlyActive.length > 0 ? (
          <div className="person-rail home-active-rail">
            {recentlyActive.map((m) => (
              <button
                key={m.userId ?? m.name}
                type="button"
                className="person-rail-item home-active-item"
                onClick={() =>
                  m.userId
                    ? openPeer({
                        userId: m.userId,
                        name: m.name,
                        imageUrl: m.imageUrl ?? undefined,
                        city: m.city,
                        age: m.age ?? undefined,
                      })
                    : navigate("/discover")
                }
              >
                <Avatar
                  src={m.imageUrl}
                  name={m.name}
                  size="lg"
                  online={Boolean(m.activeNow)}
                />
                <span>{m.name ?? "Member"}</span>
                <em
                  className={
                    m.activeNow
                      ? "home-active-status"
                      : "home-active-status is-muted"
                  }
                >
                  {m.activeNow
                    ? t("homeFeed.activeNow")
                    : t("homeFeed.recently")}
                </em>
              </button>
            ))}
          </div>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            {t("homeFeed.noRecentlyActive")}
          </p>
        )}
      </SurfaceCard>

      <SurfaceCard
        className="home-section-card"
        aria-label={t("homeFeed.peopleNearYou")}
      >
        <SectionHeader
          title={t("homeFeed.peopleNearYou")}
          action={
            <Link to="/discover" className="btn btn-ghost">
              {t("dashboard.seeAll")}
            </Link>
          }
        />
        {nearYou.length > 0 ? (
          <div className="home-near-grid">
            {nearYou.map((p) => {
              const id = memberId(p);
              return (
                <CompactMemberCard
                  key={id || p.name}
                  member={p}
                  variant="row"
                  showSecondaryActions={false}
                  busy={busyId === id}
                  labels={cardLabels}
                  onOpen={openPeer}
                  onMessage={(m) => void messageMember(m)}
                />
              );
            })}
          </div>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            {t("homeFeed.noNearYou")}
          </p>
        )}
      </SurfaceCard>

      <SurfaceCard
        className="home-section-card"
        aria-label={t("homeFeed.newMatches")}
      >
        <SectionHeader
          title={t("homeFeed.newMatches")}
          subtitle={
            (feed?.newMutualCount ?? 0) > 0
              ? t("homeFeed.newCount", { count: feed?.newMutualCount ?? 0 })
              : undefined
          }
          action={
            <Link to="/matches" className="btn btn-ghost">
              {t("dashboard.seeAll")}
            </Link>
          }
        />
        {recent.length > 0 ? (
          <div className="person-rail home-match-rail">
            {recent.map((m) => (
              <button
                key={m.matchId ?? m.name}
                type="button"
                className="person-rail-item home-match-item"
                onClick={() =>
                  m.conversationId
                    ? navigate(`/messages/${m.conversationId}`)
                    : navigate("/matches")
                }
              >
                <Avatar src={m.imageUrl} name={m.name} size="lg" />
                <span>{m.name ?? "Match"}</span>
                {m.isNew ? (
                  <em className="home-match-new">{t("homeFeed.newBadge")}</em>
                ) : (
                  <em className="home-match-new is-muted">
                    {t("homeFeed.openChat")}
                  </em>
                )}
              </button>
            ))}
          </div>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            {t("dashboard.noMatchesDesc")}
          </p>
        )}
      </SurfaceCard>

      <SurfaceCard
        className="home-activity-glance"
        aria-label={t("homeFeed.activityGlance")}
      >
        <SectionHeader title={t("homeFeed.activityGlance")} />
        <div className="home-glance-row">
          {glance.map((item) => (
            <Link key={item.to + item.label} to={item.to} className="home-glance-item">
              <span className="home-glance-icon">{item.icon}</span>
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </SurfaceCard>

      <BottomSheet
        open={Boolean(menuFor)}
        title={t("homeFeed.moreActions")}
        onClose={() => setMenuFor(null)}
      >
        <div className="stack">
          <button
            type="button"
            className="btn btn-secondary btn-block"
            onClick={() => {
              if (menuFor) openPeer(menuFor);
              setMenuFor(null);
            }}
          >
            {t("homeFeed.viewProfile")}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={!menuFor || Boolean(busyId)}
            onClick={() => {
              if (menuFor) void messageMember(menuFor);
              setMenuFor(null);
            }}
          >
            <MessageCircle size={16} /> {t("dashboard.message")}
          </button>
        </div>
      </BottomSheet>
    </ScreenContainer>
  );
}
