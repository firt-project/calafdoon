import { createHash } from "node:crypto";
import { msToDate, normalizeAuthEmail } from "../lib/args.js";
import { findTableJsonl, pathExists, readJsonl } from "../lib/jsonl.js";
import {
  classifyPasswordHash,
  redactConvexId,
  redactEmail,
} from "../crypto/lucia-scrypt.js";

type Gender = "male" | "female";
type UserRole = "user" | "admin" | "owner";
type ReviewStatus =
  | "incomplete"
  | "pending_review"
  | "approved"
  | "rejected"
  | "suspended";
type PhotoVisibility = "everyone" | "matches" | "private";
type PasswordAlgo = "lucia_scrypt" | "unknown";

async function loadPrisma() {
  const mod = await import("@prisma/client");
  return mod.PrismaClient;
}

function preferExisting<T>(
  existing: T | null | undefined,
  incoming: T | null | undefined
): T | null | undefined {
  if (incoming === null || incoming === undefined) return existing;
  if (typeof incoming === "string" && incoming.trim() === "" && existing) {
    return existing;
  }
  return incoming;
}

function asGender(value: unknown): Gender | null {
  return value === "male" || value === "female" ? value : null;
}

function asRole(value: unknown): UserRole {
  if (value === "admin" || value === "owner" || value === "user") return value;
  return "user";
}

function asReviewStatus(value: unknown): ReviewStatus | null {
  if (
    value === "incomplete" ||
    value === "pending_review" ||
    value === "approved" ||
    value === "rejected" ||
    value === "suspended"
  ) {
    return value;
  }
  return null;
}

