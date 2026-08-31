import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { MediaAccessService } from "./media-access.service";

const OWNER = "owner-user-id";
const VIEWER = "viewer-user-id";
const MEDIA_ID = "media-uuid-1";

function baseMedia(over: Record<string, unknown> = {}) {
  return {
    id: MEDIA_ID,
    bucket: "hel-media",
    objectKey: `${OWNER}/main.jpg`,
    contentType: "image/jpeg",
    purpose: "profile_main",
    ownerUserId: OWNER,
    ...over,
  };
}

function makeService(opts: {
  media?: Record<string, unknown> | null;
  profile?: {
    userId: string;
    banned: boolean;
    photoVisibility: string;
  } | null;
  hasMatch?: boolean;
  /** When true, media is registered in orphaned_media_objects (deleted member). */
  orphaned?: boolean;
}) {
  const prisma = {
    mediaObject: {
      findUnique: async () =>
        opts.media === undefined ? baseMedia() : opts.media,
    },
    orphanedMediaObject: {
      findFirst: async () => (opts.orphaned ? { id: "orphan-1" } : null),
    },
    profile: {
      findUnique: async () =>
        opts.profile === undefined
          ? {
              userId: OWNER,
              banned: false,
              photoVisibility: "everyone",
            }
          : opts.profile,
    },
    match: {
      findFirst: async () => (opts.hasMatch ? { id: "match-1" } : null),
    },
    message: {
      findFirst: async () => null,
    },
  };
  const config = {
    get: (key: string) => {
      const map: Record<string, string> = {
        S3_ENDPOINT: "http://127.0.0.1:9000",
        S3_REGION: "us-east-1",
        S3_ACCESS_KEY_ID: "test",
        S3_SECRET_ACCESS_KEY: "test",
        S3_SIGNED_URL_TTL_SECONDS: "300",
        S3_FORCE_PATH_STYLE: "true",
      };
      return map[key];
    },
  };
  return new MediaAccessService(prisma as never, config as never);
}

describe("MediaAccessService.assertCanAccess profile gallery (H1)", () => {
  it("allows the media owner", async () => {
    const svc = makeService({
      profile: {
        userId: OWNER,
        banned: false,
        photoVisibility: "private",
      },
    });
    const result = await svc.assertCanAccess(MEDIA_ID, {
      userId: OWNER,
      roles: ["user"],
    });
    assert.equal(result.bucket, "hel-media");
    assert.equal(result.purpose, "profile_main");
  });

  it("allows staff regardless of photoVisibility", async () => {
    const svc = makeService({
      profile: {
        userId: OWNER,
        banned: false,
        photoVisibility: "private",
      },
      hasMatch: false,
    });
    const result = await svc.assertCanAccess(MEDIA_ID, {
      userId: VIEWER,
      roles: ["admin"],
    });
    assert.equal(result.objectKey, `${OWNER}/main.jpg`);
  });

  it("allows any authenticated viewer when visibility is everyone", async () => {
    const svc = makeService({
      profile: {
        userId: OWNER,
        banned: false,
        photoVisibility: "everyone",
      },
      hasMatch: false,
    });
    const result = await svc.assertCanAccess(MEDIA_ID, {
      userId: VIEWER,
      roles: ["user"],
    });
    assert.equal(result.purpose, "profile_main");
  });

  it("allows matched viewer when visibility is matches", async () => {
    const svc = makeService({
      profile: {
        userId: OWNER,
        banned: false,
        photoVisibility: "matches",
      },
      hasMatch: true,
    });
    const result = await svc.assertCanAccess(MEDIA_ID, {
      userId: VIEWER,
      roles: ["user"],
    });
    assert.equal(result.bucket, "hel-media");
  });

  it("denies unmatched viewer when visibility is matches (IDOR)", async () => {
    const svc = makeService({
      profile: {
        userId: OWNER,
        banned: false,
        photoVisibility: "matches",
      },
      hasMatch: false,
    });
    await assert.rejects(
      () =>
        svc.assertCanAccess(MEDIA_ID, {
          userId: VIEWER,
          roles: ["user"],
        }),
      (err: unknown) => {
        assert.ok(err instanceof ForbiddenException);
        assert.match(String((err as ForbiddenException).message), /visibility/i);
        return true;
      }
    );
  });

  it("denies non-owner when visibility is private", async () => {
    const svc = makeService({
      profile: {
        userId: OWNER,
        banned: false,
        photoVisibility: "private",
      },
      hasMatch: true,
    });
    await assert.rejects(
      () =>
        svc.assertCanAccess(MEDIA_ID, {
          userId: VIEWER,
          roles: ["user"],
        }),
      ForbiddenException
    );
  });

  it("returns not found for missing media", async () => {
    const svc = makeService({ media: null });
    await assert.rejects(
      () =>
        svc.assertCanAccess(MEDIA_ID, {
          userId: VIEWER,
          roles: ["user"],
        }),
      NotFoundException
    );
  });

  it("returns not found for banned owner photos to non-staff", async () => {
    const svc = makeService({
      profile: {
        userId: OWNER,
        banned: true,
        photoVisibility: "everyone",
      },
    });
    await assert.rejects(
      () =>
        svc.assertCanAccess(MEDIA_ID, {
          userId: VIEWER,
          roles: ["user"],
        }),
      NotFoundException
    );
  });

  it("applies the same rules to profile_additional", async () => {
    const svc = makeService({
      media: baseMedia({ purpose: "profile_additional" }),
      profile: {
        userId: OWNER,
        banned: false,
        photoVisibility: "matches",
      },
      hasMatch: false,
    });
    await assert.rejects(
      () =>
        svc.assertCanAccess(MEDIA_ID, {
          userId: VIEWER,
          roles: ["user"],
        }),
      ForbiddenException
    );
  });

  it("does not weaken chat_image authorization", async () => {
    const svc = makeService({
      media: baseMedia({ purpose: "chat_image", ownerUserId: OWNER }),
    });
    await assert.rejects(
      () =>
        svc.assertCanAccess(MEDIA_ID, {
          userId: VIEWER,
          roles: ["user"],
          conversationIds: [],
        }),
      ForbiddenException
    );
  });
});

