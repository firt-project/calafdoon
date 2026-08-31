import { Injectable, Logger } from "@nestjs/common";
import type { Gender, Preference, Profile } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { isDiscoverable } from "../common/review-status";
import {
  calculateCompatibility,
  calculateCompatibilityBreakdown,
  type Preferences as ScorePrefs,
  type Profile as ScoreProfile,
} from "./compatibility";
import { SCORE_PAGE_SIZE, SCORE_VERSION } from "./constants";

@Injectable()
export class ScoreService {
  private readonly logger = new Logger(ScoreService.name);

  constructor(private readonly prisma: PrismaService) {}

  toScoreProfile(p: Profile): ScoreProfile {
    return {
      religiousLevel: p.religiousLevel,
      prayerFrequency: p.prayerFrequency,
      spousePrayerImportance: p.spousePrayerImportance ?? undefined,
      age: p.age,
      country: p.country,
      city: p.city,
      height: p.height,
      weight: p.weight,
      education: p.education,
      maritalStatus: p.maritalStatus,
      children: p.children,
      qualities: p.qualities,
      hobbies: p.hobbies,
      marriageTimeline: p.marriageTimeline,
      marrySomeoneWithChildren: p.marrySomeoneWithChildren,
      gender: p.gender,
      wantChildren: p.wantChildren,
      livingSituation: p.livingSituation ?? undefined,
      polygynyOpenness: p.polygynyOpenness ?? undefined,
      hasCurrentWife: p.hasCurrentWife ?? undefined,
      openToSecondWife: p.openToSecondWife ?? undefined,
      acceptManWithWife: p.acceptManWithWife ?? undefined,
      acceptPreviouslyMarriedMan: p.acceptPreviouslyMarriedMan ?? undefined,
      acceptFutureCoWife: p.acceptFutureCoWife ?? undefined,
      languagesSpoken: p.languagesSpoken,
      citizenshipStatus: p.citizenshipStatus ?? undefined,
      financialReadiness: p.financialReadiness ?? undefined,
      marriageWorkPreference: p.marriageWorkPreference ?? undefined,
      wearsHijab: p.wearsHijab ?? undefined,
      hasBeard: p.hasBeard ?? undefined,
      smokes: p.smokes,
    };
  }

  toScorePrefs(prefs: Preference): ScorePrefs {
    return {
      minAge: prefs.minAge,
      maxAge: prefs.maxAge,
      minHeight: prefs.minHeight,
      maxHeight: prefs.maxHeight,
      minWeight: prefs.minWeight,
      maxWeight: prefs.maxWeight,
      preferredCountries: prefs.preferredCountries,
      acceptChildren: prefs.acceptChildren,
      educationLevel: prefs.educationLevel,
      acceptDivorcee: prefs.acceptDivorcee,
      acceptWidow: prefs.acceptWidow,
      preferredGender: prefs.preferredGender,
      qualities: prefs.qualities,
      hobbies: prefs.hobbies,
      partnerBeard: prefs.partnerBeard ?? undefined,
      partnerHijabLevel: prefs.partnerHijabLevel ?? undefined,
    };
  }

  calculatePair(
    user: Profile,
    userPrefs: Preference,
    candidate: Profile,
    candidatePrefs: Preference
  ): number {
    return calculateCompatibility(
      this.toScoreProfile(user),
      this.toScorePrefs(userPrefs),
      this.toScoreProfile(candidate),
      this.toScorePrefs(candidatePrefs)
    );
  }

  calculateBreakdown(
    user: Profile,
    userPrefs: Preference,
    candidate: Profile,
    candidatePrefs: Preference
  ) {
    return calculateCompatibilityBreakdown(
      this.toScoreProfile(user),
      this.toScorePrefs(userPrefs),
      this.toScoreProfile(candidate),
      this.toScorePrefs(candidatePrefs)
    );
  }

  async invalidateUserScores(userId: string): Promise<void> {
    // Keep rows available while recalc runs — only bump version marker via audit.
    await this.prisma.profileAuditEvent.create({
      data: {
        userId,
        action: "score_recalc_stub",
        metadata: { event: "invalidate", scoreVersion: SCORE_VERSION },
      },
    });
  }

