#!/usr/bin/env node
/**
 * Load / reliability smoke against local Nest API (non-destructive).
 *
 * - Health
 * - 50 concurrent GET /auth/me
 * - Optional authenticated session (STAGING_EMAIL / STAGING_PASSWORD or STAGING_COOKIE)
 * - Discover pagination burst (authenticated)
 * - Message idempotency double-post (if conversation exists)
 * - 100 Socket.IO connect attempts when authenticated (else 20 unauth expected-fail)
 * - Signed photo URL route probe
 *
 * Writes migration-reports/phase11/load-smoke.json
 *
 * Does NOT restart Redis/API/DB — those require operator-controlled infra.
 * See docs/MIGRATION_PHASE_11_STAGING_VALIDATION.md for restart recovery checklist.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT_DIR = path.join(ROOT, "migration-reports", "phase11");
const OUT = path.join(OUT_DIR, "load-smoke.json");

const API_URL = (
  process.env.STAGING_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://127.0.0.1:4000"
).replace(/\/$/, "");
const SOCKET_URL = (
  process.env.STAGING_SOCKET_URL ??
  process.env.NEXT_PUBLIC_SOCKET_URL ??
  API_URL
).replace(/\/$/, "");

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

function parseCookies(setCookie) {
  const raw = setCookie
    ? (Array.isArray(setCookie) ? setCookie : [setCookie]).flatMap((c) =>
        String(c)
          .split(/,(?=\s*[^;]+=)/)
          .map((s) => s.trim())
      )
    : [];
  const pairs = [];
  let csrf;
  for (const part of raw) {
    const nv = part.split(";")[0]?.trim();
    if (!nv?.includes("=")) continue;
    pairs.push(nv);
    if (nv.startsWith("hel_csrf=")) csrf = decodeURIComponent(nv.slice(9));
  }
  return { cookie: pairs.join("; "), csrf };
}

async function probeHealth() {
  try {
    const res = await fetch(`${API_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function loginSession() {
  if (process.env.STAGING_COOKIE) {
    return {
      cookie: process.env.STAGING_COOKIE,
      csrf: process.env.STAGING_CSRF,
      source: "env-cookie",
    };
  }
  const email =
    process.env.STAGING_EMAIL ?? "staging.e2e.member@hel.local";
  const password = process.env.STAGING_PASSWORD ?? "StagingMember1!";
  try {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(10_000),
    });
    const { cookie, csrf } = parseCookies(res.headers.getSetCookie?.() ?? []);
    if (!res.ok || !cookie) {
      return { cookie: "", csrf: undefined, source: "login-failed", status: res.status };
    }
    return { cookie, csrf, source: "login", status: res.status };
  } catch (e) {
    return {
      cookie: "",
      csrf: undefined,
      source: "login-error",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function hitMe(cookie) {
  const started = Date.now();
  try {
    const res = await fetch(`${API_URL}/auth/me`, {
      headers: cookie ? { cookie } : {},
      signal: AbortSignal.timeout(10_000),
    });
    return {
      ok: res.status === 200 || res.status === 401,
      status: res.status,
      ms: Date.now() - started,
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      ms: Date.now() - started,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function discoverBurst(headers, pages = 5) {
  const results = [];
  for (let page = 0; page < pages; page++) {
    const started = Date.now();
    try {
      const res = await fetch(
        `${API_URL}/matches/discover?limit=20&cursor=${page}`,
        { headers, signal: AbortSignal.timeout(10_000) }
      );
      results.push({ status: res.status, ms: Date.now() - started });
    } catch (e) {
      results.push({
        status: 0,
        ms: Date.now() - started,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return results;
}

async function messageIdempotency(headers) {
  try {
    const list = await fetch(`${API_URL}/conversations`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!list.ok) return { skipped: true, reason: `list ${list.status}` };
    const body = await list.json();
    const items = body?.items ?? body?.conversations ?? body ?? [];
    const id = Array.isArray(items) ? items[0]?.id : undefined;
    if (!id) return { skipped: true, reason: "no conversation" };
    const key = `load-smoke-${Date.now()}`;
    const payload = {
      body: "load-smoke idempotency",
      idempotencyKey: key,
    };
    const a = await fetch(`${API_URL}/conversations/${id}/messages`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    const b = await fetch(`${API_URL}/conversations/${id}/messages`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    return {
      skipped: false,
      firstStatus: a.status,
      secondStatus: b.status,
      conversationId: id,
    };
  } catch (e) {
    return {
      skipped: true,
      reason: e instanceof Error ? e.message : String(e),
    };
  }
}

async function signedPhotoProbe(headers) {
  try {
    const res = await fetch(`${API_URL}/profile/photos/sign-upload`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ contentType: "image/jpeg", slot: "additional" }),
      signal: AbortSignal.timeout(10_000),
    });
    return { status: res.status };
  } catch (e) {
    return { status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

async function notificationFanoutProbe(headers) {
  try {
    const res = await fetch(`${API_URL}/notifications/unread-count`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    return { status: res.status };
  } catch (e) {
    return { status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

async function socketBurst(n, cookie) {
  let io;
  try {
    io = (await import("socket.io-client")).io;
  } catch {
    return {
      attempted: 0,
      connected: 0,
      skipped: true,
      reason: "socket.io-client not installed in this workspace",
    };
  }

  const results = await Promise.all(
    Array.from({ length: n }, () => {
      return new Promise((resolve) => {
        const started = Date.now();
        const socket = io(SOCKET_URL, {
          transports: ["websocket"],
          timeout: 5000,
          autoConnect: true,
          withCredentials: true,
          extraHeaders: cookie ? { cookie } : undefined,
        });
        const done = (ok, detail) => {
          try {
            socket.close();
          } catch {
            /* ignore */
          }
          resolve({ ok, ms: Date.now() - started, detail });
        };
        socket.on("connect", () => done(true, "connected"));
        socket.on("connect_error", (err) =>
          done(false, err?.message ?? "connect_error")
        );
        setTimeout(() => done(false, "timeout"), 6000);
      });
    })
  );

  const connected = results.filter((r) => r.ok).length;
  const ms = results.map((r) => r.ms).sort((a, b) => a - b);
  return {
    attempted: n,
    connected,
    reconnectSuccessRate: connected / n,
    p50Ms: percentile(ms, 0.5),
    p95Ms: percentile(ms, 0.95),
    skipped: false,
    sampleErrors: results
      .filter((r) => !r.ok)
      .slice(0, 5)
      .map((r) => r.detail),
  };
}