describe("MediaAccessService deleted / orphaned media (H2)", () => {
  it("denies gallery media with null owner (404, anti-enumeration)", async () => {
    const svc = makeService({
      media: baseMedia({ ownerUserId: null }),
    });
    await assert.rejects(
      () =>
        svc.assertCanAccess(MEDIA_ID, {
          userId: VIEWER,
          roles: ["user"],
        }),
      NotFoundException
    );
  });

  it("denies staff for gallery media with null owner", async () => {
    const svc = makeService({
      media: baseMedia({ ownerUserId: null }),
    });
    await assert.rejects(
      () =>
        svc.assertCanAccess(MEDIA_ID, {
          userId: VIEWER,
          roles: ["admin"],
        }),
      NotFoundException
    );
  });

  it("denies when media is registered in orphaned_media_objects", async () => {
    const svc = makeService({
      orphaned: true,
      profile: {
        userId: OWNER,
        banned: false,
        photoVisibility: "everyone",
      },
    });
    await assert.rejects(
      () =>
        svc.assertCanAccess(MEDIA_ID, {
          userId: VIEWER,
          roles: ["user"],
        }),
      NotFoundException
    );
  });

  it("denies staff when media is in orphaned_media_objects", async () => {
    const svc = makeService({ orphaned: true });
    await assert.rejects(
      () =>
        svc.assertCanAccess(MEDIA_ID, {
          userId: VIEWER,
          roles: ["owner"],
        }),
      NotFoundException
    );
  });

  it("denies orphaned chat_image even for staff (deleted member)", async () => {
    const svc = makeService({
      media: baseMedia({ purpose: "chat_image", ownerUserId: null }),
      orphaned: true,
    });
    await assert.rejects(
      () =>
        svc.assertCanAccess(MEDIA_ID, {
          userId: VIEWER,
          roles: ["admin"],
          conversationIds: ["any"],
        }),
      NotFoundException
    );
  });

  it("denies orphaned private / EVC purposes for all roles", async () => {
    for (const purpose of ["profile_private", "evc_screenshot"] as const) {
      const svc = makeService({
        media: baseMedia({ purpose, ownerUserId: null }),
        orphaned: true,
      });
      await assert.rejects(
        () =>
          svc.assertCanAccess(MEDIA_ID, {
            userId: VIEWER,
            roles: ["admin"],
          }),
        NotFoundException
      );
    }
  });

  it("cannot createSignedDownloadUrl after orphan registration", async () => {
    const svc = makeService({ orphaned: true });
    await assert.rejects(
      () =>
        svc.createSignedDownloadUrl(MEDIA_ID, {
          userId: OWNER,
          roles: ["user"],
        }),
      NotFoundException
    );
  });

  it("denies missing profile with surviving owned gallery media", async () => {
    const svc = makeService({
      profile: null,
    });
    await assert.rejects(
      () =>
        svc.assertCanAccess(MEDIA_ID, {
          userId: VIEWER,
          roles: ["user"],
        }),
      NotFoundException
    );
  });

  it("invalid media id does not produce opaque non-HTTP errors", async () => {
    const svc = makeService({ media: null });
    await assert.rejects(
      () =>
        svc.assertCanAccess("not-a-real-id", {
          userId: VIEWER,
          roles: ["user"],
        }),
      (err: unknown) => err instanceof NotFoundException
    );
  });

  it("active owned gallery media still accessible after H2 checks", async () => {
    const svc = makeService({
      orphaned: false,
      profile: {
        userId: OWNER,
        banned: false,
        photoVisibility: "everyone",
      },
    });
    const result = await svc.assertCanAccess(MEDIA_ID, {
      userId: OWNER,
      roles: ["user"],
    });
    assert.equal(result.purpose, "profile_main");
  });

  it("authorized viewer still allowed when not orphaned", async () => {
    const svc = makeService({
      orphaned: false,
      hasMatch: true,
      profile: {
        userId: OWNER,
        banned: false,
        photoVisibility: "matches",
      },
    });
    const result = await svc.assertCanAccess(MEDIA_ID, {
      userId: VIEWER,
      roles: ["user"],
    });
    assert.equal(result.bucket, "hel-media");
  });

  it("banned-owner behavior remains consistent with H1", async () => {
    const svc = makeService({
      orphaned: false,
      profile: {
        userId: OWNER,
        banned: true,
        photoVisibility: "everyone",
      },
    });
    await assert.rejects(
      () =>
        svc.assertCanAccess(MEDIA_ID, {
          userId: VIEWER,
          roles: ["user"],
        }),
      NotFoundException
    );
    // Staff may still view non-orphaned banned-owner gallery (H1 policy).
    const staffOk = await svc.assertCanAccess(MEDIA_ID, {
      userId: VIEWER,
      roles: ["admin"],
    });
    assert.equal(staffOk.purpose, "profile_main");
  });
});
