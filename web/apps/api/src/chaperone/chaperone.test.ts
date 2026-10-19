import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { signGuardianToken, verifyGuardianToken } from "./guardian-token";
import { ChaperoneService } from "./chaperone.service";

const SECRET = "test-secret-test-secret-test-secret!!";
const ID = "11111111-2222-4333-8444-555555555555";

describe("guardian token", () => {
  it("round-trips and rejects tampering", () => {
    const t = signGuardianToken(SECRET, ID);
    assert.equal(verifyGuardianToken(SECRET, t), ID);
    assert.equal(verifyGuardianToken("other-secret", t), null);
    assert.equal(verifyGuardianToken(SECRET, t.slice(0, -1) + (t.endsWith("a") ? "b" : "a")), null);
    assert.equal(verifyGuardianToken(SECRET, `${ID}.`), null);
    assert.equal(verifyGuardianToken(SECRET, "not-a-token"), null);
    assert.equal(verifyGuardianToken(SECRET, "x".repeat(500)), null);
    assert.equal(verifyGuardianToken(SECRET, `99999999-2222-4333-8444-555555555555.${t.split(".")[1]}`), null);
  });
});

/* in-memory Prisma double */
function makeDb() {
  const st = {
    convs: new Map<string, any>(),
    chap: [] as any[],
    blocks: [] as any[],
    messages: [] as any[],
    profiles: new Map<string, string>(),
    notifications: [] as any[],
  };
  let n = 0;
  const match = (row: any, where: any = {}): boolean =>
    Object.entries(where).every(([k, c]: [string, any]) => {
      if (k === "OR") return c.some((x: any) => match(row, x));
      const v = row[k];
      if (c && typeof c === "object" && !(c instanceof Date)) {
        if ("in" in c) return c.in.includes(v);
        if ("lt" in c) return v != null && v < c.lt;
        return false;
      }
      return v === c;
    });
  const prisma: any = {
    conversation: { findUnique: async ({ where }: any) => st.convs.get(where.id) ?? null },
    block: { findFirst: async ({ where }: any) => st.blocks.find((b) => match(b, where)) ?? null },
    profile: { findMany: async ({ where }: any) => where.userId.in.filter((id: string) => st.profiles.has(id)).map((id: string) => ({ userId: id, name: st.profiles.get(id) })) },
    user: { findUnique: async () => ({ convexId: "x" }) },
    notification: { create: async ({ data }: any) => void st.notifications.push(data) },
    message: {
      findMany: async ({ where }: any) =>
        st.messages.filter((m) => m.conversationId === where.conversationId && (where.deletedAt === null ? m.deletedAt == null : true)).sort((a, b) => b.messageCreatedAt - a.messageCreatedAt),
    },
    chatChaperone: {
      updateMany: async ({ where, data }: any) => {
        const rows = st.chap.filter((r) => match(r, where));
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      },
      findMany: async ({ where }: any) => st.chap.filter((r) => match(r, where)),
      findFirst: async ({ where }: any) => st.chap.find((r) => match(r, where)) ?? null,
      findUnique: async ({ where }: any) => st.chap.find((r) => r.id === where.id) ?? null,
      create: async ({ data }: any) => {
        if (st.chap.some((r) => r.conversationId === data.conversationId && r.invitedById === data.invitedById && ["pending", "active"].includes(r.status))) {
          throw Object.assign(new Error("dup"), { code: "P2002" });
        }
        const row = { id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, viewCount: 0, lastViewedAt: null, expiresAt: null, acceptedAt: null, createdAt: new Date(), ...data };
        st.chap.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const r = st.chap.find((x) => x.id === where.id)!;
        for (const [k, v] of Object.entries(data) as any) r[k] = v && typeof v === "object" && "increment" in v ? r[k] + v.increment : v;
        return r;
      },
    },
  };
  return { st, prisma };
}

