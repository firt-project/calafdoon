import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { escapeHtml } from "./html-escape";
import { PaymentMailService } from "./payment-mail.service";
import type { MailAdapter, MailMessage } from "../auth/mail.adapter";
import { ResendMailAdapter } from "../auth/mail.adapter";

describe("escapeHtml (M9)", () => {
  it("escapes &, <, >, \", ', /", () => {
    assert.equal(
      escapeHtml(`a&b<c>d"e'f/g`),
      "a&amp;b&lt;c&gt;d&quot;e&#39;f&#x2F;g"
    );
  });

  it("does not double-escape when applied once to raw input", () => {
    const raw = `<img src=x onerror=alert(1)>`;
    const once = escapeHtml(raw);
    assert.equal(once.includes("<img"), false);
    assert.equal(once.includes("&lt;img"), true);
    // Applying twice would encode the ampersands of entities — callers must not.
    const twice = escapeHtml(once);
    assert.notEqual(twice, once);
    assert.equal(twice.includes("&amp;lt;"), true);
  });

  it("leaves trusted template wrappers for callers to compose", () => {
    const body = escapeHtml(`Reject: <script>alert(1)</script>`);
    const html = `<p>${body}</p>`;
    assert.equal(html.startsWith("<p>"), true);
    assert.equal(html.endsWith("</p>"), true);
    assert.equal(html.includes("<script>"), false);
  });
});

describe("payment mail HTML escaping (M9)", () => {
  it("escapes rejection reason HTML in deliverNow and keeps plain text raw", async () => {
    const sent: MailMessage[] = [];
    const mail: MailAdapter = {
      async send(message) {
        sent.push(message);
      },
    };
    const prisma = {
      mailDelivery: {
        updateMany: async () => ({ count: 1 }),
      },
    };
    const config = { get: () => "console" };
    const queue = {} as never;
    const service = new PaymentMailService(
      prisma as never,
      config as never,
      queue,
      mail
    );

    const reason = `Not approved <a href="https://evil.example">click</a> & 'note'/"`;
    const text = `Your EVC payment proof was not approved: ${reason}`;
    await service.deliverNow({
      idempotencyKey: "mail:test",
      to: "user@example.com",
      subject: "Payment not approved",
      text,
    });

    assert.equal(sent.length, 1);
    assert.equal(sent[0]!.text, text);
    assert.equal(sent[0]!.html?.includes("<a href"), false);
    assert.equal(sent[0]!.html?.includes("&lt;a href"), true);
    assert.equal(sent[0]!.html?.includes("&amp;"), true);
    assert.equal(sent[0]!.html?.includes("&#39;"), true);
    assert.equal(sent[0]!.html?.includes("&quot;"), true);
    assert.equal(sent[0]!.html?.includes("&#x2F;"), true);
    assert.match(sent[0]!.html ?? "", /^<p>.+<\/p>$/);
  });

  it("escapes payment note HTML", async () => {
    const sent: MailMessage[] = [];
    const mail: MailAdapter = {
      async send(message) {
        sent.push(message);
      },
    };
    const service = new PaymentMailService(
      { mailDelivery: { updateMany: async () => ({ count: 1 }) } } as never,
      { get: () => "console" } as never,
      {} as never,
      mail
    );
    const note = `Paid <b>OK</b> & done`;
    await service.deliverNow({
      idempotencyKey: "mail:pay",
      to: "a@b.c",
      subject: "Payment successful",
      text: note,
    });
    assert.equal(sent[0]!.text, note);
    assert.equal(sent[0]!.html, `<p>${escapeHtml(note)}</p>`);
  });
});

describe("Resend text→html fallback escaping (M9)", () => {
  it("escapes support-message HTML when html is omitted", async () => {
    const fetches: Array<{ body: string }> = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
      fetches.push({ body: String(init?.body ?? "") });
      return {
        ok: true,
        json: async () => ({ id: "msg_1" }),
        text: async () => "",
      } as Response;
    }) as typeof fetch;

    try {
      const adapter = new ResendMailAdapter("re_test", "from@test");
      const support = `Hello <img src=x onerror=alert(1)> & "friend"`;
      await adapter.send({
        to: "member@example.com",
        subject: "Support reply",
        text: support,
      });
      assert.equal(fetches.length, 1);
      const payload = JSON.parse(fetches[0]!.body) as { html: string; text: string };
      assert.equal(payload.text, support);
      assert.equal(payload.html.includes("<img"), false);
      assert.equal(payload.html.includes("&lt;img"), true);
      assert.equal(payload.html.includes("&amp;"), true);
      assert.equal(payload.html.includes("&quot;"), true);
      assert.match(payload.html, /^<p>.+<\/p>$/);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("does not alter caller-provided html template structure beyond what caller escaped", async () => {
    const fetches: Array<{ body: string }> = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
      fetches.push({ body: String(init?.body ?? "") });
      return {
        ok: true,
        json: async () => ({ id: "msg_2" }),
        text: async () => "",
      } as Response;
    }) as typeof fetch;

    try {
      const adapter = new ResendMailAdapter("re_test", "from@test");
      const html = `<p>${escapeHtml("x < y")}</p><p><a href="${escapeHtml("https://example.com/a")}">Open</a></p>`;
      await adapter.send({
        to: "m@example.com",
        subject: "Profile",
        text: "x < y",
        html,
      });
      const payload = JSON.parse(fetches[0]!.body) as { html: string };
      assert.equal(payload.html, html);
      assert.equal(payload.html.includes("<p>"), true);
      assert.equal(payload.html.includes("<a href="), true);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("profile moderation email HTML (M9)", () => {
  it("escapes profile comment / rejection body the same way notifyApproval does", () => {
    const body = `Please fix <script>evil()</script> & photo`;
    const label = `Update <b>profile</b>`;
    const absolute = `https://www.helcalafkaaga.com/profile`;
    const html = `<p>${escapeHtml(body)}</p><p><a href="${escapeHtml(absolute)}">${escapeHtml(label)}</a></p>`;
    assert.equal(html.includes("<script>"), false);
    assert.equal(html.includes("<b>"), false);
    assert.equal(html.includes("&lt;script&gt;"), true);
    assert.equal(html.includes("&lt;b&gt;"), true);
    assert.equal(html.includes("<p>"), true);
    assert.equal(html.includes(`href="${escapeHtml(absolute)}"`), true);
  });
});
