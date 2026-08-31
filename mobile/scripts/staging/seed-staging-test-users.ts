/**
 * Insert allowlisted staging E2E users (local/dev only).
 * Does NOT touch production. Passwords are fixed for automated tests.
 *
 * Usage: DATABASE_URL=… npx tsx scripts/staging/seed-staging-test-users.ts
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import * as argon2 from "argon2";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const apiRequire = createRequire(path.join(ROOT, "package.json"));
const { PrismaClient } = apiRequire("@prisma/client") as {
  PrismaClient: new () => import("@prisma/client").PrismaClient;
};

const ARGON2ID_PARAMS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
} as const;

/** Allowlisted staging accounts — never use in production. */
export const STAGING_TEST_USERS = [
  {
    email: "staging.e2e.member@hel.local",
    password: "StagingMember1!",
    role: "user" as const,
    name: "Staging Member",
    convexId: "staging_e2e_member",
  },
  {
    email: "staging.e2e.admin@hel.local",
    password: "StagingAdmin1!",
    role: "admin" as const,
    name: "Staging Admin",
    convexId: "staging_e2e_admin",
  },
  {
    email: "staging.e2e.owner@hel.local",
    password: "StagingOwner1!",
    role: "owner" as const,
    name: "Staging Owner",
    convexId: "staging_e2e_owner",
  },
  {
    email: "staging.owner@hel.local",
    password: "StagingOwner1!",
    role: "owner" as const,
    name: "Staging Owner",
    convexId: "staging_allow_owner",
  },
  {
    email: "staging.e2e.unpaid@hel.local",
    password: "StagingUnpaid1!",
    role: "user" as const,
    name: "Staging Unpaid",
    convexId: "staging_e2e_unpaid",
    hasPaid: false,
  },
] as const;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const prisma = new PrismaClient();

async function upsertUser(u: (typeof STAGING_TEST_USERS)[number]) {
  const emailNormalized = u.email.toLowerCase();
  const hash = await argon2.hash(u.password.normalize("NFKC"), {
    ...ARGON2ID_PARAMS,
  });
  const hasPaid = "hasPaid" in u ? Boolean(u.hasPaid) : true;
  const approved = u.role !== "user" || hasPaid;

  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ convexId: u.convexId }, { emailNormalized }],
    },
    include: { authAccounts: true, profile: true, preferences: true },
  });

  if (existing) {
    await prisma.authAccount.deleteMany({ where: { userId: existing.id } });
    await prisma.authAccount.create({
      data: {
        convexId: `staging_e2e_auth_${randomUUID()}`,
        userId: existing.id,
        convexUserId: u.convexId,
        provider: "password",
        providerAccountId: emailNormalized,
        passwordHash: hash,
        passwordAlgo: "argon2id",
      },
    });
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        email: emailNormalized,
        emailNormalized,
        name: u.name,
        mustResetPassword: false,
      },
    });
    if (existing.profile) {
      await prisma.profile.update({
        where: { userId: existing.id },
        data: {
          name: u.name,
          role: u.role,
          hasPaid,
          approved,
          banned: false,
          questionnaireComplete: hasPaid,
          registrationComplete: true,
          reviewStatus: approved ? "approved" : "incomplete",
        },
      });
    }
    console.log(`updated ${emailNormalized}`);
    return;
  }

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        convexId: u.convexId,
        email: emailNormalized,
        emailNormalized,
        name: u.name,
        gender: "male",
      },
    });
    await tx.authAccount.create({
      data: {
        convexId: `staging_e2e_auth_${randomUUID()}`,
        userId: user.id,
        convexUserId: u.convexId,
        provider: "password",
        providerAccountId: emailNormalized,
        passwordHash: hash,
        passwordAlgo: "argon2id",
      },
    });
    await tx.profile.create({
      data: {
        convexId: `staging_e2e_profile_${u.convexId}`,
        userId: user.id,
        convexUserId: u.convexId,
        name: u.name,
        gender: "male",
        age: 28,
        height: 175,
        weight: 70,
        country: "Somalia",
        city: "Mogadishu",
        education: "Bachelor",
        occupation: "Engineer",
        religiousLevel: "Practicing",
        maritalStatus: "Never married",
        children: 0,
        bio: "Staging fixture user",
        verified: false,
        role: u.role,
        prayerFrequency: "Always",
        spousePrayerImportance: "Important",
        smokes: "No",
        drinksAlcohol: "No",
        exercise: "Sometimes",
        wantChildren: "Yes",
        marriageTimeline: "Within a year",
        marrySomeoneWithChildren: "Depends",
        languagesSpoken: ["Somali", "English"],
        qualities: [],
        hobbies: [],
        questionnaireComplete: hasPaid,
        questionnaireStep: hasPaid ? 10 : 0,
        registrationComplete: true,
        hasPaid,
        banned: false,
        approved,
        reviewStatus: approved ? "approved" : "incomplete",
        photoVisibility: "everyone",
      },
    });
    await tx.preference.create({
      data: {
        convexId: `staging_e2e_pref_${u.convexId}`,
        userId: user.id,
        convexUserId: u.convexId,
        preferredGender: "female",
        minAge: 18,
        maxAge: 45,
        minHeight: 150,
        maxHeight: 210,
        preferredCountries: ["Somalia"],
        acceptChildren: "Depends",
        educationLevel: "Bachelor",
        acceptDivorcee: "Depends",
        acceptWidow: "Depends",
        qualities: [],
        hobbies: [],
        partnerBeard: "",
        partnerHijabLevel: "",
      },
    });
  });
  console.log(`created ${emailNormalized}`);
}

async function main() {
  for (const u of STAGING_TEST_USERS) {
    await upsertUser(u);
  }
  console.log(
    JSON.stringify(
      {
        policy: "allowlisted staging test accounts only",
        users: STAGING_TEST_USERS.map((u) => ({
          email: u.email,
          role: u.role,
          passwordHint: "(see STAGING_TEST_USERS in seed script)",
        })),
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