describe("ChaperoneService", () => {
  let db: ReturnType<typeof makeDb>;
  let svc: ChaperoneService;
  const CONV = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const X = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

  beforeEach(() => {
    db = makeDb();
    db.st.convs.set(CONV, { id: CONV, participantUserIds: [A, B], match: { status: "active", userAId: A, userBId: B } });
    db.st.profiles.set(A, "Amina Yusuf");
    db.st.profiles.set(B, "Bilal Ali");
    svc = new ChaperoneService(db.prisma, { get: (k: string) => (k === "SESSION_SECRET" ? SECRET : undefined) } as never);
  });

  const invite = (u = A) => svc.invite(u, CONV, { guardianName: "Ahmed Yusuf", relationship: "father" });

  it("both members must agree before a guardian gets a link", async () => {
    const inv = await invite();
    const before = await svc.list(A, CONV);
    assert.equal(before.items[0]!.status, "pending");
    assert.equal(before.items[0]!.link, null, "no link until the other member accepts");
    await assert.rejects(svc.guardianView(signGuardianToken(SECRET, inv.id)), NotFoundException);
    await svc.respond(B, CONV, inv.id, true);
    const after = await svc.list(A, CONV);
    assert.equal(after.items[0]!.status, "active");
    assert.ok(after.items[0]!.link?.includes("/guardian/"));
    const other = await svc.list(B, CONV);
    assert.equal(other.items[0]!.link, null, "only the inviter can get the link");
  });

  it("the person who invited cannot accept their own request", async () => {
    const inv = await invite();
    await assert.rejects(svc.respond(A, CONV, inv.id, true), ForbiddenException);
  });

  it("outsiders cannot invite, list, accept or revoke", async () => {
    const inv = await invite();
    await assert.rejects(svc.invite(X, CONV, { guardianName: "Mallory", relationship: "other" }), NotFoundException);
    await assert.rejects(svc.list(X, CONV), NotFoundException);
    await assert.rejects(svc.respond(X, CONV, inv.id, true), NotFoundException);
    await assert.rejects(svc.revoke(X, CONV, inv.id), NotFoundException);
  });

  it("validates input and refuses blocked or ended matches", async () => {
    await assert.rejects(svc.invite(A, CONV, { guardianName: "x", relationship: "father" }), BadRequestException);
    await assert.rejects(svc.invite(A, CONV, { guardianName: "Ahmed", relationship: "stranger" }), BadRequestException);
    db.st.blocks.push({ blockerId: B, blockedId: A });
    await assert.rejects(invite(), ForbiddenException);
    db.st.blocks.length = 0;
    db.st.convs.get(CONV).match.status = "unmatched";
    await assert.rejects(invite(), ForbiddenException);
  });

  it("only one open guardian per member per chat", async () => {
    await invite();
    await assert.rejects(invite(), ConflictException);
    const second = await svc.invite(B, CONV, { guardianName: "Ali Hassan", relationship: "brother" });
    assert.ok(second.id);
  });

  it("the guardian sees text only: no photos, no deleted messages", async () => {
    const inv = await invite();
    await svc.respond(B, CONV, inv.id, true);
    db.st.messages.push(
      { id: "m1", conversationId: CONV, senderId: A, body: "Salaam", imageMediaId: null, deletedAt: null, messageCreatedAt: new Date(1000) },
      { id: "m2", conversationId: CONV, senderId: B, body: "", imageMediaId: "img", deletedAt: null, messageCreatedAt: new Date(2000) },
      { id: "m3", conversationId: CONV, senderId: B, body: "removed text", imageMediaId: null, deletedAt: new Date(), messageCreatedAt: new Date(3000) }
    );
    const view = await svc.guardianView(signGuardianToken(SECRET, inv.id));
    assert.equal(view.guardianName, "Ahmed Yusuf");
    assert.deepEqual(view.messages.map((m) => m.text), ["Salaam", "[photo not shown]"]);
    assert.equal(view.messages[0]!.from, "Amina");
    assert.ok(!JSON.stringify(view).includes("removed text"));
    assert.equal(db.st.chap[0].viewCount, 1);
  });

  it("revoking, declining or expiry kills the link immediately", async () => {
    const inv = await invite();
    await svc.respond(B, CONV, inv.id, true);
    const token = signGuardianToken(SECRET, inv.id);
    await svc.guardianView(token);
    await svc.revoke(B, CONV, inv.id); // the other member can also end it
    await assert.rejects(svc.guardianView(token), NotFoundException);

    const inv2 = await invite();
    await svc.respond(B, CONV, inv2.id, false);
    await assert.rejects(svc.guardianView(signGuardianToken(SECRET, inv2.id)), NotFoundException);

    const inv3 = await invite();
    await svc.respond(B, CONV, inv3.id, true);
    db.st.chap.find((r) => r.id === inv3.id).expiresAt = new Date(Date.now() - 1000);
    await assert.rejects(svc.guardianView(signGuardianToken(SECRET, inv3.id)), NotFoundException);
  });

  it("forged tokens and unknown ids reveal nothing", async () => {
    await assert.rejects(svc.guardianView("garbage"), NotFoundException);
    await assert.rejects(svc.guardianView(signGuardianToken("wrong-secret", ID)), NotFoundException);
    await assert.rejects(svc.guardianView(signGuardianToken(SECRET, ID)), NotFoundException);
  });

  it("each step tells the other member", async () => {
    const inv = await invite();
    await svc.respond(B, CONV, inv.id, true);
    await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(db.st.notifications.map((n) => [n.userId, n.title]).sort(), [[A, "Guardian request accepted"], [B, "Guardian request"]].sort());
  });
});
