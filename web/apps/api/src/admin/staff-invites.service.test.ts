import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { StaffInvitesService } from "./staff-invites.service";
import type { MailAdapter, MailMessage } from "../auth/mail.adapter";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function extractTokenFromMail(msg: MailMessage): string {
  const match = /[?&]token=([A-Za-z0-9]+)/.exec(msg.text);
  assert.ok(match?.[1], "mail body must contain accept token");
  return match[1]!;
}

type InviteRow = {
  id: string;
  email: string;
  token: string;
  tokenHash: string | null;
  role: string;
  status: string;
  invitedById: string;
  convexInvitedBy: string;
  inviteCreatedAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
  acceptedByUserId: string | null;
  convexAcceptedByUserId: string | null;
};

function makeService() {
  const invites = new Map<string, InviteRow>();
  const mailSent: MailMessage[] = [];
  const auditWrites: Array<{ action: string; metadata?: unknown }> = [];

  const mail: MailAdapter = {
    async send(message) {
      mailSent.push(message);
    },
  };

  const failingMail: MailAdapter = {
    async send() {
      throw new Error("SMTP down token=SHOULD_NOT_LEAK_ABCDEFGHIJKLMNOP");
    },
  };

  let prismaInvites: InviteRow[] = [];

  const prisma = {
    user: {
      findFirst: async ({
        where,
      }: {
        where: { emailNormalized: string };
      }) => {
        void where;
        return null;
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        convexId: `convex_${where.id}`,
        email: "member@example.com",
        emailVerificationTime: null as Date | null,
      }),
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { emailVerificationTime?: Date };
      }) => {
        void where;
        return { id: where.id, ...data };
      },
    },
    authAccount: {
      updateMany: async () => ({ count: 1 }),
    },
    profile: {
      findUnique: async ({ where }: { where: { userId: string } }) => ({
        id: `profile_${where.userId}`,
        userId: where.userId,
        role: "user",
      }),
      update: async () => ({}),
    },
    staffInvite: {
      findMany: async ({
        where,
        orderBy,
      }: {
        where?: { email?: string };
        orderBy?: unknown;
      }) => {
        void orderBy;
        let rows = [...invites.values()];
        if (where?.email) {
          rows = rows.filter((r) => r.email === where.email);
        }
        return rows;
      },
      findUnique: async ({
        where,
      }: {
        where: { id?: string; tokenHash?: string; token?: string };
      }) => {
        if (where.id) return invites.get(where.id) ?? null;
        if (where.tokenHash) {
          return (
            [...invites.values()].find((r) => r.tokenHash === where.tokenHash) ??
            null
          );
        }
        if (where.token) {
          return (
            [...invites.values()].find((r) => r.token === where.token) ?? null
          );
        }
        return null;
      },
      create: async ({ data }: { data: Omit<InviteRow, "id"> & { id?: string } }) => {
        const row: InviteRow = {
          id: data.id ?? `invite_${invites.size + 1}`,
          email: data.email,
          token: data.token,
          tokenHash: data.tokenHash,
          role: data.role,
          status: data.status,
          invitedById: data.invitedById,
          convexInvitedBy: data.convexInvitedBy,
          inviteCreatedAt: data.inviteCreatedAt,
          expiresAt: data.expiresAt,
          acceptedAt: null,
          acceptedByUserId: null,
          convexAcceptedByUserId: null,
        };
        invites.set(row.id, row);
        prismaInvites = [...invites.values()];
        return row;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<InviteRow>;
      }) => {
        const existing = invites.get(where.id);
        assert.ok(existing);
        const next = { ...existing, ...data };
        invites.set(where.id, next);
        prismaInvites = [...invites.values()];
        return next;
      },
    },
  };

  const audit = {
    write: async (entry: { action: string; metadata?: unknown }) => {
      auditWrites.push(entry);
    },
  };

  const config = { get: () => "https://www.helcalafkaaga.com" };

  function service(adapter: MailAdapter = mail) {
    return new StaffInvitesService(
      prisma as never,
      audit as never,
      config as never,
      adapter
    );
  }

  return {
    service,
    mail,
    failingMail,
    mailSent,
    auditWrites,
    invites,
    get prismaInvites() {
      return prismaInvites;
    },
  };
}

function assertNoSecretLeak(payload: unknown, token?: string) {
  const json = JSON.stringify(payload);
  assert.equal(json.includes("acceptUrl"), false);
  assert.equal(/token[=:]/i.test(json), false);
  if (token) {
    assert.equal(json.includes(token), false);
  }
  assert.equal(/hash:[a-f0-9]{64}/i.test(json), false);
}

