import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Gender, Profile, Preference, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { computeAccessState, type AccessState } from "../common/access-state";
import { isStaffRole, STAFF_PROFILE_COMPLETION_PATCH } from "../common/access";
import { assertGenderMutable } from "./gender-lock";
import { normalizeContactPhone } from "./phone";
import {
  assertProfileFullyComplete,
  type ProfileLike,
} from "./profile-completeness";
import { QUESTIONNAIRE_COMPLETE_STEP } from "./profile-enrichment";
import {
  CONTACT_COMPLETE_STEP,
  CONTACT_IN_PROGRESS_STEP,
  hasValidContact,
  PROFILE_DEFAULTS,
  pruneIncompleteAutosaveWrites,
  sanitizeContactProfileUpdates,
  assertEligibleAge,
  splitQuestionnaireData,
  STAFF_ONLY_PROFILE_FIELDS,
  stripClientLocationWrites,
} from "./questionnaire";
import { isDiscoverable } from "../common/review-status";
import { ScoreRecalcStub } from "./score-recalc.stub";
import { MediaAccessService } from "../media/media-access.service";
import {
  resolveAdditionalImageUrls,
  resolveProfileMainImageUrl,
  resolveProfileMainMediaId,
} from "../media/profile-image-url";

const MEMBER_PATCH_ALLOW = new Set([
  "name",
  "bio",
  "phone",
  "photoVisibility",
  "age",
  "height",
  "weight",
  "country",
  "city",
  "education",
  "occupation",
  "religiousLevel",
  "maritalStatus",
  "children",
  "prayerFrequency",
  "spousePrayerImportance",
  "wearsHijab",
  "hasBeard",
  "smokes",
  "substanceDetails",
  "exercise",
  "wantChildren",
  "livingSituation",
  "polygynyOpenness",
  "hasCurrentWife",
  "openToSecondWife",
  "acceptManWithWife",
  "acceptPreviouslyMarriedMan",
  "acceptFutureCoWife",
  "languagesSpoken",
  "citizenshipStatus",
  "financialReadiness",
  "marriageWorkPreference",
  "marriageTimeline",
  "loveLanguage",
  "marrySomeoneWithChildren",
  "qualities",
  "hobbies",
  "drinksAlcohol",
]);

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoreStub: ScoreRecalcStub,
    private readonly mediaAccess: MediaAccessService
  ) {}

  private async audit(
    userId: string,
    action: Parameters<
      typeof this.prisma.profileAuditEvent.create
    >[0]["data"]["action"],
    profileId: string | null,
    metadata?: Record<string, unknown>
  ) {
    await this.prisma.profileAuditEvent.create({
      data: {
        userId,
        profileId,
        action,
        metadata: metadata as object | undefined,
      },
    });
  }

  async getMe(userId: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
    });
    if (!profile) throw new NotFoundException("Profile not found");
    return this.toPublicProfile(profile);
  }

  async getAccessState(userId: string): Promise<AccessState> {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
    });
    return computeAccessState({
      authenticated: true,
      profile: profile
        ? {
            ...profile,
            paidCents: undefined,
          }
        : null,
    });
  }

  /**
   * Create exactly one profile for users without one (incomplete signups).
   * Concurrent calls rely on unique(userId) — second insert loses race safely.
   */
  async ensure(userId: string) {
    const existing = await this.prisma.profile.findUnique({
      where: { userId },
    });
    if (existing) {
      const backfilled = await this.backfillEnsure(existing);
      return this.toPublicProfile(backfilled);
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");

    const gender: Gender = user.gender ?? "male";
    const preferredGender: Gender = gender === "male" ? "female" : "male";
    const convexId = `local_profile_${userId}`;
    const prefConvexId = `local_pref_${userId}`;

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const profile = await tx.profile.create({
          data: {
            convexId,
            userId,
            convexUserId: user.convexId,
            name: user.name ?? "User",
            gender,
            phone: user.phone,
            age: 0,
            height: 170,
            weight: 70,
            country: "",
            city: "",
            education: "",
            occupation: "",
            religiousLevel: "",
            maritalStatus: "",
            children: 0,
            bio: "",
            verified: false,
            role: "user",
            prayerFrequency: "",
            spousePrayerImportance: PROFILE_DEFAULTS.spousePrayerImportance,
            smokes: "",
            drinksAlcohol: "",
            exercise: "",
            wantChildren: "",
            marriageTimeline: "",
            marrySomeoneWithChildren: "",
            languagesSpoken: [],
            qualities: [],
            hobbies: [],
            questionnaireComplete: false,
            questionnaireStep: 0,
            registrationComplete: false,
            hasPaid: false,
            banned: false,
            approved: false,
            reviewStatus: "incomplete",
            photoVisibility: "everyone",
          },
        });

        await tx.preference.create({
          data: {
            convexId: prefConvexId,
            userId,
            convexUserId: user.convexId,
            preferredGender,
            minAge: 18,
            maxAge: 60,
            minHeight: 150,
            maxHeight: 210,
            minWeight: 45,
            maxWeight: 150,
            preferredCountries: [],
            acceptChildren: "",
            educationLevel: "Bachelor",
            acceptDivorcee: "Depends",
            acceptWidow: "Depends",
            qualities: [],
            hobbies: [],
            partnerBeard: "",
            partnerHijabLevel: "",
          },
        });

        return profile;
      });

      await this.audit(userId, "profile_ensure", created.id, { created: true });
      return this.toPublicProfile(created);
    } catch (err: unknown) {
      // Unique constraint — concurrent ensure won the race
      const code =
        err && typeof err === "object" && "code" in err
          ? (err as { code?: string }).code
          : undefined;
      if (code === "P2002") {
        const again = await this.prisma.profile.findUnique({
          where: { userId },
        });
        if (again) return this.toPublicProfile(again);
      }
      throw err;
    }
  }

  private async backfillEnsure(existing: Profile): Promise<Profile> {
    const backfill: Prisma.ProfileUpdateInput = {};
    if (existing.spousePrayerImportance === null) {
      backfill.spousePrayerImportance = PROFILE_DEFAULTS.spousePrayerImportance;
    }
    if (existing.registrationComplete === null) {
      backfill.registrationComplete = true;
    }
    if (existing.questionnaireStep === null) {
      backfill.questionnaireStep = existing.questionnaireComplete
        ? QUESTIONNAIRE_COMPLETE_STEP
        : PROFILE_DEFAULTS.questionnaireStep;
    } else if (
      existing.questionnaireComplete &&
      (existing.questionnaireStep ?? 0) < QUESTIONNAIRE_COMPLETE_STEP
    ) {
      backfill.questionnaireStep = QUESTIONNAIRE_COMPLETE_STEP;
    }

    if (isStaffRole(existing.role)) {
      Object.assign(backfill, STAFF_PROFILE_COMPLETION_PATCH);
    }

    if (Object.keys(backfill).length === 0) return existing;
    return this.prisma.profile.update({
      where: { id: existing.id },
      data: backfill,
    });
  }

  async patchMe(
    userId: string,
    body: Record<string, unknown>,
    opts?: { expectedUpdatedAt?: string }
  ) {
    const profile = await this.requireProfile(userId);

    for (const key of Object.keys(body)) {
      if (STAFF_ONLY_PROFILE_FIELDS.has(key)) {
        throw new ForbiddenException("Cannot modify staff-controlled fields");
      }
      if (!MEMBER_PATCH_ALLOW.has(key)) {
        throw new BadRequestException(`Field not allowed: ${key}`);
      }
    }

    if (opts?.expectedUpdatedAt) {
      const expected = new Date(opts.expectedUpdatedAt).getTime();
      if (profile.updatedAt.getTime() !== expected) {
        throw new ConflictException("Profile was modified; refresh and retry");
      }
    }

    if (typeof body.gender === "string") {
      throw new BadRequestException(
        "Use /profile/complete-registration-gender to change gender"
      );
    }

    const data: Prisma.ProfileUpdateInput = {};
    for (const key of MEMBER_PATCH_ALLOW) {
      if (body[key] !== undefined) {
        (data as Record<string, unknown>)[key] = body[key];
      }
    }

    if (typeof body.phone === "string" && body.phone.trim()) {
      const normalized = normalizeContactPhone(body.phone);
      if (!normalized) {
        throw new BadRequestException(
          "Enter a valid phone number with country code, e.g. +252 61 234 5678."
        );
      }
      body.phone = normalized;
      (data as Record<string, unknown>).phone = normalized;
    }

    const updated = await this.prisma.profile.update({
      where: { id: profile.id },
      data,
    });

    if (typeof body.name === "string" || typeof body.phone === "string") {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...(typeof body.name === "string" ? { name: body.name } : {}),
          ...(typeof body.phone === "string" ? { phone: body.phone } : {}),
        },
      });
    }

    await this.audit(userId, "profile_update", profile.id, {
      fields: Object.keys(data),
    });

    if (
      isDiscoverable(updated) &&
      (body.name !== undefined ||
        body.bio !== undefined ||
        body.phone !== undefined)
    ) {
      await this.scoreStub.enqueue(userId, "profile_patch");
    }

    return this.toPublicProfile(updated);
  }

  async completeRegistrationGender(userId: string, gender: Gender) {
    const profile = await this.requireProfile(userId);
    try {
      assertGenderMutable(profile, gender);
    } catch (e) {
      throw new ForbiddenException(
        e instanceof Error ? e.message : "Gender locked"
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { gender },
    });

    const preferredGender: Gender = gender === "male" ? "female" : "male";
    await this.prisma.preference.updateMany({
      where: { userId },
      data: { preferredGender },
    });

    const updated = await this.prisma.profile.update({
      where: { id: profile.id },
      data: { gender, registrationComplete: true },
    });

    await this.audit(userId, "profile_gender_complete", profile.id, { gender });
    return this.toPublicProfile(updated);
  }

  async autosaveQuestionnaire(
    userId: string,
    step: number,
    data: Record<string, unknown>
  ) {
    const profile = await this.requireProfile(userId);
    if (profile.questionnaireComplete) {
      return this.toPublicProfile(profile);
    }

    const { profileUpdates, preferences } = splitQuestionnaireData(data);
    sanitizeContactProfileUpdates(profileUpdates);
    assertEligibleAge(profileUpdates);
    pruneIncompleteAutosaveWrites(profileUpdates, preferences);

    if (
      Object.keys(profileUpdates).length === 0 &&
      (!preferences || Object.keys(preferences).length === 0)
    ) {
      return this.toPublicProfile(profile);
    }

    const genderUpdate = profileUpdates.gender;
    if (genderUpdate === "male" || genderUpdate === "female") {
      try {
        assertGenderMutable(profile, genderUpdate);
      } catch (e) {
        throw new ForbiddenException(
          e instanceof Error ? e.message : "Gender locked"
        );
      }
      await this.syncGender(userId, genderUpdate);
    }

    if (hasValidContact(profile, profileUpdates)) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          name: profileUpdates.name as string,
          phone: profileUpdates.phone as string,
        },
      });
    }

    let stepToSave = step;
    if (
      stepToSave >= CONTACT_COMPLETE_STEP &&
      !hasValidContact(profile, profileUpdates)
    ) {
      stepToSave = Math.min(
        profile.questionnaireStep ?? CONTACT_IN_PROGRESS_STEP,
        CONTACT_IN_PROGRESS_STEP
      );
    }

    const genderChosen = genderUpdate === "male" || genderUpdate === "female";
    const hasProfileFieldUpdates = Object.keys(profileUpdates).length > 0;
    const stepChanged = stepToSave !== (profile.questionnaireStep ?? 0);

    if (hasProfileFieldUpdates || genderChosen) {
      await this.prisma.profile.update({
        where: { id: profile.id },
        data: {
          ...(profileUpdates as Prisma.ProfileUpdateInput),
          questionnaireStep: stepToSave,
          lastSavedAt: new Date(),
          ...(genderChosen ? { registrationComplete: true } : {}),
        },
      });
    } else if (stepChanged) {
      await this.prisma.profile.update({
        where: { id: profile.id },
        data: {
          questionnaireStep: stepToSave,
          lastSavedAt: new Date(),
        },
      });
    }

    if (preferences && Object.keys(preferences).length > 0) {
      await this.patchPreferencesRaw(userId, preferences);
    }

    await this.audit(userId, "questionnaire_autosave", profile.id, {
      step: stepToSave,
    });
    return this.getMe(userId);
  }

  async updateQuestionnaire(
    userId: string,
    step: number,
    data: Record<string, unknown>
  ) {
    const profile = await this.requireProfile(userId);
    const { profileUpdates, preferences } = splitQuestionnaireData(data);
    sanitizeContactProfileUpdates(profileUpdates, { strict: true });
    assertEligibleAge(profileUpdates);
    stripClientLocationWrites(profileUpdates);

    const genderUpdate = profileUpdates.gender;
    if (genderUpdate === "male" || genderUpdate === "female") {
      try {
        assertGenderMutable(profile, genderUpdate);
      } catch (e) {
        throw new ForbiddenException(
          e instanceof Error ? e.message : "Gender locked"
        );
      }
      await this.syncGender(userId, genderUpdate);
    }

    if (hasValidContact(profile, profileUpdates)) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          name: profileUpdates.name as string,
          phone: profileUpdates.phone as string,
        },
      });
    }

    await this.prisma.profile.update({
      where: { id: profile.id },
      data: {
        ...(profileUpdates as Prisma.ProfileUpdateInput),
        questionnaireStep: step,
        lastSavedAt: new Date(),
        ...(genderUpdate === "male" || genderUpdate === "female"
          ? { registrationComplete: true }
          : {}),
      },
    });

    if (preferences && Object.keys(preferences).length > 0) {
      await this.patchPreferencesRaw(userId, preferences);
    }

    const updated = await this.requireProfile(userId);
    if (isDiscoverable(updated)) {
      await this.scoreStub.enqueue(userId, "questionnaire_update");
    }

    await this.audit(userId, "questionnaire_update", profile.id, { step });
    return this.toPublicProfile(updated);
  }

  async saveProfileEdits(userId: string, data: Record<string, unknown>) {
    const profile = await this.requireProfile(userId);
    const { profileUpdates, preferences } = splitQuestionnaireData(data);
    sanitizeContactProfileUpdates(profileUpdates, { strict: true });
    assertEligibleAge(profileUpdates);
    stripClientLocationWrites(profileUpdates);

    const genderUpdate = profileUpdates.gender;
    if (genderUpdate === "male" || genderUpdate === "female") {
      try {
        assertGenderMutable(profile, genderUpdate);
      } catch (e) {
        throw new ForbiddenException(
          e instanceof Error ? e.message : "Gender locked"
        );
      }
      await this.syncGender(userId, genderUpdate);
    }

    if (Object.keys(profileUpdates).length > 0) {
      await this.prisma.profile.update({
        where: { id: profile.id },
        data: {
          ...(profileUpdates as Prisma.ProfileUpdateInput),
          lastSavedAt: new Date(),
        },
      });
    }
    if (preferences && Object.keys(preferences).length > 0) {
      await this.patchPreferencesRaw(userId, preferences);
    }

    const updated = await this.requireProfile(userId);
    if (isDiscoverable(updated)) {
      await this.scoreStub.enqueue(userId, "profile_edits");
    }
    await this.audit(userId, "profile_update", profile.id, {
      source: "saveProfileEdits",
    });
    return this.toPublicProfile(updated);
  }

  async completeQuestionnaire(userId: string) {
    const profile = await this.requireProfile(userId);
    if (profile.questionnaireComplete) {
      return this.toPublicProfile(profile);
    }

    const prefs = await this.prisma.preference.findUnique({
      where: { userId },
    });

    try {
      assertProfileFullyComplete(this.asCompletenessProfile(profile), prefs);
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : "Profile incomplete"
      );
    }

    const womenBasicNeedsReview = profile.gender === "female";

    let patch: Prisma.ProfileUpdateInput = {
      questionnaireComplete: true,
      questionnaireStep: QUESTIONNAIRE_COMPLETE_STEP,
      lastSavedAt: new Date(),
      verified: false,
    };

    if (womenBasicNeedsReview) {
      patch = {
        ...patch,
        reviewStatus: "incomplete",
        approved: false,
      };
    } else if (profile.hasPaid) {
      patch = {
        ...patch,
        reviewStatus: "approved",
        approved: true,
      };
    } else {
      patch = {
        ...patch,
        reviewStatus: "incomplete",
        approved: false,
      };
    }

    let updated = await this.prisma.profile.update({
      where: { id: profile.id },
      data: patch,
    });

    if (womenBasicNeedsReview && profile.hasPaid) {
      updated = await this.prisma.profile.update({
        where: { id: profile.id },
        data: { reviewStatus: "pending_review", approved: false },
      });
    }

    if (!womenBasicNeedsReview && profile.hasPaid) {
      await this.scoreStub.enqueue(userId, "questionnaire_complete_paid_male");
    }

    await this.audit(userId, "questionnaire_complete", profile.id, {
      gender: profile.gender,
      hasPaid: profile.hasPaid,
    });
    return this.toPublicProfile(updated);
  }

  async getWali(userId: string) {
    const profile = await this.requireProfile(userId);
    return {
      waliName: profile.waliName ?? null,
      waliPhone: profile.waliPhone ?? null,
    };
  }

  async updateWali(
    userId: string,
    body: { waliName?: string; waliPhone?: string }
  ) {
    const profile = await this.requireProfile(userId);
    const waliName = body.waliName?.trim() ?? "";
    const waliPhone = body.waliPhone?.trim() ?? "";
    if (waliName && waliName.length < 2) {
      throw new BadRequestException("Calaf name is too short");
    }
    if (waliPhone && waliPhone.length < 8) {
      throw new BadRequestException("Calaf phone number is invalid");
    }
    const updated = await this.prisma.profile.update({
      where: { id: profile.id },
      data: {
        waliName: waliName || null,
        waliPhone: waliPhone || null,
      },
    });
    await this.audit(userId, "wali_update", profile.id, {});
    return {
      waliName: updated.waliName ?? null,
      waliPhone: updated.waliPhone ?? null,
    };
  }

  private async syncGender(userId: string, gender: Gender) {
    await this.prisma.user.update({ where: { id: userId }, data: { gender } });
    const preferredGender: Gender = gender === "male" ? "female" : "male";
    await this.prisma.preference.updateMany({
      where: { userId },
      data: { preferredGender },
    });
  }

  private async patchPreferencesRaw(
    userId: string,
    preferences: Record<string, unknown>
  ) {
    const allowed: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(preferences)) {
      if (
        [
          "preferredGender",
          "minAge",
          "maxAge",
          "minHeight",
          "maxHeight",
          "minWeight",
          "maxWeight",
          "preferredCountries",
          "acceptChildren",
          "educationLevel",
          "religiousLevel",
          "acceptDivorcee",
          "acceptWidow",
          "maxDistance",
          "qualities",
          "hobbies",
          "partnerBeard",
          "partnerHijabLevel",
          "readyToRelocate",
        ].includes(k)
      ) {
        allowed[k] = v;
      }
    }
    if (Object.keys(allowed).length === 0) return;
    await this.prisma.preference.updateMany({
      where: { userId },
      data: allowed as Prisma.PreferenceUpdateManyMutationInput,
    });
  }

  async requireProfile(userId: string): Promise<Profile> {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
    });
    if (!profile) throw new NotFoundException("Profile not found");
    if (profile.banned) {
      throw new ForbiddenException("Account suspended");
    }
    return profile;
  }

  private asCompletenessProfile(profile: Profile): ProfileLike {
    return {
      ...profile,
      profileImageId: profile.profileImageMediaId ?? profile.profileImageConvexId,
    };
  }

  toPublicProfile(profile: Profile) {
    return this.toPublicProfileAsync(profile);
  }

  async toPublicProfileAsync(profile: Profile) {
    const mainMediaId = await resolveProfileMainMediaId(this.prisma, profile);
    const profileImageId = mainMediaId ?? profile.profileImageConvexId;
    const additionalImageIds =
      profile.additionalImageMediaIds.length > 0
        ? profile.additionalImageMediaIds
        : profile.additionalImageConvexIds;

    const viewer = {
      userId: profile.userId,
      roles: [profile.role as "user" | "admin" | "owner"],
    };
    const imageUrl = await resolveProfileMainImageUrl(
      this.prisma,
      this.mediaAccess,
      profile,
      viewer
    );
    const additionalImageUrls = await resolveAdditionalImageUrls(
      this.prisma,
      this.mediaAccess,
      profile,
      viewer
    );

    return {
      id: profile.id,
      userId: profile.userId,
      convexId: profile.convexId,
      name: profile.name,
      gender: profile.gender,
      age: profile.age,
      height: profile.height,
      weight: profile.weight,
      country: profile.country,
      city: profile.city,
      education: profile.education,
      occupation: profile.occupation,
      religiousLevel: profile.religiousLevel,
      maritalStatus: profile.maritalStatus,
      children: profile.children,
      bio: profile.bio,
      phone: profile.phone,
      role: profile.role,
      prayerFrequency: profile.prayerFrequency,
      spousePrayerImportance: profile.spousePrayerImportance,
      wearsHijab: profile.wearsHijab,
      hasBeard: profile.hasBeard,
      smokes: profile.smokes,
      substanceDetails: profile.substanceDetails,
      drinksAlcohol: profile.drinksAlcohol,
      exercise: profile.exercise,
      wantChildren: profile.wantChildren,
      livingSituation: profile.livingSituation,
      polygynyOpenness: profile.polygynyOpenness,
      hasCurrentWife: profile.hasCurrentWife,
      openToSecondWife: profile.openToSecondWife,
      acceptManWithWife: profile.acceptManWithWife,
      acceptPreviouslyMarriedMan: profile.acceptPreviouslyMarriedMan,
      acceptFutureCoWife: profile.acceptFutureCoWife,
      languagesSpoken: profile.languagesSpoken,
      citizenshipStatus: profile.citizenshipStatus,
      financialReadiness: profile.financialReadiness,
      marriageWorkPreference: profile.marriageWorkPreference,
      marriageTimeline: profile.marriageTimeline,
      loveLanguage: profile.loveLanguage,
      marrySomeoneWithChildren: profile.marrySomeoneWithChildren,
      qualities: profile.qualities,
      hobbies: profile.hobbies,
      questionnaireComplete: profile.questionnaireComplete,
      questionnaireStep: profile.questionnaireStep,
      lastSavedAt: profile.lastSavedAt,
      registrationComplete: profile.registrationComplete,
      hasPaid: profile.hasPaid,
      genderLocked: profile.genderLocked,
      hasPersonalSupport: profile.hasPersonalSupport,
      profileImageId,
      profileImageConvexId: profile.profileImageConvexId,
      profileImageMediaId: profile.profileImageMediaId,
      imageUrl,
      additionalImageIds,
      additionalImageUrls,
      additionalImageConvexIds: profile.additionalImageConvexIds,
      additionalImageMediaIds: profile.additionalImageMediaIds,
      privateImageConvexIds: profile.privateImageConvexIds,
      privateImageMediaIds: profile.privateImageMediaIds,
      waliName: profile.waliName,
      waliPhone: profile.waliPhone,
      banned: profile.banned,
      approved: profile.approved,
      reviewStatus: profile.reviewStatus,
      photoVisibility: profile.photoVisibility,
      verified: profile.verified,
      updatedAt: profile.updatedAt.toISOString(),
      createdAt: profile.createdAt.toISOString(),
    };
  }

  /**
   * Limited share card for deep links. Uses opaque convexId (never sequential DB id).
   * Non-owners only see discoverable, non-banned profiles. No email/phone/private answers.
   */
  async getShareableCard(viewerUserId: string, publicId: string) {
    const id = publicId.trim();
    if (!id || id.length < 8 || id.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(id)) {
      throw new BadRequestException("Invalid profile link");
    }
    if (/^\d+$/.test(id)) {
      throw new BadRequestException("Invalid profile link");
    }

    const profile = await this.prisma.profile.findFirst({
      where: { convexId: id },
    });
    if (!profile || profile.banned) {
      throw new NotFoundException("Profile unavailable");
    }

    const isOwner = profile.userId === viewerUserId;
    if (!isOwner && !isDiscoverable(profile)) {
      throw new NotFoundException("Profile unavailable");
    }

    const viewer = {
      userId: viewerUserId,
      roles: [] as Array<"user" | "admin" | "owner">,
    };
    let imageUrl: string | null = null;
    if (profile.photoVisibility !== "private" || isOwner) {
      imageUrl = await resolveProfileMainImageUrl(
        this.prisma,
        this.mediaAccess,
        profile,
        viewer
      );
    }

    const bio =
      typeof profile.bio === "string" && profile.bio.trim()
        ? profile.bio.trim().slice(0, 280)
        : null;

    return {
      publicId: profile.convexId,
      name: profile.name,
      age: profile.age > 0 ? profile.age : null,
      city: profile.city || null,
      country: profile.country || null,
      bio,
      imageUrl,
      verified: profile.verified === true,
      isOwner,
    };
  }

  /** Test helper — generate local convex-style ids without colliding. */
  static localId(prefix: string): string {
    return `${prefix}_${randomUUID()}`;
  }
}

export type { Preference };
