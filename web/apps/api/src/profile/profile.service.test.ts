import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { ProfileService } from "./profile.service";

function baseProfile(over: Record<string, unknown> = {}) {
  return {
    id: "p1",
    userId: "u1",
    convexId: "cx_p1",
    convexUserId: "cx_u1",
    name: "Test User",
    gender: "male",
    age: 30,
    height: 180,
    weight: 80,
    country: "Somalia",
    city: "Hargeisa",
    education: "",
    occupation: "",
    religiousLevel: "",
    maritalStatus: "",
    children: 0,
    bio: "",
    verified: false,
    role: "user",
    phone: null,
    prayerFrequency: "",
    spousePrayerImportance: "",
    wearsHijab: null,
    hasBeard: null,
    smokes: "",
    substanceDetails: null,
    drinksAlcohol: "",
    exercise: "",
    wantChildren: "",
    familyInvolvement: null,
    livingSituation: null,
    madhhab: null,
    polygynyOpenness: null,
    hasCurrentWife: null,
    openToSecondWife: null,
    acceptManWithWife: null,
    acceptPreviouslyMarriedMan: null,
    acceptFutureCoWife: null,
    languagesSpoken: [],
    citizenshipStatus: null,
    financialReadiness: null,
    marriageWorkPreference: null,
    marriageTimeline: "",
    readyToRelocate: null,
    loveLanguage: null,
    marrySomeoneWithChildren: "",
    qualities: [],
    hobbies: [],
    questionnaireComplete: false,
    questionnaireStep: 0,
    lastSavedAt: null,
    registrationComplete: true,
    hasPaid: false,
    genderLocked: false,
    trialEndsAt: null,
    hasPersonalSupport: false,
    advisorReviewed: null,
    additionalImageConvexIds: [],
    additionalImageMediaIds: [],
    privateImageConvexIds: [],
    privateImageMediaIds: [],
    profileImageConvexId: null,
    profileImageMediaId: null,
    waliName: null,
    waliPhone: null,
    banned: false,
    approved: false,
    reviewStatus: "incomplete",
    photoVisibility: "everyone",
    convexCreatedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

describe("ProfileService behaviour (mocked prisma)", () => {
  it("ensure creates one profile and preferences", async () => {
    let profileCreates = 0;
    let prefCreates = 0;
    const prisma = {
      profile: {
        findUnique: async () => null,
        create: async ({ data }: { data: { userId: string } }) => {
          profileCreates += 1;
          return baseProfile({ userId: data.userId, id: "new-p" });
        },
        update: async ({ data }: { data: Record<string, unknown> }) =>
          baseProfile(data),
      },
      preference: {
        create: async () => {
          prefCreates += 1;
          return {};
        },
      },
      user: {
        findUnique: async () => ({
          id: "u1",
          convexId: "cx_u1",
          name: "No Profile",
          gender: null,
          phone: null,
        }),
      },
      profileAuditEvent: { create: async () => ({}) },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
    };
    const scoreStub = { enqueue: async () => {} };
    const svc = new ProfileService(prisma as never, scoreStub as never);
    const result = await svc.ensure("u1");
    assert.equal(profileCreates, 1);
    assert.equal(prefCreates, 1);
    assert.equal(result.userId, "u1");
  });

  it("concurrent ensure returns existing on unique conflict", async () => {
    let finds = 0;
    const prisma = {
      profile: {
        findUnique: async () => {
          finds += 1;
          if (finds === 1) return null;
          return baseProfile({ id: "existing" });
        },
        create: async () => {
          const err = new Error("Unique") as Error & { code: string };
          err.code = "P2002";
          throw err;
        },
      },
      preference: { create: async () => ({}) },
      user: {
        findUnique: async () => ({
          id: "u1",
          convexId: "cx",
          name: "X",
          gender: "male",
          phone: null,
        }),
      },
      profileAuditEvent: { create: async () => ({}) },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
    };
    const svc = new ProfileService(prisma as never, { enqueue: async () => {} } as never);
    const result = await svc.ensure("u1");
    assert.equal(result.id, "existing");
  });

  it("patch rejects staff-only fields", async () => {
    const prisma = {
      profile: {
        findUnique: async () => baseProfile({ hasPaid: true, approved: true }),
      },
      profileAuditEvent: { create: async () => ({}) },
    };
    const svc = new ProfileService(prisma as never, { enqueue: async () => {} } as never);
    await assert.rejects(
      () => svc.patchMe("u1", { hasPaid: false }),
      (e: unknown) => e instanceof ForbiddenException
    );
    await assert.rejects(() => svc.patchMe("u1", { role: "admin" }));
  });

  it("paid user cannot change locked gender via completeRegistrationGender", async () => {
    const prisma = {
      profile: {
        findUnique: async () =>
          baseProfile({ hasPaid: true, gender: "male", genderLocked: true }),
      },
    };
    const svc = new ProfileService(prisma as never, { enqueue: async () => {} } as never);
    await assert.rejects(() =>
      svc.completeRegistrationGender("u1", "female")
    );
  });

  it("unpaid user can complete gender", async () => {
    const prisma = {
      profile: {
        findUnique: async () =>
          baseProfile({ hasPaid: false, gender: "male", registrationComplete: false }),
        update: async ({ data }: { data: Record<string, unknown> }) =>
          baseProfile({ ...data, gender: "female", registrationComplete: true }),
      },
      user: { update: async () => ({}) },
      preference: { updateMany: async () => ({ count: 1 }) },
      profileAuditEvent: { create: async () => ({}) },
    };
    const svc = new ProfileService(prisma as never, { enqueue: async () => {} } as never);
    const result = await svc.completeRegistrationGender("u1", "female");
    assert.equal(result.gender, "female");
    assert.equal(result.registrationComplete, true);
  });

  it("ensure does not overwrite existing migrated profile", async () => {
    let creates = 0;
    const prisma = {
      profile: {
        findUnique: async () =>
          baseProfile({
            id: "migrated",
            name: "Migrated Name",
            questionnaireComplete: true,
          }),
        update: async () =>
          baseProfile({
            id: "migrated",
            name: "Migrated Name",
            questionnaireComplete: true,
          }),
        create: async () => {
          creates += 1;
          return baseProfile();
        },
      },
      profileAuditEvent: { create: async () => ({}) },
    };
    const svc = new ProfileService(prisma as never, { enqueue: async () => {} } as never);
    const result = await svc.ensure("u1");
    assert.equal(creates, 0);
    assert.equal(result.id, "migrated");
    assert.equal(result.name, "Migrated Name");
  });
});
