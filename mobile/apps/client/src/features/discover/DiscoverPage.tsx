import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Ban, ShieldAlert, Sparkles } from "lucide-react";
import { matching, moderation } from "@hel/api-client";
import { useSession } from "@/features/auth/SessionProvider";
import { useTranslation } from "@/lib/i18n/context";
import { BottomSheet, EmptyState, SkeletonCard } from "@/ui/mobile-kit";
import { ScreenContainer } from "@/ui/design-system";
import {
  hapticError,
  hapticMedium,
  hapticSuccess,
} from "@/platform/haptics";
import { userFacingError } from "@/platform/errors";
import { CompactMemberCard } from "@/features/discover/CompactMemberCard";
import {
  DiscoverHeader,
  type FeedFilterId,
} from "@/features/discover/DiscoverHeader";
import {
  memberId,
  type DiscoverMember,
} from "@/features/discover/types";

const LOW_DECK = 8;

export function DiscoverPage() {
  const { offline } = useSession();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [items, setItems] = useState<DiscoverMember[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FeedFilterId>("recommended");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [likedIds, setLikedIds] = useState<Set<string>>(() => new Set());
  const [menuFor, setMenuFor] = useState<DiscoverMember | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const seenIds = useRef(new Set<string>());
  const nextCursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);
  const pullY = useRef<number | null>(null);

  const mergeUnique = useCallback((incoming: DiscoverMember[]) => {
    const nextList: DiscoverMember[] = [];
    for (const item of incoming) {
      const id = memberId(item);
      if (!id || seenIds.current.has(id)) continue;
      seenIds.current.add(id);
      nextList.push(item);
    }
    return nextList;
  }, []);

  const loadMore = useCallback(async () => {
    if (!nextCursorRef.current || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await matching.getMatches({
        cursor: nextCursorRef.current,
        limit: 40,
      });
      nextCursorRef.current = page.nextCursor ?? null;
      const list = Array.isArray(page.items) ? (page.items as DiscoverMember[]) : [];
      if (list.length > 0) setItems((prev) => [...prev, ...mergeUnique(list)]);
    } catch {
      /* keep feed */
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [mergeUnique]);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        seenIds.current.clear();
        nextCursorRef.current = null;
        const page = await matching.getMatches({ limit: 40 });
        nextCursorRef.current = page.nextCursor ?? null;
        const list = Array.isArray(page.items) ? (page.items as DiscoverMember[]) : [];
        setItems(mergeUnique(list));
      } catch (e) {
        setError(userFacingError(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [mergeUnique]
  );

  useEffect(() => {
    void load("initial");
  }, [load]);

  useEffect(() => {
    if (items.length > 0 && items.length < LOW_DECK && nextCursorRef.current) {
      void loadMore();
    }
  }, [items.length, loadMore]);

  function removeLocal(id: string) {
    setItems((prev) => prev.filter((m) => memberId(m) !== id));
    if (items.length < LOW_DECK + 2 && nextCursorRef.current) void loadMore();
  }

  function openProfile(member: DiscoverMember) {
    const id = memberId(member);
    if (!id) return;
    navigate(`/discover/member/${id}`, { state: { member } });
  }

  async function message(member: DiscoverMember) {
    const id = memberId(member);
    if (!id || busyId || offline) return;
    setBusyId(id);
    setToast(null);
    setError(null);
    try {
      const res = await matching.startChat(id);
      await hapticSuccess();
      removeLocal(id);
      if (res?.conversationId) navigate(`/messages/${res.conversationId}`);
      else navigate("/messages");
    } catch (e) {
      await hapticError();
      setError(userFacingError(e));
    } finally {
      setBusyId(null);
    }
  }

  async function like(member: DiscoverMember) {
    const id = memberId(member);
    if (!id || busyId || offline) return;
    setBusyId(id);
    setError(null);
    try {
      const res = (await matching.likeUser(id, "like")) as {
        conversationId?: string;
        mutual?: boolean;
      };
      await hapticSuccess();
      setLikedIds((prev) => new Set(prev).add(id));
      setToast(t("matchesPage.likedToast"));
      if (res?.conversationId) navigate(`/messages/${res.conversationId}`);
    } catch (e) {
      await hapticError();
      setError(userFacingError(e));
    } finally {
      setBusyId(null);
    }
  }

  async function hide(member: DiscoverMember) {
    const id = memberId(member);
    if (!id || busyId || offline) return;
    setBusyId(id);
    setMenuFor(null);
    try {
      await matching.likeUser(id, "pass");
      await hapticMedium();
      removeLocal(id);
      setToast(t("discoverFeed.hiddenToast"));
    } catch (e) {
      await hapticError();
      setError(userFacingError(e));
    } finally {
      setBusyId(null);
    }
  }

  async function reportOrBlock(member: DiscoverMember, kind: "report" | "block") {
    const id = memberId(member);
    if (!id || busyId || offline) return;
    setBusyId(id);
    setMenuFor(null);
    try {
      if (kind === "block") {
        await moderation.blockUser(id);
        await hapticMedium();
        removeLocal(id);
        setToast(
          t("safety.blockedToast", { name: member.name ?? "Member" })
        );
      } else {
        await moderation.reportUser({
          userId: id,
          reason: "other",
          details: t("safety.reportFromMatches", { name: member.name ?? "member" }),
        });
        await hapticMedium();
        setToast(t("safety.reportedToast"));
      }
    } catch (e) {
      await hapticError();
      setError(userFacingError(e));
    } finally {
      setBusyId(null);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = items;
    if (filter === "new") {
      list = [...list].reverse();
    } else if (filter === "nearby") {
      list = [...list].sort((a, b) =>
        String(a.city ?? "").localeCompare(String(b.city ?? ""))
      );
    }
    if (!q) return list;
    return list.filter((m) => {
      const hay = [
        m.name,
        m.city,
        m.country,
        m.occupation,
        m.bio,
        ...(m.interests ?? []),
        ...(m.hobbies ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [items, query, filter]);

  const cardLabels = {
    viewProfile: t("discoverFeed.viewProfile"),
    message: t("dashboard.message"),
    like: t("matchesPage.like"),
    more: t("discoverFeed.moreActions"),
    verified: t("trustBadges.verified"),
    locationPrivate: t("discoverFeed.locationPrivate"),
  };

  return (
    <ScreenContainer
      className="discover-feed"
      aria-label={t("app.discover")}
      onTouchStart={(e) => {
        pullY.current = e.touches[0]?.clientY ?? null;
      }}
      onTouchEnd={(e) => {
        const start = pullY.current;
        const end = e.changedTouches[0]?.clientY;
        if (
          start != null &&
          end != null &&
          end - start > 110 &&
          window.scrollY < 8 &&
          !busyId
        ) {
          void load("refresh");
        }
        pullY.current = null;
      }}
    >
      <DiscoverHeader
        query={query}
        onQueryChange={setQuery}
        activeFilter={filter}
        onFilterChange={setFilter}
        onOpenFilters={() => setFiltersOpen(true)}
        labels={{
          eyebrow: t("app.discover"),
          title: t("discoverFeed.findPeople"),
          search: t("discoverFeed.searchPlaceholder"),
          filter: t("discoverFeed.filters"),
          recommended: t("discoverFeed.filterRecommended"),
          nearby: t("discoverFeed.filterNearby"),
          newest: t("discoverFeed.filterNew"),
        }}
      />

      {offline && (
        <div className="form-error" role="status">
          {t("discoverFeed.offline")}
        </div>
      )}
      {refreshing && (
        <p className="muted small" role="status">
          {t("discoverFeed.refreshing")}
        </p>
      )}
      {error && (
        <div className="form-error" role="alert">
          {error}
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginTop: "0.5rem" }}
            onClick={() => void load("refresh")}
          >
            {t("common.retry")}
          </button>
        </div>
      )}
      {toast && (
        <div className="form-success" role="status">
          {toast}
        </div>
      )}

      {loading && items.length === 0 && (
        <div className="feed-skeleton-stack" aria-busy="true">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <EmptyState
          icon={<Sparkles size={22} />}
          title={t("discoverFeed.emptyTitle")}
          body={t("discoverFeed.emptyBody")}
          action={
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setQuery("");
                setFilter("recommended");
                void load("refresh");
              }}
            >
              {t("discoverFeed.resetFilters")}
            </button>
          }
        />
      )}

      {filtered.length > 0 && (
        <div className="member-feed">
          {filtered.map((member) => {
            const id = memberId(member);
            return (
              <CompactMemberCard
                key={id || member.name}
                member={member}
                liked={likedIds.has(id)}
                busy={busyId === id}
                labels={cardLabels}
                onOpen={openProfile}
                onMessage={(m) => void message(m)}
                onLike={(m) => void like(m)}
                onMore={setMenuFor}
              />
            );
          })}

          {nextCursorRef.current ? (
            <button
              type="button"
              className="btn btn-secondary btn-block"
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore ? t("discoverFeed.loadingMore") : t("discoverFeed.loadMore")}
            </button>
          ) : (
            <p className="muted small center feed-end">
              {t("discoverFeed.caughtUp")}
            </p>
          )}
        </div>
      )}

      <BottomSheet
        open={Boolean(menuFor)}
        title={t("discoverFeed.moreActions")}
        onClose={() => setMenuFor(null)}
      >
        <div className="stack">
          <button
            type="button"
            className="btn btn-secondary btn-block"
            disabled={!menuFor || Boolean(busyId)}
            onClick={() => menuFor && void hide(menuFor)}
          >
            {t("discoverFeed.hideProfile")}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            disabled={!menuFor || Boolean(busyId)}
            onClick={() => menuFor && void reportOrBlock(menuFor, "report")}
          >
            <ShieldAlert size={16} /> {t("safety.reportUser")}
          </button>
          <button
            type="button"
            className="btn btn-danger btn-block"
            disabled={!menuFor || Boolean(busyId)}
            onClick={() => menuFor && void reportOrBlock(menuFor, "block")}
          >
            <Ban size={16} /> {t("safety.blockUser")}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet
        open={filtersOpen}
        title={t("discoverFeed.filters")}
        onClose={() => setFiltersOpen(false)}
      >
        <div className="stack">
          <p className="muted small" style={{ margin: 0 }}>
            {t("discoverFeed.filtersHint")}
          </p>
          {(
            [
              ["recommended", t("discoverFeed.filterRecommended")],
              ["nearby", t("discoverFeed.filterNearby")],
              ["new", t("discoverFeed.filterNew")],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`btn ${filter === id ? "btn-primary" : "btn-secondary"} btn-block`}
              onClick={() => {
                setFilter(id);
                setFiltersOpen(false);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </BottomSheet>
    </ScreenContainer>
  );
}