async function main() {
  const health = await probeHealth();
  if (!health.ok) {
    const report = {
      generatedAt: new Date().toISOString(),
      apiUrl: API_URL,
      ok: false,
      skipped: true,
      reason: `API health check failed at ${API_URL}/health`,
      health,
    };
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
    console.error(report.reason);
    process.exit(1);
  }

  const session = await loginSession();
  const authHeaders = {};
  if (session.cookie) authHeaders.cookie = session.cookie;
  if (session.csrf) authHeaders["x-csrf-token"] = session.csrf;

  const meResults = await Promise.all(
    Array.from({ length: 50 }, () => hitMe(session.cookie))
  );
  const meOk = meResults.filter((r) => r.ok).length;
  const meMs = meResults.map((r) => r.ms).sort((a, b) => a - b);
  const p50 = percentile(meMs, 0.5);
  const p95 = percentile(meMs, 0.95);
  const all404 = meResults.every((r) => r.status === 404);
  const errorRate =
    meResults.filter((r) => !r.ok).length / Math.max(1, meResults.length);

  const discover = session.cookie
    ? await discoverBurst(authHeaders, 5)
    : { skipped: true, reason: "no session" };
  const idempotency = session.cookie
    ? await messageIdempotency(authHeaders)
    : { skipped: true, reason: "no session" };
  const photo = session.cookie
    ? await signedPhotoProbe(authHeaders)
    : { skipped: true, reason: "no session" };
  const notifications = session.cookie
    ? await notificationFanoutProbe(authHeaders)
    : { skipped: true, reason: "no session" };

  const socketCount = session.cookie ? 100 : 20;
  const sockets = await socketBurst(socketCount, session.cookie);

  const report = {
    generatedAt: new Date().toISOString(),
    apiUrl: API_URL,
    socketUrl: SOCKET_URL,
    ok: meOk === 50 && !all404,
    health,
    session: {
      source: session.source,
      authenticated: Boolean(session.cookie),
      status: session.status,
    },
    warning: all404
      ? "GET /auth/me returned 404 for all requests — Nest process may be an older build without auth routes. Restart with current apps/api (health.phase should be >= 4)."
      : undefined,
    authMe: {
      concurrent: 50,
      ok: meOk,
      p50Ms: p50,
      p95Ms: p95,
      errorRate,
      statuses: Object.fromEntries(
        [...new Set(meResults.map((r) => r.status))].map((s) => [
          String(s),
          meResults.filter((r) => r.status === s).length,
        ])
      ),
    },
    discoverPagination: discover,
    messageIdempotency: idempotency,
    signedPhotoUrl: photo,
    notificationFanout: notifications,
    sockets,
    operatorManual: {
      redisRestartRecovery:
        "Restart redis container; confirm rate-limit + socket adapter recover; re-run this script.",
      apiRestartRecovery:
        "Restart Nest; GET /health; login; Socket.IO reconnect; sessions persist in Postgres.",
      dbPoolObservation:
        "Watch Prisma/pg pool via Nest logs or pg_stat_activity during discover burst.",
      queueLag:
        "Inspect BullMQ queue depths in Redis after notification fanout / media jobs.",
    },
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  console.log(`Wrote ${OUT}`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
