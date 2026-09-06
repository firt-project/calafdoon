import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Bookmark,
  Heart,
  HeartOff,
  Sparkles,
  Users,
} from "lucide-react";
import { matching, ApiClientError } from "@hel/api-client";
import { useSession } from "@/features/auth/SessionProvider";
import { useTranslation } from "@/lib/i18n/context";
import { EmptyState, SkeletonCard } from "@/ui/mobile-kit";
import { hapticError, hapticSuccess } from "@/platform/haptics";
import { userFacingError } from "@/platform/errors";
import { useRealtimeRefresh } from "@/platform/useRealtimeRefresh";
import {
  CompatBadge,
  FilterChip,
  PageTitle,
  ScreenContainer,
  SearchField,
} from "@/ui/design-system";
import { CompactMemberCard } from "@/features/discover/CompactMemberCard";
import {
  memberId,
  type DiscoverMember,
} from "@/features/discover/types";

type ListTab = "mutual" | "liked" | "likedYou" | "shortlist" | "passed";

type PersonCard = {
  userId?: string;
  id?: string;
  name?: string | null;
  age?: number | null;
  city?: string | null;
  country?: string | null;
  score?: number | null;
  imageUrl?: string | null;
  photoUrl?: string | null;
  bio?: string | null;
  online?: boolean;
};

type MatchRow = {
  matchId?: string;
  conversationId?: string | null;
  score?: number;
  isNew?: boolean;
  hasMessages?: boolean;
  lastMessage?: string | null;
  matchedAt?: string | null;
  online?: boolean;
  profile?: {
    name?: string | null;
    userId?: string;
    imageUrl?: string | null;
    age?: number | null;
    city?: string | null;
    country?: string | null;
    online?: boolean;
  } | null;
  name?: string;
  id?: string;
};

type ListsPayload = {
  liked?: PersonCard[];
  likedYou?: PersonCard[];
  shortlist?: PersonCard[];
  passed?: PersonCard[];
};

const TABS: { id: ListTab; labelKey: string }[] = [
  { id: "mutual", labelKey: "Mutual" },
  { id: "liked", labelKey: "Liked" },
  { id: "likedYou", labelKey: "Liked you" },
  { id: "shortlist", labelKey: "Saved" },
  { id: "passed", labelKey: "Passed" },
];

function personToMember(p: PersonCard): DiscoverMember {
  return {
    userId: p.userId ?? p.id,
    id: p.id,
    name: p.name ?? undefined,
    age: p.age ?? undefined,
    city: p.city ?? undefined,
    country: p.country ?? undefined,
    score: p.score ?? undefined,
    imageUrl: p.imageUrl ?? undefined,
    photoUrl: p.photoUrl ?? undefined,
    bio: p.bio ?? undefined,
    online: p.online,
  };
}

function matchToMember(m: MatchRow): DiscoverMember {
  return {
    userId: m.profile?.userId,
    name: m.profile?.name ?? m.name ?? undefined,
    age: m.profile?.age ?? undefined,
    city: m.profile?.city ?? undefined,
    country: m.profile?.country ?? undefined,
    score: m.score,
    imageUrl: m.profile?.imageUrl ?? undefined,
    online: m.online ?? m.profile?.online,
  };
}