describe("StaffInvitesService M1 token exposure", () => {
  it("create response contains no raw token or acceptUrl", async () => {
    const ctx = makeService();
    const result = await ctx.service().create("owner-1", "new.admin@example.com");
    assert.ok(result.inviteId);
    assert.equal(result.email, "new.admin@example.com");
    assert.equal(result.deliveryStatus, "sent");
    assert.equal(ctx.mailSent.length, 1);
    const token = extractTokenFromMail(ctx.mailSent[0]!);
    assertNoSecretLeak(result, token);
    assert.equal("acceptUrl" in result, false);
    assert.equal("token" in result, false);
  });

  it("mail service receives the acceptance URL with token", async () => {
    const ctx = makeService();
    await ctx.service().create("owner-1", "mail.check@example.com");
    const msg = ctx.mailSent[0]!;
    assert.match(msg.text, /https:\/\/www\.helcalafkaaga\.com\/admin\/invite\?token=/);
    assert.ok(extractTokenFromMail(msg).length >= 40);
  });

  it("stores only a hash, not the raw token", async () => {
    const ctx = makeService();
    await ctx.service().create("owner-1", "hash.check@example.com");
    const token = extractTokenFromMail(ctx.mailSent[0]!);
    const row = [...ctx.invites.values()][0]!;
    assert.equal(row.tokenHash, hashToken(token));
    assert.equal(row.token, `hash:${row.tokenHash}`);
    assert.equal(row.token.includes(token), false);
  });

  it("correct token can be accepted", async () => {
    const ctx = makeService();
    const created = await ctx.service().create("owner-1", "member@example.com");
    const token = extractTokenFromMail(ctx.mailSent[0]!);
    const accepted = await ctx.service().accept("user-1", token);
    assert.equal(accepted.success, true);
    assert.equal(ctx.invites.get(created.inviteId)?.status, "accepted");
  });

  it("incorrect token is rejected", async () => {
    const ctx = makeService();
    await ctx.service().create("owner-1", "member@example.com");
    await assert.rejects(
      () => ctx.service().accept("user-1", "totally-wrong-token-value-xxxxxx"),
      NotFoundException
    );
  });

  it("expired token is rejected", async () => {
    const ctx = makeService();
    const created = await ctx.service().create("owner-1", "member@example.com");
    const token = extractTokenFromMail(ctx.mailSent[0]!);
    const row = ctx.invites.get(created.inviteId)!;
    row.expiresAt = new Date(Date.now() - 60_000);
    await assert.rejects(
      () => ctx.service().accept("user-1", token),
      BadRequestException
    );
  });

  it("revoked token is rejected", async () => {
    const ctx = makeService();
    const created = await ctx.service().create("owner-1", "member@example.com");
    const token = extractTokenFromMail(ctx.mailSent[0]!);
    await ctx.service().revoke("owner-1", created.inviteId);
    await assert.rejects(
      () => ctx.service().accept("user-1", token),
      BadRequestException
    );
  });

  it("accepted token cannot be reused", async () => {
    const ctx = makeService();
    await ctx.service().create("owner-1", "member@example.com");
    const token = extractTokenFromMail(ctx.mailSent[0]!);
    await ctx.service().accept("user-1", token);
    await assert.rejects(
      () => ctx.service().accept("user-1", token),
      BadRequestException
    );
  });

  it("resend invalidates previous token and replacement works", async () => {
    const ctx = makeService();
    const created = await ctx.service().create("owner-1", "member@example.com");
    const oldToken = extractTokenFromMail(ctx.mailSent[0]!);
    ctx.mailSent.length = 0;
    const resent = await ctx.service().resend("owner-1", created.inviteId);
    assertNoSecretLeak(resent, oldToken);
    const newToken = extractTokenFromMail(ctx.mailSent[0]!);
    assert.notEqual(oldToken, newToken);
    await assert.rejects(
      () => ctx.service().accept("user-1", oldToken),
      NotFoundException
    );
    const accepted = await ctx.service().accept("user-1", newToken);
    assert.equal(accepted.success, true);
  });

  it("email failure does not expose the token", async () => {
    const ctx = makeService();
    await assert.rejects(
      () => ctx.service(ctx.failingMail).create("owner-1", "fail@example.com"),
      (err: unknown) => {
        assert.ok(err instanceof ServiceUnavailableException);
        const msg = String((err as ServiceUnavailableException).message);
        assert.equal(msg.includes("SHOULD_NOT_LEAK"), false);
        assert.equal(msg.includes("acceptUrl"), false);
        assert.equal(/token=/i.test(msg), false);
        return true;
      }
    );
  });

  it("audit records do not contain the token", async () => {
    const ctx = makeService();
    await ctx.service().create("owner-1", "audit@example.com");
    const token = extractTokenFromMail(ctx.mailSent[0]!);
    for (const entry of ctx.auditWrites) {
      assertNoSecretLeak(entry, token);
    }
  });

  it("invite listing does not expose the token", async () => {
    const ctx = makeService();
    await ctx.service().create("owner-1", "list@example.com");
    const token = extractTokenFromMail(ctx.mailSent[0]!);
    const listed = await ctx.service().list();
    assertNoSecretLeak(listed, token);
    assert.equal(listed[0]?.email, "list@example.com");
  });

  it("invite retrieval by token does not echo the raw token", async () => {
    const ctx = makeService();
    await ctx.service().create("owner-1", "peek@example.com");
    const token = extractTokenFromMail(ctx.mailSent[0]!);
    const peek = await ctx.service().getByToken(token);
    assert.equal(peek.valid, true);
    assertNoSecretLeak(peek, token);
  });

  it("malformed token input does not cause a 500", async () => {
    const ctx = makeService();
    const peek = await ctx.service().getByToken("");
    assert.equal(peek.valid, false);
    await assert.rejects(
      () => ctx.service().accept("user-1", "!!!"),
      NotFoundException
    );
  });

  it("production cannot enable a token-return fallback via NODE_ENV", async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const ctx = makeService();
      const result = await ctx.service().create("owner-1", "prod@example.com");
      assert.equal("acceptUrl" in result, false);
      assert.equal("token" in result, false);
      assert.equal(result.deliveryStatus, "sent");
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