function asPhotoVisibility(value: unknown): PhotoVisibility | null {
  if (value === "everyone" || value === "matches" || value === "private") {
    return value;
  }
  return null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

export async function runImportCore(opts: {
  inputPath: string;
  limit?: number;
  dryRun: boolean;
  databaseUrl?: string;
}) {
  const { inputPath, limit, dryRun } = opts;
  if (!(await pathExists(inputPath))) {
    throw new Error(`Export path does not exist: ${inputPath}`);
  }

  const databaseUrl = opts.databaseUrl ?? process.env.DATABASE_URL;
  if (!dryRun && !databaseUrl) {
    throw new Error("DATABASE_URL is required unless --dry-run is set");
  }

  const prisma = dryRun
    ? null
    : new (await loadPrisma())({
        datasources: { db: { url: databaseUrl } },
      });

  const sourceHash = createHash("sha256").update(inputPath).digest("hex").slice(0, 16);

  const counts = {
    inserted: { users: 0, authAccounts: 0, profiles: 0, preferences: 0 },
    updated: { users: 0, authAccounts: 0, profiles: 0, preferences: 0 },
    skipped: { users: 0, authAccounts: 0, profiles: 0, preferences: 0 },
    failed: [] as { table: string; convexId?: string; reason: string }[],
  };

  let runId: string | null = null;

  try {
    if (prisma) {
      const run = await prisma.migrationRun.create({
        data: {
          sourceExportPath: inputPath,
          sourceExportHash: sourceHash,
          status: "running",
          dryRun: false,
        },
      });
      runId = run.id;
    }

    const userByConvex = new Map<string, string>();

    // 1) users
    const usersFile = await findTableJsonl(inputPath, "users");
    if (!usersFile) throw new Error("users JSONL not found");
    for await (const row of readJsonl(usersFile, limit)) {
      const convexId = typeof row._id === "string" ? row._id : null;
      if (!convexId) {
        counts.failed.push({ table: "users", reason: "missing_id" });
        continue;
      }
      const emailRaw = typeof row.email === "string" ? row.email : null;
      const emailNormalized = emailRaw ? normalizeAuthEmail(emailRaw) : null;

      if (dryRun || !prisma) {
        counts.inserted.users++;
        userByConvex.set(convexId, `dry-${convexId}`);
        continue;
      }

      try {
        const existing = await prisma.user.findUnique({ where: { convexId } });
        const data = {
          email: preferExisting(existing?.email, emailRaw) as string | null,
          emailNormalized: preferExisting(
            existing?.emailNormalized,
            emailNormalized
          ) as string | null,
          name: preferExisting(existing?.name, row.name as string | undefined) as
            | string
            | null
            | undefined,
          image: preferExisting(existing?.image, row.image as string | undefined) as
            | string
            | null
            | undefined,
          phone: preferExisting(existing?.phone, row.phone as string | undefined) as
            | string
            | null
            | undefined,
          isAnonymous:
            typeof row.isAnonymous === "boolean"
              ? row.isAnonymous
              : existing?.isAnonymous,
          gender: asGender(row.gender) ?? existing?.gender ?? null,
          emailVerificationTime:
            msToDate(row.emailVerificationTime) ?? existing?.emailVerificationTime,
          phoneVerificationTime:
            msToDate(row.phoneVerificationTime) ?? existing?.phoneVerificationTime,
          convexCreatedAt: msToDate(row._creationTime) ?? existing?.convexCreatedAt,
        };

        const saved = await prisma.user.upsert({
          where: { convexId },
          create: {
            convexId,
            email: emailRaw,
            emailNormalized,
            name: typeof row.name === "string" ? row.name : null,
            image: typeof row.image === "string" ? row.image : null,
            phone: typeof row.phone === "string" ? row.phone : null,
            isAnonymous: typeof row.isAnonymous === "boolean" ? row.isAnonymous : null,
            gender: asGender(row.gender),
            emailVerificationTime: msToDate(row.emailVerificationTime),
            phoneVerificationTime: msToDate(row.phoneVerificationTime),
            convexCreatedAt: msToDate(row._creationTime),
          },
          update: data,
        });
        userByConvex.set(convexId, saved.id);
        if (existing) counts.updated.users++;
        else counts.inserted.users++;
      } catch (error) {
        counts.failed.push({
          table: "users",
          convexId,
          reason: error instanceof Error ? error.message : "upsert_failed",
        });
        if (prisma && runId) {
          await prisma.migrationFailure.create({
            data: {
              runId,
              tableName: "users",
              convexId,
              reasonCode: "upsert_failed",
              safeDetail: `user ${redactConvexId(convexId)} ${redactEmail(emailRaw)}`,
            },
          });
        }
      }
    }

    // If not dry-run and limit loaded partial users, also map any existing DB users for FK resolution
    if (prisma && !dryRun) {
      const existingUsers = await prisma.user.findMany({
        select: { id: true, convexId: true },
      });
      for (const u of existingUsers) userByConvex.set(u.convexId, u.id);
    }

    // 2) authAccounts (password only)
    const accountsFile = await findTableJsonl(inputPath, "authAccounts");
    if (!accountsFile) throw new Error("authAccounts JSONL not found");
    let accountCount = 0;
    for await (const row of readJsonl(accountsFile)) {
      if (row.provider !== "password") {
        counts.skipped.authAccounts++;
        continue;
      }
      if (limit !== undefined && accountCount >= limit) break;
      accountCount++;

      const convexId = typeof row._id === "string" ? row._id : null;
      const convexUserId = typeof row.userId === "string" ? row.userId : null;
      if (!convexId || !convexUserId) {
        counts.failed.push({
          table: "authAccounts",
          convexId: convexId ?? undefined,
          reason: "missing_ids",
        });
        continue;
      }

      const userId = userByConvex.get(convexUserId);
      if (!userId) {
        counts.failed.push({
          table: "authAccounts",
          convexId,
          reason: "missing_user",
        });
        continue;
      }

      const secret = typeof row.secret === "string" ? row.secret : null;
      const classification = classifyPasswordHash(secret);
      const providerAccountId =
        typeof row.providerAccountId === "string"
          ? normalizeAuthEmail(row.providerAccountId)
          : "";

      if (dryRun || !prisma) {
        counts.inserted.authAccounts++;
        continue;
      }

      try {
        const existing = await prisma.authAccount.findUnique({
          where: { convexId },
        });
        // Never overwrite an existing hash with empty/missing
        const passwordHash =
          secret && classification !== "missing"
            ? existing?.passwordHash
              ? existing.passwordHash
              : secret
            : existing?.passwordHash ?? null;

        // If both exist, keep existing hash unchanged (do not re-write secrets)
        const finalHash = existing?.passwordHash ?? passwordHash;

        await prisma.authAccount.upsert({
          where: { convexId },
          create: {
            convexId,
            userId,
            convexUserId,
            provider: "password",
            providerAccountId,
            passwordHash: finalHash,
            passwordAlgo:
              classification === "standard_salt_key"
                ? ("lucia_scrypt" satisfies PasswordAlgo)
                : ("unknown" satisfies PasswordAlgo),
            emailVerified:
              typeof row.emailVerified === "boolean" ? row.emailVerified : null,
            phoneVerified:
              typeof row.phoneVerified === "boolean" ? row.phoneVerified : null,
            convexCreatedAt: msToDate(row._creationTime),
          },
          update: {
            userId,
            convexUserId,
            providerAccountId: preferExisting(
              existing?.providerAccountId,
              providerAccountId
            ) as string,
            // Preserve existing hash — never replace with empty
            passwordHash: existing?.passwordHash ?? finalHash,
            passwordAlgo: existing?.passwordAlgo ??
              (classification === "standard_salt_key"
                ? ("lucia_scrypt" satisfies PasswordAlgo)
                : ("unknown" satisfies PasswordAlgo)),
          },
        });
        if (existing) counts.updated.authAccounts++;
        else counts.inserted.authAccounts++;
      } catch (error) {
        counts.failed.push({
          table: "authAccounts",
          convexId,
          reason: error instanceof Error ? error.message : "upsert_failed",
        });
      }
    }

    // 3) profiles
    const profilesFile = await findTableJsonl(inputPath, "profiles");
    if (!profilesFile) throw new Error("profiles JSONL not found");
    for await (const row of readJsonl(profilesFile, limit)) {
      const convexId = typeof row._id === "string" ? row._id : null;
      const convexUserId = typeof row.userId === "string" ? row.userId : null;
      if (!convexId || !convexUserId) {
        counts.failed.push({ table: "profiles", reason: "missing_ids" });
        continue;
      }
      const userId = userByConvex.get(convexUserId);
      if (!userId) {
        counts.failed.push({
          table: "profiles",
          convexId,
          reason: "missing_user",
        });
        continue;
      }

      const gender = asGender(row.gender);
      if (!gender) {
        counts.failed.push({
          table: "profiles",
          convexId,
          reason: "invalid_gender",
        });
        continue;
      }

      if (dryRun || !prisma) {
        counts.inserted.profiles++;
        continue;
      }

      try {
        const existing = await prisma.profile.findUnique({ where: { convexId } });
        const createData = {
          convexId,
          userId,
          convexUserId,
          name: String(row.name ?? ""),
          gender,
          age: Number(row.age ?? 0),
          height: Number(row.height ?? 0),
          weight: Number(row.weight ?? 0),
          country: String(row.country ?? ""),
          city: String(row.city ?? ""),
          locationLat: typeof row.locationLat === "number" ? row.locationLat : null,
          locationLng: typeof row.locationLng === "number" ? row.locationLng : null,
          locationAccuracyM:
            typeof row.locationAccuracyM === "number" ? row.locationAccuracyM : null,
          locationVerifiedAt: msToDate(row.locationVerifiedAt),
          education: String(row.education ?? ""),
          occupation: String(row.occupation ?? ""),
          religiousLevel: String(row.religiousLevel ?? ""),
          maritalStatus: String(row.maritalStatus ?? ""),
          children: Number(row.children ?? 0),
          bio: String(row.bio ?? ""),
          profileImageConvexId:
            typeof row.profileImageId === "string" ? row.profileImageId : null,
          verified: Boolean(row.verified),
          role: asRole(row.role),
          phone: typeof row.phone === "string" ? row.phone : null,
          prayerFrequency: String(row.prayerFrequency ?? ""),
          spousePrayerImportance:
            typeof row.spousePrayerImportance === "string"
              ? row.spousePrayerImportance
              : null,
          wearsHijab: typeof row.wearsHijab === "boolean" ? row.wearsHijab : null,
          hasBeard: typeof row.hasBeard === "boolean" ? row.hasBeard : null,
          smokes: String(row.smokes ?? ""),
          substanceDetails:
            typeof row.substanceDetails === "string" ? row.substanceDetails : null,
          drinksAlcohol: String(row.drinksAlcohol ?? ""),
          exercise: String(row.exercise ?? ""),
          wantChildren: String(row.wantChildren ?? ""),
          familyInvolvement:
            typeof row.familyInvolvement === "string" ? row.familyInvolvement : null,
          livingSituation:
            typeof row.livingSituation === "string" ? row.livingSituation : null,
          madhhab: typeof row.madhhab === "string" ? row.madhhab : null,
          polygynyOpenness:
            typeof row.polygynyOpenness === "string" ? row.polygynyOpenness : null,
          hasCurrentWife:
            typeof row.hasCurrentWife === "string" ? row.hasCurrentWife : null,
          openToSecondWife:
            typeof row.openToSecondWife === "string" ? row.openToSecondWife : null,
          acceptManWithWife:
            typeof row.acceptManWithWife === "string" ? row.acceptManWithWife : null,
          acceptPreviouslyMarriedMan:
            typeof row.acceptPreviouslyMarriedMan === "string"
              ? row.acceptPreviouslyMarriedMan
              : null,
          acceptFutureCoWife:
            typeof row.acceptFutureCoWife === "string"
              ? row.acceptFutureCoWife
              : null,
          languagesSpoken: stringArray(row.languagesSpoken),
          citizenshipStatus:
            typeof row.citizenshipStatus === "string" ? row.citizenshipStatus : null,
          financialReadiness:
            typeof row.financialReadiness === "string"
              ? row.financialReadiness
              : null,
          marriageWorkPreference:
            typeof row.marriageWorkPreference === "string"
              ? row.marriageWorkPreference
              : null,
          marriageTimeline: String(row.marriageTimeline ?? ""),
          readyToRelocate:
            typeof row.readyToRelocate === "string" ? row.readyToRelocate : null,
          loveLanguage:
            typeof row.loveLanguage === "string" ? row.loveLanguage : null,
          marrySomeoneWithChildren: String(row.marrySomeoneWithChildren ?? ""),
          qualities: stringArray(row.qualities),
          hobbies: stringArray(row.hobbies),
          questionnaireComplete: Boolean(row.questionnaireComplete),
          questionnaireStep:
            typeof row.questionnaireStep === "number" ? row.questionnaireStep : null,
          lastSavedAt: msToDate(row.lastSavedAt),
          registrationComplete:
            typeof row.registrationComplete === "boolean"
              ? row.registrationComplete
              : null,
          hasPaid: Boolean(row.hasPaid),
          genderLocked:
            typeof row.genderLocked === "boolean" ? row.genderLocked : null,
          trialEndsAt: msToDate(row.trialEndsAt),
          hasPersonalSupport:
            typeof row.hasPersonalSupport === "boolean"
              ? row.hasPersonalSupport
              : null,
          advisorReviewed:
            typeof row.advisorReviewed === "boolean" ? row.advisorReviewed : null,
          additionalImageConvexIds: stringArray(row.additionalImageIds),
          privateImageConvexIds: stringArray(row.privateImageIds),
          waliName: typeof row.waliName === "string" ? row.waliName : null,
          waliPhone: typeof row.waliPhone === "string" ? row.waliPhone : null,
          banned: Boolean(row.banned),
          approved: Boolean(row.approved),
          reviewStatus: asReviewStatus(row.reviewStatus),
          photoVisibility: asPhotoVisibility(row.photoVisibility),
          convexCreatedAt: msToDate(row._creationTime),
        };

        await prisma.profile.upsert({
          where: { convexId },
          create: createData,
          update: {
            // Do not invent blank profile behaviour — update mapped fields only
            name: preferExisting(existing?.name, createData.name) as string,
            bio: preferExisting(existing?.bio, createData.bio) as string,
            hasPaid: createData.hasPaid,
            banned: createData.banned,
            approved: createData.approved,
            reviewStatus: createData.reviewStatus ?? existing?.reviewStatus,
            questionnaireComplete: createData.questionnaireComplete,
            role: createData.role,
            profileImageConvexId: preferExisting(
              existing?.profileImageConvexId,
              createData.profileImageConvexId
            ) as string | null,
            additionalImageConvexIds:
              createData.additionalImageConvexIds.length > 0
                ? createData.additionalImageConvexIds
                : existing?.additionalImageConvexIds ?? [],
          },
        });
        if (existing) counts.updated.profiles++;
        else counts.inserted.profiles++;
      } catch (error) {
        counts.failed.push({
          table: "profiles",
          convexId,
          reason: error instanceof Error ? error.message : "upsert_failed",
        });
      }
    }

    // 4) preferences
    const prefsFile = await findTableJsonl(inputPath, "preferences");
    if (!prefsFile) throw new Error("preferences JSONL not found");
    for await (const row of readJsonl(prefsFile, limit)) {
      const convexId = typeof row._id === "string" ? row._id : null;
      const convexUserId = typeof row.userId === "string" ? row.userId : null;
      if (!convexId || !convexUserId) {
        counts.failed.push({ table: "preferences", reason: "missing_ids" });
        continue;
      }
      const userId = userByConvex.get(convexUserId);
      if (!userId) {
        counts.failed.push({
          table: "preferences",
          convexId,
          reason: "missing_user",
        });
        continue;
      }
      const preferredGender = asGender(row.preferredGender);
      if (!preferredGender) {
        counts.failed.push({
          table: "preferences",
          convexId,
          reason: "invalid_preferred_gender",
        });
        continue;
      }

      if (dryRun || !prisma) {
        counts.inserted.preferences++;
        continue;
      }

      try {
        const existing = await prisma.preference.findUnique({
          where: { convexId },
        });
        await prisma.preference.upsert({
          where: { convexId },
          create: {
            convexId,
            userId,
            convexUserId,
            preferredGender,
            minAge: Number(row.minAge ?? 18),
            maxAge: Number(row.maxAge ?? 60),
            minHeight: Number(row.minHeight ?? 150),
            maxHeight: Number(row.maxHeight ?? 210),
            minWeight: Number(row.minWeight ?? 45),
            maxWeight: Number(row.maxWeight ?? 150),
            preferredCountries: stringArray(row.preferredCountries),
            acceptChildren: String(row.acceptChildren ?? ""),
            educationLevel: String(row.educationLevel ?? ""),
            religiousLevel:
              typeof row.religiousLevel === "string" ? row.religiousLevel : null,
            acceptDivorcee: String(row.acceptDivorcee ?? ""),
            acceptWidow: String(row.acceptWidow ?? ""),
            maxDistance:
              typeof row.maxDistance === "string" ? row.maxDistance : null,
            qualities: stringArray(row.qualities),
            hobbies: stringArray(row.hobbies),
            partnerBeard:
              typeof row.partnerBeard === "string" ? row.partnerBeard : null,
            partnerHijabLevel:
              typeof row.partnerHijabLevel === "string"
                ? row.partnerHijabLevel
                : null,
            readyToRelocate:
              typeof row.readyToRelocate === "string" ? row.readyToRelocate : null,
            convexCreatedAt: msToDate(row._creationTime),
          },
          update: {
            preferredGender,
            minAge: Number(row.minAge ?? existing?.minAge ?? 18),
            maxAge: Number(row.maxAge ?? existing?.maxAge ?? 60),
          },
        });
        if (existing) counts.updated.preferences++;
        else counts.inserted.preferences++;
      } catch (error) {
        counts.failed.push({
          table: "preferences",
          convexId,
          reason: error instanceof Error ? error.message : "upsert_failed",
        });
      }
    }

    if (prisma && runId) {
      await prisma.migrationRun.update({
        where: { id: runId },
        data: {
          status: counts.failed.length ? "completed" : "completed",
          completedAt: new Date(),
          insertedCounts: counts.inserted,
          updatedCounts: counts.updated,
          skippedCounts: counts.skipped,
          failureCounts: { total: counts.failed.length },
          tableCounts: counts.inserted,
        },
      });
    }

    return {
      dryRun,
      runId,
      counts,
      report: {
        generatedAt: new Date().toISOString(),
        dryRun,
        inputPath,
        limit: limit ?? null,
        ...counts,
      },
    };
  } finally {
    if (prisma) await prisma.$disconnect();
  }
}