export function MatchesPage() {
  const { t } = useTranslation();
  const { offline } = useSession();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("tab") as ListTab | null;
  const tab: ListTab =
    tabParam && TABS.some((x) => x.id === tabParam) ? tabParam : "mutual";

  const [mutuals, setMutuals] = useState<MatchRow[]>([]);
  const [lists, setLists] = useState<ListsPayload>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const [mutualData, listData] = await Promise.all([
        matching.getMyMatches("active"),
        matching.getMatchLists({}),
      ]);
      setMutuals(Array.isArray(mutualData) ? (mutualData as MatchRow[]) : []);
      setLists(
        listData && typeof listData === "object"
          ? (listData as ListsPayload)
          : {}
      );
    } catch (e) {
      setError(
        e instanceof ApiClientError ? e.message : "Failed to load your lists"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Someone likes back / a new match forms → silently refresh the lists.
  useRealtimeRefresh(
    ["notification:new", "unread:update"],
    () => void load(false)
  );

  const counts = useMemo(
    () => ({
      mutual: mutuals.length,
      liked: lists.liked?.length ?? 0,
      likedYou: lists.likedYou?.length ?? 0,
      shortlist: lists.shortlist?.length ?? 0,
      passed: lists.passed?.length ?? 0,
    }),
    [mutuals, lists]
  );

  const fresh = useMemo(() => {
    return mutuals.filter((m) => m.isNew || !m.hasMessages);
  }, [mutuals]);

  function setTab(next: ListTab) {
    setMessage(null);
    setParams(next === "mutual" ? {} : { tab: next });
  }

  function openProfile(member: DiscoverMember) {
    const id = memberId(member);
    if (!id) return;
    navigate(`/discover/member/${id}`, { state: { member } });
  }

  async function actOnPerson(
    userId: string,
    action: "like" | "pass" | "shortlist"
  ) {
    if (!userId || busyId || offline) return;
    setBusyId(userId);
    setError(null);
    setMessage(null);
    try {
      const res = (await matching.likeUser(userId, action)) as {
        matched?: boolean;
        mutual?: boolean;
        conversationId?: string;
      };
      await hapticSuccess();
      if (action === "like" && res?.conversationId) {
        if (res.mutual) {
          setMessage(t("matchesPage.matchedToast"));
        } else {
          setMessage("Chat opened");
        }
        navigate(`/messages/${res.conversationId}`);
        return;
      }
      if (res?.matched && res.mutual) {
        setMessage(t("matchesPage.matchedToast"));
      } else if (action === "like") {
        setMessage(t("matchesPage.likedToast"));
      } else if (action === "pass") {
        setMessage(t("matchesPage.passedToast"));
      } else {
        setMessage(t("matchesPage.shortlistedToast"));
      }
      await load();
    } catch (e) {
      await hapticError();
      setError(userFacingError(e));
    } finally {
      setBusyId(null);
    }
  }

  async function messagePerson(member: DiscoverMember) {
    const userId = memberId(member);
    if (!userId || busyId || offline) return;

    const mutual = mutuals.find((m) => m.profile?.userId === userId);
    if (mutual?.conversationId) {
      navigate(`/messages/${mutual.conversationId}`);
      return;
    }

    setBusyId(userId);
    setError(null);
    setMessage(null);
    try {
      const res = await matching.startChat(userId);
      await hapticSuccess();
      if (res?.conversationId) {
        navigate(`/messages/${res.conversationId}`);
        return;
      }
      setMessage("Chat opened — see Messages");
      await load();
    } catch (e) {
      await hapticError();
      setError(userFacingError(e));
    } finally {
      setBusyId(null);
    }
  }

  const cardLabels = {
    viewProfile: t("matchesPage.view"),
    message: t("dashboard.message"),
    like: t("matchesPage.like"),
    more: t("discoverFeed.moreActions"),
    verified: t("trustBadges.verified"),
    locationPrivate: t("discoverFeed.locationPrivate"),
  };

  const emptyForTab = () => {
    switch (tab) {
      case "liked":
        return {
          icon: <Heart size={22} />,
          title: t("matchesPage.noLikedTitle"),
          body: t("matchesPage.noLikedDesc"),
          action: (
            <Link to="/discover" className="btn btn-primary">
              {t("homeFeed.browseMatches")}
            </Link>
          ),
        };
      case "likedYou":
        return {
          icon: <Users size={22} />,
          title: t("matchesPage.noLikedYouTitle"),
          body: t("matchesPage.noLikedYouDesc"),
          action: (
            <Link to="/discover" className="btn btn-primary">
              {t("homeFeed.browseMatches")}
            </Link>
          ),
        };
      case "shortlist":
        return {
          icon: <Bookmark size={22} />,
          title: t("matchesPage.noShortlistTitle"),
          body: t("matchesPage.noShortlistDesc"),
          action: null,
        };
      case "passed":
        return {
          icon: <HeartOff size={22} />,
          title: t("matchesPage.noPassedTitle"),
          body: t("matchesPage.noPassedDesc"),
          action: null,
        };
      default:
        return {
          icon: <Sparkles size={22} />,
          title: t("matchesPage.noMatchesTitle"),
          body: t("matchesPage.noMatchesDesc"),
          action: (
            <Link to="/discover" className="btn btn-primary">
              Discover people
            </Link>
          ),
        };
    }
  };

  const listPeople =
    tab === "liked"
      ? lists.liked ?? []
      : tab === "likedYou"
        ? lists.likedYou ?? []
        : tab === "shortlist"
          ? lists.shortlist ?? []
          : tab === "passed"
            ? lists.passed ?? []
            : [];

  const q = query.trim().toLowerCase();
  const filteredPeople = q
    ? listPeople.filter((p) =>
        `${p.name ?? ""} ${p.city ?? ""} ${p.country ?? ""}`
          .toLowerCase()
          .includes(q)
      )
    : listPeople;
  const filteredMutuals = q
    ? mutuals.filter((m) =>
        `${m.profile?.name ?? m.name ?? ""} ${m.profile?.city ?? ""}`
          .toLowerCase()
          .includes(q)
      )
    : mutuals;

  const filteredFresh = useMemo(() => {
    const list = fresh.filter((m) =>
      q
        ? `${m.profile?.name ?? m.name ?? ""}`.toLowerCase().includes(q)
        : true
    );
    return list;
  }, [fresh, q]);

  const listRows = useMemo(() => {
    return filteredMutuals;
  }, [filteredMutuals]);

  const empty = emptyForTab();
  const showEmpty =
    !loading &&
    ((tab === "mutual" && filteredMutuals.length === 0) ||
      (tab !== "mutual" && filteredPeople.length === 0));

  function renderMemberRows(
    members: DiscoverMember[],
    opts?: { like?: boolean }
  ) {
    return (
      <div className="matches-list">
        {members.map((member) => {
          const id = memberId(member);
          return (
            <CompactMemberCard
              key={id || member.name}
              variant="row"
              member={member}
              online={member.online}
              busy={busyId === id}
              showSecondaryActions={Boolean(opts?.like)}
              labels={cardLabels}
              onOpen={openProfile}
              onMessage={(m) => void messagePerson(m)}
              onLike={
                opts?.like
                  ? (m) => {
                      const mid = memberId(m);
                      if (mid) void actOnPerson(mid, "like");
                    }
                  : undefined
              }
            />
          );
        })}
      </div>
    );
  }

  return (
    <ScreenContainer className="matches-page" aria-label={t("app.matches")}>
      <PageTitle title={t("app.matches")} eyebrow={t("matchesPage.yourLists")} />

      <SearchField
        value={query}
        onChange={setQuery}
        placeholder={t("matchesPage.searchPlaceholder")}
        aria-label={t("matchesPage.searchPlaceholder")}
      />

      <div className="chip-row matches-tabs" role="tablist" aria-label="Match lists">
        {TABS.map((item) => (
          <FilterChip
            key={item.id}
            active={tab === item.id}
            count={counts[item.id]}
            onClick={() => setTab(item.id)}
          >
            {item.labelKey}
          </FilterChip>
        ))}
      </div>

      {message && (
        <div className="form-success" role="status">
          {message}
        </div>
      )}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {loading && <SkeletonCard />}

      {showEmpty && (
        <EmptyState
          icon={empty.icon}
          title={empty.title}
          body={empty.body}
          action={empty.action ?? undefined}
        />
      )}

      {!loading && tab === "mutual" && filteredMutuals.length > 0 && (
        <>
          {filteredFresh.length > 0 && (
            <section className="match-stories" aria-label="New matches">
              <h2 className="match-stories-title">{t("matchesPage.newMatches")}</h2>
              <div className="match-stories-row">
                {filteredFresh.map((m, i) => {
                  const member = matchToMember(m);
                  const name = member.name ?? "Match";
                  const key = m.matchId ?? m.id ?? String(i);
                  const photo = member.imageUrl ?? null;
                  const id = memberId(member);
                  return (
                    <button
                      key={key}
                      type="button"
                      className="match-story"
                      disabled={!id}
                      onClick={() => openProfile(member)}
                    >
                      <span className="match-story-avatar">
                        {photo ? (
                          <img src={photo} alt="" loading="lazy" />
                        ) : (
                          <span aria-hidden>{name.slice(0, 1)}</span>
                        )}
                      </span>
                      <span className="match-story-name">{name}</span>
                      <CompatBadge score={m.score} className="match-story-score" />
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {listRows.length > 0 &&
            renderMemberRows(listRows.map(matchToMember))}
        </>
      )}

      {!loading && tab === "liked" && filteredPeople.length > 0 &&
        renderMemberRows(filteredPeople.map(personToMember))}

      {!loading && tab === "likedYou" && filteredPeople.length > 0 &&
        renderMemberRows(filteredPeople.map(personToMember), { like: true })}

      {!loading && tab === "shortlist" && filteredPeople.length > 0 &&
        renderMemberRows(filteredPeople.map(personToMember), { like: true })}

      {!loading && tab === "passed" && filteredPeople.length > 0 &&
        renderMemberRows(filteredPeople.map(personToMember), { like: true })}
    </ScreenContainer>
  );
}
