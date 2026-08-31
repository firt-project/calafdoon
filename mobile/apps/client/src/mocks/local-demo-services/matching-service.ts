/**
 * @deprecated Local-demo only. Production auth is Nest `/auth` via @hel/api-client.
 * Guarded by VITE_USE_LOCAL_DEMO — do not use as authoritative identity.
 */
import type {
  CompatibilityBreakdown,
  PeerProfile,
  ProfileAnswers,
  ScoredPeer,
} from "@/types";
import { MIN_COMPATIBILITY_SCORE } from "@/lib/constants";
import { SEED_PEERS } from "@/data/seed-peers";

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function overlapScore(a: string[] | undefined, b: string[] | undefined): number {
  if (!a?.length || !b?.length) return 50;
  const setB = new Set(b.map((x) => x.toLowerCase()));
  const hits = a.filter((x) => setB.has(x.toLowerCase())).length;
  return clamp((hits / Math.max(a.length, 1)) * 100);
}

function ageNum(v?: string): number | null {
  if (!v) return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function heightNum(v?: string): number | null {
  if (!v) return null;
  if (v.endsWith("+")) return Number.parseInt(v, 10) || null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function scoreReligion(me: ProfileAnswers, peer: ProfileAnswers): number {
  let score = 60;
  if (me.prayerFrequency && peer.prayerFrequency) {
    score += me.prayerFrequency === peer.prayerFrequency ? 25 : 10;
  }
  if (me.spousePrayerImportance === "Very important") {
    if (peer.prayerFrequency === "Always") score += 15;
    else if (peer.prayerFrequency === "Most of the time") score += 8;
    else score -= 10;
  }
  if (me.gender === "male" && me.pref_partnerHijabLevel) {
    if (
      me.pref_partnerHijabLevel.includes("Hijab") &&
      peer.wearsHijab === "Yes"
    ) {
      score += 10;
    }
  }
  return clamp(score);
}

function scoreLifestyle(me: ProfileAnswers, peer: ProfileAnswers): number {
  let score = 55;
  if (me.exercise && peer.exercise) {
    score += me.exercise === peer.exercise ? 15 : 5;
  }
  if (me.substanceUse === "No" && peer.substanceUse === "No") score += 20;
  if (me.substanceUse === "Yes" && peer.substanceUse === "Yes") score += 5;
  if (me.substanceUse !== peer.substanceUse) score -= 15;
  score += overlapScore(me.hobbies, peer.hobbies) * 0.15;
  return clamp(score);
}

function scoreValues(me: ProfileAnswers, peer: ProfileAnswers): number {
  let score = 50;
  if (me.wantChildren && peer.wantChildren) {
    if (me.wantChildren === peer.wantChildren) score += 20;
    else if (
      (me.wantChildren === "Yes" && peer.wantChildren === "Maybe") ||
      (me.wantChildren === "Maybe" && peer.wantChildren === "Yes")
    ) {
      score += 10;
    } else score -= 15;
  }
  if (me.marriageTimeline && peer.marriageTimeline) {
    score += me.marriageTimeline === peer.marriageTimeline ? 15 : 5;
  }
  if (me.loveLanguage && peer.loveLanguage) {
    score += me.loveLanguage === peer.loveLanguage ? 15 : 5;
  }
  score += overlapScore(me.qualities, peer.qualities) * 0.2;
  return clamp(score);
}

function scorePreferences(me: ProfileAnswers, peer: ProfileAnswers): number {
  let score = 50;
  const peerAge = ageNum(peer.age);
  const minAge = ageNum(me.pref_minAge);
  const maxAge = ageNum(me.pref_maxAge);
  if (peerAge != null && minAge != null && maxAge != null) {
    score += peerAge >= minAge && peerAge <= maxAge ? 25 : -20;
  }
  const peerH = heightNum(peer.height);
  const minH = heightNum(me.pref_minHeight);
  const maxH = heightNum(me.pref_maxHeight);
  if (peerH != null && minH != null && maxH != null) {
    score += peerH >= minH && peerH <= maxH ? 15 : -10;
  }
  if (me.pref_preferredCountries?.length && peer.country) {
    score += me.pref_preferredCountries.includes(peer.country) ? 20 : -5;
  } else if (me.country && peer.country) {
    score += me.country === peer.country ? 15 : 5;
  }
  if (me.pref_educationLevel && peer.education) {
    score += me.pref_educationLevel === peer.education ? 10 : 3;
  }
  return clamp(score);
}

export function computeCompatibility(
  me: ProfileAnswers,
  peer: ProfileAnswers
): CompatibilityBreakdown {
  const religion = scoreReligion(me, peer);
  const lifestyle = scoreLifestyle(me, peer);
  const values = scoreValues(me, peer);
  const preferences = scorePreferences(me, peer);
  const overall = clamp(
    religion * 0.3 + lifestyle * 0.2 + values * 0.25 + preferences * 0.25
  );
  return { overall, religion, lifestyle, values, preferences };
}

export function oppositeGender(gender?: string): "male" | "female" | null {
  if (gender === "male") return "female";
  if (gender === "female") return "male";
  return null;
}

export function scorePeers(
  me: ProfileAnswers,
  peers: PeerProfile[] = SEED_PEERS,
  minScore = MIN_COMPATIBILITY_SCORE
): ScoredPeer[] {
  const lookingFor = oppositeGender(me.gender);
  if (!lookingFor) return [];

  return peers
    .filter((p) => p.answers.gender === lookingFor)
    .map((peer) => ({ peer, score: computeCompatibility(me, peer.answers) }))
    .filter((row) => row.score.overall >= minScore)
    .sort((a, b) => b.score.overall - a.score.overall);
}

export function getPeerById(id: string): PeerProfile | undefined {
  return SEED_PEERS.find((p) => p.id === id);
}
