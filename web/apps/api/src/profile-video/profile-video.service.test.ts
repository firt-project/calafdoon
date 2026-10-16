import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "../auth/auth.guards";
import { ProfileVideoController, BunnyStreamWebhookController } from "./profile-video.controller";
import { AppOnlyGuard } from "./app-only.guard";
import { ProfileVideoService } from "./profile-video.service";
import type { BunnyVideo } from "./bunny-stream.client";

/* ───────── in-memory Prisma double (only what the service touches) ───────── */

type VRow = {
  id: string;
  userId: string;
  bunnyVideoId: string;
  status: string;
  isActive: boolean;
  durationSec: number | null;
  encodeProgress: number;
  failureReason: string | null;
  expiresAt: Date | null;
  lastCheckedAt: Date | null;
  readyAt: Date | null;
  createdAt: Date;
};

const PENDING = ["created", "uploading", "processing"];

function matches(row: Record<string, unknown>, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([k, cond]) => {
    if (k === "NOT") return !matches(row, cond as Record<string, unknown>);
    if (k === "OR") return (cond as Record<string, unknown>[]).some((c) => matches(row, c));
    const v = row[k];
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      const c = cond as Record<string, unknown>;
      if ("in" in c) return (c.in as unknown[]).includes(v);
      if ("lt" in c) return (v as Date) < (c.lt as Date);
      if ("lte" in c) return (v as Date) <= (c.lte as Date);
      if ("gt" in c) return (v as Date) > (c.gt as Date);
      return false;
    }
    return v === cond;
  });
}

function makeDb() {
  const state = {
    videos: [] as VRow[],
    cleanup: new Map<string, { bunnyVideoId: string; attempts: number; nextAttemptAt: Date }>(),
    profiles: new Map<string, Record<string, unknown>>(),
    blocks: [] as Array<{ blockerId: string; blockedId: string }>,
    matches: [] as Array<{ userAId: string; userBId: string; status: string }>,
  };
  let seq = 0;
  const uniq = (row: Partial<VRow>, ignoreId?: string) => {
    for (const v of state.videos) {
      if (v.id === ignoreId) continue;
      if (v.userId === row.userId && row.isActive && v.isActive) return true;
      if (v.userId === row.userId && PENDING.includes(String(row.status)) && PENDING.includes(v.status)) return true;
      if (row.bunnyVideoId && v.bunnyVideoId === row.bunnyVideoId) return true;
    }
    return false;
  };
  const p2002 = () => Object.assign(new Error("Unique constraint"), { code: "P2002" });
  const prisma: Record<string, unknown> = {
    profile: {
      findUnique: async ({ where }: { where: { userId: string } }) => state.profiles.get(where.userId) ?? null,
    },
    block: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        state.blocks.find((b) => matches(b, where)) ?? null,
    },
    match: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        state.matches.find((m) => matches(m, where)) ?? null,
    },
    profileVideo: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        state.videos.find((v) => matches(v, where)) ?? null,
      findMany: async ({ where, orderBy, take }: { where?: Record<string, unknown>; orderBy?: unknown; take?: number }) => {
        let rows = state.videos.filter((v) => matches(v, where));
        if (orderBy) rows = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return take ? rows.slice(0, take) : rows;
      },
      findUnique: async ({ where }: { where: { id?: string; bunnyVideoId?: string } }) =>
        state.videos.find((v) => (where.id ? v.id === where.id : v.bunnyVideoId === where.bunnyVideoId)) ?? null,
      create: async ({ data }: { data: Partial<VRow> }) => {
        if (uniq(data)) throw p2002();
        const row: VRow = {
          id: `v${++seq}`,
          userId: data.userId!,
          bunnyVideoId: data.bunnyVideoId!,
          status: data.status ?? "created",
          isActive: false,
          durationSec: null,
          encodeProgress: 0,
          failureReason: null,
          expiresAt: data.expiresAt ?? null,
          lastCheckedAt: null,
          readyAt: null,
          createdAt: new Date(Date.now() + seq),
        };
        state.videos.push(row);
        return row;
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<VRow> }) => {
        const rows = state.videos.filter((v) => matches(v, where));
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<VRow> }) => {
        const row = state.videos.find((v) => v.id === where.id)!;
        if (data.isActive && uniq({ ...row, ...data }, row.id)) throw p2002();
        Object.assign(row, data);
        return row;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        state.videos = state.videos.filter((v) => v.id !== where.id);
      },
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        const before = state.videos.length;
        state.videos = state.videos.filter((v) => !matches(v, where));
        return { count: before - state.videos.length };
      },
    },
    bunnyVideoCleanup: {
      upsert: async ({ where, create }: { where: { bunnyVideoId: string }; create: { bunnyVideoId: string } }) => {
        if (!state.cleanup.has(where.bunnyVideoId)) {
          state.cleanup.set(where.bunnyVideoId, { ...create, attempts: 0, nextAttemptAt: new Date(0) });
        }
      },
      findMany: async () => [...state.cleanup.values()],
      deleteMany: async ({ where }: { where: { bunnyVideoId: string } }) => {
        state.cleanup.delete(where.bunnyVideoId);
      },
      update: async ({ where, data }: { where: { bunnyVideoId: string }; data: { attempts: number; nextAttemptAt: Date } }) => {
        Object.assign(state.cleanup.get(where.bunnyVideoId)!, data);
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  };
  return { state, prisma };
}

