import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { auth, matching, ApiClientError } from "@hel/api-client";
import {
  memberId,
  memberPhoto,
  memberPlace,
  memberScore,
  type DiscoverMember,
} from "../lib/discover";
import type { RootStackScreenProps } from "../navigation/types";

/**
 * Ported from apps/client/src/features/matches/MatchesPage.tsx — same
 * @hel/api-client calls (matching.getMyMatches / getMatchLists / likeUser /
 * startChat) and tab structure, native list instead of the web card grid.
 */

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
  online?: boolean;
};

type MatchRow = {
  matchId?: string;
  conversationId?: string | null;
  score?: number;
  isNew?: boolean;
  hasMessages?: boolean;
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

const TABS: { id: ListTab; label: string }[] = [
  { id: "mutual", label: "Mutual" },
  { id: "liked", label: "Liked" },
  { id: "likedYou", label: "Liked you" },
  { id: "shortlist", label: "Saved" },
  { id: "passed", label: "Passed" },
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

function MemberRow({
  member,
  busy,
  showLike,
  onOpen,
  onMessage,
  onLike,
}: {
  member: DiscoverMember;
  busy: boolean;
  showLike: boolean;
  onOpen: () => void;
  onMessage: () => void;
  onLike?: () => void;
}) {
  const photo = memberPhoto(member);
  const place = memberPlace(member);
  const score = memberScore(member);
  const name = member.name ?? "Member";

  return (
    <Pressable style={styles.row} onPress={onOpen} disabled={busy}>
      {photo ? (
        <Image source={{ uri: photo }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.avatarInitial}>{name.slice(0, 1).toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
            {member.age ? `, ${member.age}` : ""}
          </Text>
          {member.online ? <View style={styles.onlineDot} /> : null}
        </View>
        {place ? (
          <Text style={styles.place} numberOfLines={1}>
            {place}
          </Text>
        ) : null}
        {score != null ? <Text style={styles.score}>{score}% match</Text> : null}
      </View>
      <View style={styles.rowActions}>
        {busy ? (
          <ActivityIndicator size="small" color="#a61b2b" />
        ) : (
          <>
            <Pressable style={styles.actionBtn} onPress={onMessage} hitSlop={8}>
              <Text style={styles.actionBtnText}>Message</Text>
            </Pressable>
            {showLike && onLike ? (
              <Pressable style={[styles.actionBtn, styles.actionBtnGhost]} onPress={onLike} hitSlop={8}>
                <Text style={[styles.actionBtnText, styles.actionBtnGhostText]}>Like</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </View>
    </Pressable>
  );
}

export function MatchesScreen({ navigation }: RootStackScreenProps<"Matches">) {
  const [tab, setTab] = useState<ListTab>("mutual");
  const [mutuals, setMutuals] = useState<MatchRow[]>([]);
  const [lists, setLists] = useState<ListsPayload>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [mutualData, listData] = await Promise.all([
        matching.getMyMatches("active"),
        matching.getMatchLists({}),
      ]);
      setMutuals(Array.isArray(mutualData) ? (mutualData as MatchRow[]) : []);
      setLists(
        listData && typeof listData === "object" ? (listData as ListsPayload) : {}
      );
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Failed to load your lists");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => {
            Alert.alert("Sign out?", undefined, [
              { text: "Cancel", style: "cancel" },
              {
                text: "Sign out",
                style: "destructive",
                onPress: async () => {
                  await auth.logout();
                  navigation.replace("Login");
                },
              },
            ]);
          }}
          hitSlop={8}
        >
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      ),
    });
  }, [navigation]);

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

  async function actOnPerson(userId: string, action: "like" | "pass" | "shortlist") {
    if (!userId || busyId) return;
    setBusyId(userId);
    setError(null);
    try {
      const res = (await matching.likeUser(userId, action)) as {
        matched?: boolean;
        mutual?: boolean;
        conversationId?: string;
      };
      if (res?.matched && res.mutual) {
        Alert.alert("It's a match!", "You both liked each other.");
      }
      await load();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "That didn't go through — try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function messagePerson(member: DiscoverMember) {
    const userId = memberId(member);
    if (!userId || busyId) return;

    const mutual = mutuals.find((m) => m.profile?.userId === userId);
    if (mutual?.conversationId) {
      Alert.alert("Chat", "Conversation already open — chat screen isn't built on mobile yet.");
      return;
    }

    setBusyId(userId);
    setError(null);
    try {
      const res = await matching.startChat(userId);
      Alert.alert(
        "Chat started",
        res?.conversationId
          ? "The conversation was created on the server — the chat UI isn't built on mobile yet."
          : "Request sent."
      );
      await load();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Couldn't start a chat — try again.");
    } finally {
      setBusyId(null);
    }
  }

  function openProfile(member: DiscoverMember) {
    Alert.alert(member.name ?? "Profile", "Full profile screen isn't built on mobile yet.");
  }

  const listPeople: PersonCard[] =
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
    ? listPeople.filter((p) => `${p.name ?? ""} ${p.city ?? ""} ${p.country ?? ""}`.toLowerCase().includes(q))
    : listPeople;
  const filteredMutuals = q
    ? mutuals.filter((m) => `${m.profile?.name ?? m.name ?? ""} ${m.profile?.city ?? ""}`.toLowerCase().includes(q))
    : mutuals;

  const data: DiscoverMember[] =
    tab === "mutual" ? filteredMutuals.map(matchToMember) : filteredPeople.map(personToMember);
  const showLike = tab === "likedYou" || tab === "shortlist" || tab === "passed";

  const emptyText =
    tab === "mutual"
      ? "No matches yet — like some profiles to see them here."
      : tab === "liked"
        ? "You haven't liked anyone yet."
        : tab === "likedYou"
          ? "No one has liked you yet."
          : tab === "shortlist"
            ? "Your saved list is empty."
            : "No one passed yet.";

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        placeholder="Search by name or city"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
      />

      <FlatList
        horizontal
        data={TABS}
        keyExtractor={(t) => t.id}
        showsHorizontalScrollIndicator={false}
        style={styles.tabsRow}
        contentContainerStyle={styles.tabsContent}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.tab, tab === item.id && styles.tabActive]}
            onPress={() => setTab(item.id)}
          >
            <Text style={[styles.tabText, tab === item.id && styles.tabTextActive]}>
              {item.label} ({counts[item.id]})
            </Text>
          </Pressable>
        )}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator style={styles.loading} size="large" color="#a61b2b" />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(m, i) => memberId(m) || String(i)}
          contentContainerStyle={data.length === 0 && styles.emptyContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />
          }
          ListEmptyComponent={<Text style={styles.emptyText}>{emptyText}</Text>}
          renderItem={({ item }) => (
            <MemberRow
              member={item}
              busy={busyId === memberId(item)}
              showLike={showLike}
              onOpen={() => openProfile(item)}
              onMessage={() => void messagePerson(item)}
              onLike={() => {
                const id = memberId(item);
                if (id) void actOnPerson(id, "like");
              }}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  search: {
    marginHorizontal: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  tabsRow: { flexGrow: 0, marginTop: 12 },
  tabsContent: { paddingHorizontal: 16, gap: 8 },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#f2f2f2",
    marginRight: 8,
  },
  tabActive: { backgroundColor: "#a61b2b" },
  tabText: { fontSize: 13, fontWeight: "600", color: "#444" },
  tabTextActive: { color: "#fff" },
  error: {
    marginHorizontal: 16,
    marginTop: 10,
    color: "#b91c1c",
    backgroundColor: "#fee2e2",
    padding: 10,
    borderRadius: 8,
  },
  loading: { marginTop: 40 },
  emptyContainer: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { color: "#888", fontSize: 14, textAlign: "center", marginTop: 40, paddingHorizontal: 32 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
    gap: 12,
  },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#eee" },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 18, fontWeight: "700", color: "#999" },
  rowBody: { flex: 1, gap: 2 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { fontSize: 16, fontWeight: "600", flexShrink: 1 },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#22c55e" },
  place: { fontSize: 13, color: "#777" },
  score: { fontSize: 12, color: "#a61b2b", fontWeight: "600" },
  rowActions: { flexDirection: "row", gap: 6, alignItems: "center" },
  actionBtn: {
    backgroundColor: "#a61b2b",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  actionBtnGhost: { backgroundColor: "#f2f2f2" },
  actionBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  actionBtnGhostText: { color: "#a61b2b" },
  signOut: { color: "#a61b2b", fontSize: 14, fontWeight: "600", marginRight: 4 },
});
