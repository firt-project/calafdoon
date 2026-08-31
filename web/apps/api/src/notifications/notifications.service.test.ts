import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NotificationsService } from "./notifications.service";

const VIEWER = "viewer-user-id";
const ACTOR = "actor-user-id";
const MEDIA = "media-uuid-1";

function notif(over: Record<string, unknown> = {}) {
  return {
    id: "n1",
    convexId: "c1",
    type: "like",
    title: "New like",
    body: "Someone liked you",
    read: false,
    relatedUserId: ACTOR,
    notificationCreatedAt: new Date("2026-01-01T00:00:00.000Z"),
    sourceKey: "like:1",
    userId: VIEWER,
    ...over,
  };
}

function makeService(opts: {
  photoVisibility?: string;
  banned?: boolean;
  hasMatch?: boolean;
  viewerRole?: "user" | "admin" | "owner";
  relatedUserId?: string | null;
  profileMissing?: boolean;
  signThrows?: boolean;
  type?: string;
}) {
  let signedCalls = 0;
  const relatedId =
    opts.relatedUserId === undefined ? ACTOR : opts.relatedUserId;

  const prisma = {
    notification: {
      findMany: async () => [
        notif({
          relatedUserId: relatedId,
          type: opts.type ?? "like",
        }),
      ],
    },
    profile: {
      findUnique: async ({ where }: { where: { userId: string } }) => {
        if (where.userId === VIEWER) {
          return { userId: VIEWER, role: opts.viewerRole ?? "user" };
        }
        return null;
      },
      findMany: async () => {
        if (opts.profileMissing || !relatedId) return [];
        return [
          {
            userId: relatedId,
            banned: opts.banned ?? false,
            photoVisibility: opts.photoVisibility ?? "everyone",
            profileImageMediaId: MEDIA,
            profileImageConvexId: null,
          },
        ];
      },
    },
    match: {
      findMany: async () =>
        opts.hasMatch
          ? [{ userAId: VIEWER, userBId: ACTOR }]
          : [],
    },
    mediaObject: {
      findUnique: async () => ({ id: MEDIA }),
    },
  };

  const redis = {
    connect: async () => false,
    client: null,
  };

  const media = {
    createSignedDownloadUrl: async () => {
      signedCalls += 1;
      if (opts.signThrows) throw new Error("denied");
      return { url: "https://cdn.example/signed-avatar", expiresInSeconds: 300 };
    },
  };

  const realtime = { emitToUser: () => undefined };

  const svc = new NotificationsService(
    prisma as never,
    redis as never,
    media as never,
    realtime as never
  );

  return {
    svc,
    signedCalls: () => signedCalls,
  };
}

describe("NotificationsService list avatars (M8)", () => {
  it("everyone visibility returns avatar and signs once", async () => {
    const { svc, signedCalls } = makeService({ photoVisibility: "everyone" });
    const res = await svc.list(VIEWER);
    assert.equal(res.items[0]!.relatedImageUrl, "https://cdn.example/signed-avatar");
    assert.equal(signedCalls(), 1);
  });

  it("matches visibility without active match returns null and does not sign", async () => {
    const { svc, signedCalls } = makeService({
      photoVisibility: "matches",
      hasMatch: false,
    });
    const res = await svc.list(VIEWER);
    assert.equal(res.items[0]!.relatedImageUrl, null);
    assert.equal(signedCalls(), 0);
  });

  it("matches visibility with active match returns avatar", async () => {
    const { svc, signedCalls } = makeService({
      photoVisibility: "matches",
      hasMatch: true,
    });
    const res = await svc.list(VIEWER);
    assert.equal(res.items[0]!.relatedImageUrl, "https://cdn.example/signed-avatar");
    assert.equal(signedCalls(), 1);
  });

  it("private visibility returns null and does not sign", async () => {
    const { svc, signedCalls } = makeService({ photoVisibility: "private" });
    const res = await svc.list(VIEWER);
    assert.equal(res.items[0]!.relatedImageUrl, null);
    assert.equal(signedCalls(), 0);
  });

  it("banned actor returns null and does not sign", async () => {
    const { svc, signedCalls } = makeService({
      photoVisibility: "everyone",
      banned: true,
    });
    const res = await svc.list(VIEWER);
    assert.equal(res.items[0]!.relatedImageUrl, null);
    assert.equal(signedCalls(), 0);
  });

  it("missing related profile returns null", async () => {
    const { svc, signedCalls } = makeService({
      photoVisibility: "everyone",
      profileMissing: true,
    });
    const res = await svc.list(VIEWER);
    assert.equal(res.items[0]!.relatedImageUrl, null);
    assert.equal(signedCalls(), 0);
  });

  it("staff can see private avatar", async () => {
    const { svc, signedCalls } = makeService({
      photoVisibility: "private",
      viewerRole: "admin",
    });
    const res = await svc.list(VIEWER);
    assert.equal(res.items[0]!.relatedImageUrl, "https://cdn.example/signed-avatar");
    assert.equal(signedCalls(), 1);
  });

  it("payment notification without relatedUserId has null avatar", async () => {
    const { svc, signedCalls } = makeService({
      relatedUserId: null,
      type: "payment",
    });
    const res = await svc.list(VIEWER);
    assert.equal(res.items[0]!.type, "payment");
    assert.equal(res.items[0]!.relatedImageUrl, null);
    assert.equal(signedCalls(), 0);
  });

  it("announcement without relatedUserId has null avatar", async () => {
    const { svc, signedCalls } = makeService({
      relatedUserId: null,
      type: "announcement",
    });
    const res = await svc.list(VIEWER);
    assert.equal(res.items[0]!.relatedImageUrl, null);
    assert.equal(signedCalls(), 0);
  });

  it("keeps relatedImageUrl field as null when sign fails after allow", async () => {
    const { svc, signedCalls } = makeService({
      photoVisibility: "everyone",
      signThrows: true,
    });
    const res = await svc.list(VIEWER);
    assert.equal(res.items[0]!.relatedImageUrl, null);
    assert.equal(signedCalls(), 1);
    assert.equal("relatedImageUrl" in res.items[0]!, true);
    assert.equal(JSON.stringify(res.items[0]).includes("objectKey"), false);
    assert.equal(JSON.stringify(res.items[0]).includes(MEDIA), false);
  });

  it("does not expose mediaId when avatar denied", async () => {
    const { svc } = makeService({ photoVisibility: "private" });
    const res = await svc.list(VIEWER);
    const json = JSON.stringify(res.items[0]);
    assert.equal(json.includes(MEDIA), false);
    assert.equal(json.includes("signed"), false);
    assert.equal(res.items[0]!.relatedImageUrl, null);
  });
});