function makeBunny() {
  const calls = { created: [] as string[], deleted: [] as string[] };
  const videos = new Map<string, BunnyVideo | null>();
  let n = 0;
  let failDelete = false;
  const bunny = {
    configured: true,
    webhookConfigured: true,
    getLibraryId: () => "12345",
    createVideo: async () => {
      const id = `bunny-${++n}`;
      calls.created.push(id);
      videos.set(id, { guid: id, status: 0, length: 0, encodeProgress: 0, storageSize: 0, availableResolutions: null });
      return id;
    },
    getVideo: async (id: string) => (videos.has(id) ? videos.get(id)! : null),
    deleteVideo: async (id: string) => {
      if (failDelete) return false;
      calls.deleted.push(id);
      return true;
    },
    signUpload: (id: string) => ({ endpoint: "tus", videoId: id, libraryId: "12345", expire: 9, signature: "sig" }),
    playerHosts: () => ["player.mediadelivery.net", "iframe.mediadelivery.net"],
    probeStatus: {} as Record<string, number | null>,
    probePlayer: async (url: string) => {
      const host = new URL(url).host;
      return host in bunny.probeStatus ? bunny.probeStatus[host]! : 200;
    },
    playbackUrl: (id: string, _now?: number, host = "player.mediadelivery.net") => ({
      url: `https://${host}/embed/12345/${id}`,
      expiresAt: 1,
      host,
    }),
  };
  return {
    bunny,
    calls,
    setVideo: (id: string, v: Partial<BunnyVideo>) =>
      videos.set(id, { guid: id, status: 0, length: 0, encodeProgress: 0, storageSize: 1000, availableResolutions: null, ...videos.get(id), ...v }),
    failDeletes: (v: boolean) => (failDelete = v),
  };
}

const approved = (extra: Record<string, unknown> = {}) => ({
  role: "user",
  banned: false,
  hasPaid: true,
  questionnaireComplete: true,
  approved: true,
  reviewStatus: "approved",
  photoVisibility: "everyone",
  ...extra,
});

const OK_UPLOAD = { contentType: "video/mp4", sizeBytes: 5_000_000, durationSec: 20 };