  /**
   * Process one page of opposite-gender discoverable candidates.
   * Prefilters: opposite gender, discoverable, has prefs, not self.
   * Blocked pairs skipped at upsert time when either direction blocked.
   */
  async processUserRecalculation(
    userId: string,
    cursor: number,
    enqueueNext?: (nextCursor: number) => Promise<void>
  ): Promise<{ processed: number; done: boolean }> {
    const userProfile = await this.prisma.profile.findUnique({
      where: { userId },
    });
    if (!userProfile || !isDiscoverable(userProfile)) {
      return { processed: 0, done: true };
    }
    const userPrefs = await this.prisma.preference.findUnique({
      where: { userId },
    });
    if (!userPrefs) return { processed: 0, done: true };

    const oppositeGender: Gender =
      userProfile.gender === "male" ? "female" : "male";

    const blocked = await this.getBlockedSet(userId);

    const candidates = await this.prisma.profile.findMany({
      where: {
        gender: oppositeGender,
        role: "user",
        banned: false,
        questionnaireComplete: true,
        hasPaid: true,
        approved: true,
        reviewStatus: "approved",
        userId: { not: userId },
      },
      orderBy: { id: "asc" },
      skip: cursor,
      take: SCORE_PAGE_SIZE,
      include: {
        user: { select: { preferences: true, convexId: true } },
      },
    });

    let processed = 0;
    for (const candidate of candidates) {
      if (blocked.has(candidate.userId)) continue;
      if (!isDiscoverable(candidate)) continue;
      const candidatePrefs = candidate.user.preferences;
      if (!candidatePrefs) continue;

      const scoreAB = this.calculatePair(
        userProfile,
        userPrefs,
        candidate,
        candidatePrefs
      );
      const scoreBA = this.calculatePair(
        candidate,
        candidatePrefs,
        userProfile,
        userPrefs
      );
      const avgScore = Math.round((scoreAB + scoreBA) / 2);
      await this.upsertPairScores(
        userId,
        userProfile.convexUserId,
        candidate.userId,
        candidate.convexUserId,
        avgScore
      );
      processed += 1;
    }

    const done = candidates.length < SCORE_PAGE_SIZE;
    if (!done && enqueueNext) {
      await enqueueNext(cursor + SCORE_PAGE_SIZE);
    }
    this.logger.log(
      JSON.stringify({
        event: "score_recalc_page",
        userId,
        cursor,
        processed,
        done,
      })
    );
    return { processed, done };
  }

  async upsertPairScores(
    userAId: string,
    convexUserA: string,
    userBId: string,
    convexUserB: string,
    avgScore: number
  ) {
    const now = new Date();
    await this.upsertOne(userAId, convexUserA, userBId, convexUserB, avgScore, now);
    await this.upsertOne(userBId, convexUserB, userAId, convexUserA, avgScore, now);
  }

  private async upsertOne(
    userAId: string,
    convexUserA: string,
    userBId: string,
    convexUserB: string,
    score: number,
    now: Date
  ) {
    await this.prisma.compatibilityScore.upsert({
      where: {
        userAId_userBId: { userAId, userBId },
      },
      create: {
        convexId: `local_score_${userAId}_${userBId}`,
        userAId,
        userBId,
        convexUserA,
        convexUserB,
        score,
        scoreVersion: SCORE_VERSION,
        lastCalculatedAt: now,
      },
      update: {
        score,
        scoreVersion: SCORE_VERSION,
        lastCalculatedAt: now,
      },
    });
  }

  private async getBlockedSet(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.block.findMany({
      where: {
        OR: [{ blockerId: userId }, { blockedId: userId }],
      },
      select: { blockerId: true, blockedId: true },
    });
    const set = new Set<string>();
    for (const r of rows) {
      set.add(r.blockerId === userId ? r.blockedId : r.blockerId);
    }
    return set;
  }
}