describe("ProfileVideoService", () => {
  let db: ReturnType<typeof makeDb>;
  let b: ReturnType<typeof makeBunny>;
  let svc: ProfileVideoService;

  beforeEach(() => {
    db = makeDb();
    b = makeBunny();
    db.state.profiles.set("alice", approved());
    db.state.profiles.set("bob", approved());
    svc = new ProfileVideoService(db.prisma as never, b.bunny as never);
  });

  async function uploadAndFinish(user: string, video: Partial<BunnyVideo>) {
    const auth = await svc.requestUpload(user, OK_UPLOAD);
    b.setVideo(auth.videoId, { status: 4, encodeProgress: 100, length: 20, ...video });
    await svc.confirmUpload(user);
    return auth;
  }

  it("issues short-lived direct-upload credentials without the API key", async () => {
    const auth = await svc.requestUpload("alice", OK_UPLOAD);
    assert.equal(auth.videoId, "bunny-1");
    assert.equal(auth.libraryId, "12345");
    assert.equal(auth.maxDurationSec, 30);
    assert.equal(auth.resumed, false);
    assert.equal(db.state.videos.length, 1);
    assert.equal(db.state.videos[0]!.userId, "alice"); // owner comes from the session, never the body
  });

  it("rejects unsupported types, oversized files and clips over 30 s", async () => {
    await assert.rejects(svc.requestUpload("alice", { ...OK_UPLOAD, contentType: "image/png" }), BadRequestException);
    await assert.rejects(svc.requestUpload("alice", { ...OK_UPLOAD, contentType: "application/octet-stream" }), BadRequestException);
    await assert.rejects(svc.requestUpload("alice", { ...OK_UPLOAD, sizeBytes: 999_000_000 }), BadRequestException);
    await assert.rejects(svc.requestUpload("alice", { ...OK_UPLOAD, durationSec: 31 }), BadRequestException);
    assert.equal(b.calls.created.length, 0, "nothing is created at Bunny for rejected requests");
  });

  it("refuses banned members and members without a profile", async () => {
    db.state.profiles.set("eve", approved({ banned: true }));
    await assert.rejects(svc.requestUpload("eve", OK_UPLOAD), ForbiddenException);
    await assert.rejects(svc.requestUpload("ghost", OK_UPLOAD), ForbiddenException);
  });

  it("is a clear 503 when Bunny is not configured", async () => {
    b.bunny.getLibraryId = () => {
      throw new ServiceUnavailableException("not configured");
    };
    await assert.rejects(svc.requestUpload("alice", OK_UPLOAD), ServiceUnavailableException);
  });

  it("repeated requests resume the same pending video instead of creating duplicates", async () => {
    const first = await svc.requestUpload("alice", OK_UPLOAD);
    const second = await svc.requestUpload("alice", OK_UPLOAD);
    assert.equal(second.resumed, true);
    assert.equal(second.videoId, first.videoId);
    assert.equal(b.calls.created.length, 1);
    assert.equal(db.state.videos.length, 1);
  });

  it("concurrent requests end with one pending row; the loser's Bunny video is cleaned up", async () => {
    const [a1, a2] = await Promise.all([svc.requestUpload("alice", OK_UPLOAD), svc.requestUpload("alice", OK_UPLOAD)]);
    assert.equal(db.state.videos.length, 1);
    assert.equal(a1.videoId, a2.videoId);
    assert.equal(b.calls.created.length, 2);
    const orphan = b.calls.created.find((id) => id !== a1.videoId)!;
    assert.ok(db.state.cleanup.has(orphan));
  });

  it("is blocked while the previous video is still processing", async () => {
    const auth = await svc.requestUpload("alice", OK_UPLOAD);
    b.setVideo(auth.videoId, { status: 3, encodeProgress: 40 });
    await svc.confirmUpload("alice");
    await assert.rejects(svc.requestUpload("alice", OK_UPLOAD), ConflictException);
  });

  it("shows processing, never ready, until Bunny finishes", async () => {
    const auth = await svc.requestUpload("alice", OK_UPLOAD);
    b.setVideo(auth.videoId, { status: 3, encodeProgress: 55 });
    const { video } = await svc.confirmUpload("alice");
    assert.equal(video.status, "processing");
    assert.equal(video.progress, 55);
    const status = await svc.getMyStatus("alice");
    assert.equal(status.active, null);
    assert.equal(status.pending?.status, "processing");
    await assert.rejects(svc.getPlayback("bob", "alice"), NotFoundException);
  });

  it("promotes a finished video to the single active video", async () => {
    await uploadAndFinish("alice", {});
    const status = await svc.getMyStatus("alice");
    assert.equal(status.active?.status, "ready");
    assert.equal(status.active?.durationSec, 20);
    assert.equal(status.pending, null);
    assert.equal(db.state.videos.filter((v) => v.isActive).length, 1);
  });

  it("rejects and deletes a video longer than 30 s (server-side check)", async () => {
    const auth = await uploadAndFinish("alice", { length: 95 });
    const status = await svc.getMyStatus("alice");
    assert.equal(status.active, null);
    assert.match(status.lastFailure!.reason, /longer than 30/);
    assert.ok(db.state.cleanup.has(auth.videoId) || b.calls.deleted.includes(auth.videoId));
  });

  it("allows only one second of rounding tolerance", async () => {
    await uploadAndFinish("alice", { length: 31 });
    assert.equal((await svc.getMyStatus("alice")).active?.status, "ready");
    await uploadAndFinish("bob", { length: 32 });
    assert.equal((await svc.getMyStatus("bob")).active, null);
  });

  it("marks failed encodes as failed and schedules deletion", async () => {
    const auth = await svc.requestUpload("alice", OK_UPLOAD);
    b.setVideo(auth.videoId, { status: 5 });
    await svc.confirmUpload("alice");
    const status = await svc.getMyStatus("alice");
    assert.equal(status.active, null);
    assert.ok(status.lastFailure);
    assert.ok(db.state.cleanup.has(auth.videoId) || b.calls.deleted.includes(auth.videoId));
  });

  it("replacement keeps the old video until the new one is ready, then removes it", async () => {
    const first = await uploadAndFinish("alice", {});
    const second = await svc.requestUpload("alice", OK_UPLOAD);
    // While the new one is processing the old one is still the active video.
    b.setVideo(second.videoId, { status: 3, encodeProgress: 10 });
    await svc.confirmUpload("alice");
    assert.equal((await svc.getMyStatus("alice")).active?.status, "ready");
    // New one finishes: old one is deleted from Bunny and the DB.
    b.setVideo(second.videoId, { status: 4, length: 12 });
    await svc.confirmUpload("alice");
    await new Promise((r) => setTimeout(r, 5));
    const rows = db.state.videos.filter((v) => v.userId === "alice");
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.bunnyVideoId, second.videoId);
    assert.equal(rows[0]!.isActive, true);
    assert.ok(b.calls.deleted.includes(first.videoId) || db.state.cleanup.has(first.videoId));
  });

  it("a failed replacement never costs the member their existing video", async () => {
    const first = await uploadAndFinish("alice", {});
    const second = await svc.requestUpload("alice", OK_UPLOAD);
    b.setVideo(second.videoId, { status: 5 });
    await svc.confirmUpload("alice");
    const status = await svc.getMyStatus("alice");
    assert.equal(status.active?.status, "ready");
    assert.ok(!b.calls.deleted.includes(first.videoId));
    assert.ok(!db.state.cleanup.has(first.videoId));
  });

  it("webhook ignores unknown videos and other libraries; repeats are safe", async () => {
    const auth = await svc.requestUpload("alice", OK_UPLOAD);
    assert.deepEqual(await svc.handleWebhook({ videoLibraryId: 12345, videoGuid: "nope" }), { handled: false });
    assert.deepEqual(await svc.handleWebhook({ videoLibraryId: 999, videoGuid: auth.videoId }), { handled: false });
    assert.deepEqual(await svc.handleWebhook({}), { handled: false });
    b.setVideo(auth.videoId, { status: 4, length: 10 });
    assert.deepEqual(await svc.handleWebhook({ videoLibraryId: 12345, videoGuid: auth.videoId }), { handled: true });
    assert.deepEqual(await svc.handleWebhook({ videoLibraryId: 12345, videoGuid: auth.videoId }), { handled: true });
    assert.equal(db.state.videos.length, 1, "no duplicate records");
    assert.equal(db.state.videos[0]!.status, "ready");
  });

  it("delete only touches the caller's own video", async () => {
    await uploadAndFinish("alice", {});
    await uploadAndFinish("bob", {});
    const removed = await svc.removeAllForUser("alice");
    assert.equal(removed.length, 1);
    assert.equal(db.state.videos.filter((v) => v.userId === "alice").length, 0);
    assert.equal(db.state.videos.filter((v) => v.userId === "bob").length, 1);
    assert.equal((await svc.getMyStatus("bob")).active?.status, "ready");
  });

  it("cleanup retries failed Bunny deletes and drops confirmed ones", async () => {
    await db.prisma.bunnyVideoCleanup && (await svc.queueCleanup("old-1"));
    b.failDeletes(true);
    assert.equal(await svc.drainCleanup(), 0);
    assert.equal(db.state.cleanup.get("old-1")!.attempts, 1);
    db.state.cleanup.get("old-1")!.nextAttemptAt = new Date(0);
    b.failDeletes(false);
    assert.equal(await svc.drainCleanup(), 1);
    assert.equal(db.state.cleanup.size, 0);
  });

  describe("playback authorization", () => {
    beforeEach(async () => {
      await uploadAndFinish("alice", {});
    });

    it("lets the owner preview and an eligible viewer watch", async () => {
      assert.ok((await svc.getPlayback("alice", "alice")).url.includes("/embed/12345/"));
      assert.ok((await svc.getPlayback("bob", "alice")).url.includes("/embed/12345/"));
    });

    it("does not hand out a player link when Bunny no longer has the video", async () => {
      b.bunny.getVideo = async () => null;
      await assert.rejects(svc.getPlayback("bob", "alice"), NotFoundException);
      assert.equal(db.state.videos.filter((v) => v.userId === "alice").length, 0, "stale record is dropped");
    });

    it("does not hand out a player link while Bunny has not finished encoding", async () => {
      b.bunny.getVideo = async (id: string) => ({
        guid: id, status: 3, length: 20, encodeProgress: 60, storageSize: 1, availableResolutions: null,
      });
      await assert.rejects(svc.getPlayback("bob", "alice"), ConflictException);
    });

    it("falls back to the other player host when the first answers 404", async () => {
      b.bunny.probeStatus["player.mediadelivery.net"] = 404;
      const r = await svc.getPlayback("bob", "alice");
      assert.ok(r.url.startsWith("https://iframe.mediadelivery.net/embed/12345/"));
    });

    it("reports a clear error when no player host can find the video", async () => {
      b.bunny.probeStatus["player.mediadelivery.net"] = 404;
      b.bunny.probeStatus["iframe.mediadelivery.net"] = 404;
      await assert.rejects(svc.getPlayback("bob", "alice"), (e: unknown) => {
        assert.ok(e instanceof BadGatewayException);
        assert.match((e as Error).message, /player\.mediadelivery\.net: HTTP 404/);
        return true;
      });
    });

    it("does not treat a 403 (referrer rules) or a network failure as missing", async () => {
      b.bunny.probeStatus["player.mediadelivery.net"] = 403;
      assert.ok((await svc.getPlayback("bob", "alice")).url.includes("player.mediadelivery.net"));
      b.bunny.probeStatus["player.mediadelivery.net"] = null;
      assert.ok((await svc.getPlayback("bob", "alice")).url.includes("/embed/12345/"));
    });

    it("never returns the Bunny API key", async () => {
      const r = await svc.getPlayback("bob", "alice");
      assert.ok(!JSON.stringify(r).toLowerCase().includes("apikey"));
    });

    it("blocks unpaid, locked or incomplete viewers", async () => {
      db.state.profiles.set("bob", approved({ hasPaid: false }));
      await assert.rejects(svc.getPlayback("bob", "alice"), ForbiddenException);
      db.state.profiles.set("bob", approved({ reviewStatus: "paused" }));
      await assert.rejects(svc.getPlayback("bob", "alice"), ForbiddenException);
      await assert.rejects(svc.getPlayback("stranger", "alice"), ForbiddenException);
    });

    it("hides the video from blocked pairs and from non-discoverable owners", async () => {
      db.state.blocks.push({ blockerId: "alice", blockedId: "bob" });
      await assert.rejects(svc.getPlayback("bob", "alice"), NotFoundException);
      db.state.blocks.length = 0;
      db.state.profiles.set("alice", approved({ banned: true }));
      await assert.rejects(svc.getPlayback("bob", "alice"), NotFoundException);
    });

    it("follows photo visibility: matches-only needs an active match", async () => {
      db.state.profiles.set("alice", approved({ photoVisibility: "matches" }));
      await assert.rejects(svc.getPlayback("bob", "alice"), ForbiddenException);
      db.state.matches.push({ userAId: "alice", userBId: "bob", status: "active" });
      assert.ok((await svc.getPlayback("bob", "alice")).url);
      db.state.profiles.set("alice", approved({ photoVisibility: "private" }));
      await assert.rejects(svc.getPlayback("bob", "alice"), ForbiddenException);
    });

    it("lets staff moderate regardless of visibility", async () => {
      db.state.profiles.set("alice", approved({ photoVisibility: "private" }));
      db.state.profiles.set("admin", { role: "admin", banned: false });
      assert.ok((await svc.getPlayback("admin", "alice")).url);
    });
  });
});

describe("app-only access", () => {
  const guard = new AppOnlyGuard();
  const ctx = (headers: Record<string, string>) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ headers }) }) }) as never;

  it("refuses website requests (cookie session, no header) and allows the app (header session)", () => {
    assert.throws(() => guard.canActivate(ctx({})), ForbiddenException);
    assert.throws(() => guard.canActivate(ctx({ cookie: "hel_session=abc" })), ForbiddenException);
    assert.equal(guard.canActivate(ctx({ "x-hel-client": "app" })), true);
    assert.throws(() => guard.canActivate(ctx({ "x-hel-client": "web" })), ForbiddenException);
    assert.equal(guard.canActivate(ctx({ "x-session-token": "tok" })), true);
  });
});

describe("authentication on the endpoints", () => {
  function ctx(handler: unknown, cls: unknown) {
    return {
      getHandler: () => handler,
      getClass: () => cls,
      switchToHttp: () => ({ getRequest: () => ({ cookies: {}, headers: {}, method: "POST", path: "/x" }) }),
    } as never;
  }
  const guard = new AuthGuard({} as never, new Reflector(), { get: () => undefined } as never);

  it("rejects unauthenticated upload / delete / playback requests", async () => {
    const proto = ProfileVideoController.prototype as unknown as Record<string, unknown>;
    for (const name of ["uploadAuth", "confirm", "status", "remove", "playback"]) {
      await assert.rejects(
        guard.canActivate(ctx(proto[name], ProfileVideoController)),
        UnauthorizedException,
        `${name} must require a session`
      );
    }
  });

  it("the Bunny webhook is the only public route (authenticated by signature instead)", async () => {
    const proto = BunnyStreamWebhookController.prototype as unknown as Record<string, unknown>;
    assert.equal(await guard.canActivate(ctx(proto.receive, BunnyStreamWebhookController)), true);
  });
});
