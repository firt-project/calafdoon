import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from "@nestjs/common";
import type { Request } from "express";
import { normalizeEmail } from "../auth/crypto-util";
import {
  stripeWebhookGlobalRateLimit,
  stripeWebhookIpRateLimit,
} from "../payments/stripe-webhook-limits";
import { RedisService } from "../redis/redis.module";

type LimitSpec = { windowSec: number; max: number };

const LIMITS: Record<
  string,
  { ip?: LimitSpec; email?: LimitSpec; user?: LimitSpec; global?: LimitSpec }
> = {
  "auth.login": {
    ip: { windowSec: 15 * 60, max: 40 },
    email: { windowSec: 15 * 60, max: 15 },
  },
  "auth.register": {
    ip: { windowSec: 15 * 60, max: 20 },
    email: { windowSec: 15 * 60, max: 10 },
  },
  "auth.registerCheck": {
    ip: { windowSec: 15 * 60, max: 60 },
    email: { windowSec: 15 * 60, max: 30 },
  },
  "auth.forgot": {
    ip: { windowSec: 15 * 60, max: 20 },
    email: { windowSec: 15 * 60, max: 5 },
  },
  "auth.reset": {
    ip: { windowSec: 15 * 60, max: 20 },
  },
  "auth.verify": {
    ip: { windowSec: 15 * 60, max: 40 },
  },
  "auth.verifyResend": {
    user: { windowSec: 15 * 60, max: 5 },
    ip: { windowSec: 15 * 60, max: 20 },
  },
  /** L4: TOTP / recovery code guesses during login challenge. */
  "auth.mfaLogin": {
    ip: { windowSec: 15 * 60, max: 30 },
  },
  /** L4: enroll confirm / disable / recovery regen (authenticated). */
  "auth.mfa": {
    user: { windowSec: 15 * 60, max: 20 },
    ip: { windowSec: 15 * 60, max: 40 },
  },
  "profile.write": {
    user: { windowSec: 60, max: 60 },
  },
  "profile.geocode": {
    user: { windowSec: 60 * 60, max: 30 },
  },
  "matches.action": {
    user: { windowSec: 60, max: 120 },
  },
  "matches.discover": {
    user: { windowSec: 60, max: 60 },
  },
  "matches.breakdown": {
    user: { windowSec: 60, max: 60 },
  },
  "chat.message": {
    user: { windowSec: 60, max: 60 },
  },
  "chat.image": {
    user: { windowSec: 60, max: 20 },
  },
  "chat.typing": {
    user: { windowSec: 60, max: 120 },
  },
  "chat.read": {
    user: { windowSec: 60, max: 120 },
  },
  "notifications.poll": {
    user: { windowSec: 60, max: 120 },
  },
  "payments.checkout": {
    user: { windowSec: 60, max: 10 },
  },
  "payments.verify": {
    user: { windowSec: 60, max: 30 },
  },
  "payments.evc": {
    user: { windowSec: 60, max: 20 },
  },
  /** Waafi PIN prompts — keep tight to limit wallet harassment. */
  "payments.waafi": {
    user: { windowSec: 60, max: 5 },
    ip: { windowSec: 60, max: 20 },
  },
  "media.upload": {
    user: { windowSec: 60, max: 20 },
  },
  "payments.webhook": {
    // Defaults overridden at runtime from STRIPE_WEBHOOK_RATE_* env (see hitWebhook).
    ip: { windowSec: 60, max: 300 },
  },
  "admin.list": {
    user: { windowSec: 60, max: 120 },
  },
  "admin.mutate": {
    user: { windowSec: 60, max: 60 },
  },
  "admin.invite": {
    user: { windowSec: 60, max: 20 },
  },
  "admin.support": {
    user: { windowSec: 60, max: 40 },
  },
  "support.public": {
    ip: { windowSec: 15 * 60, max: 10 },
    email: { windowSec: 60 * 60, max: 5 },
  },
  "admin.announce": {
    user: { windowSec: 60, max: 20 },
  },
  "admin.evc": {
    user: { windowSec: 60, max: 40 },
  },
  "admin.delete": {
    user: { windowSec: 60, max: 10 },
  },
  /** Bulk member-email export (Play testers) — owner-only PII dump. */
  "admin.exportEmails": {
    user: { windowSec: 60 * 60, max: 5 },
    ip: { windowSec: 60 * 60, max: 10 },
  },
  "profile.delete_account": {
    user: { windowSec: 60 * 60, max: 3 },
    ip: { windowSec: 60 * 60, max: 10 },
  },
};

/**
 * Redis-backed rate limiter (multi-instance safe).
 * Auth-sensitive endpoints fail closed if Redis is down.
 * Low-risk reads degrade open with a warning log.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: { id: string } }>();
    const bucket = this.resolveBucket(req);
    if (!bucket) return true;

    const spec = LIMITS[bucket];
    if (!spec) return true;

    const failClosed =
      bucket.startsWith("auth.") ||
      bucket === "matches.action" ||
      bucket === "profile.write" ||
      bucket.startsWith("chat.") ||
      // Stripe webhook: fail-open on Redis outage so signed deliveries can still
      // reach handleWebhook (which may return retryable 5xx on its own).
      (bucket.startsWith("payments.") && bucket !== "payments.webhook") ||
      bucket.startsWith("admin.") ||
      bucket.startsWith("support.") ||
      bucket === "profile.delete_account";

    const online = await this.redis.connect();
    if (!online || !this.redis.client) {
      if (failClosed) {
        this.logger.error(`Rate limit fail-closed (${bucket}): Redis unavailable`);
        throw new HttpException(
          "Service temporarily unavailable. Try again later.",
          HttpStatus.SERVICE_UNAVAILABLE
        );
      }
      this.logger.warn(`Rate limit degrade-open (${bucket}): Redis unavailable`);
      return true;
    }

    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const email =
      typeof req.body?.email === "string"
        ? normalizeEmail(req.body.email)
        : null;
    const userId = req.user?.id;

    if (bucket === "payments.webhook") {
      const ipSpec = stripeWebhookIpRateLimit();
      const globalSpec = stripeWebhookGlobalRateLimit();
      // Keys use route + IP / shared global only — never secrets or signatures.
      await this.hit(`rl:payments.webhook:ip:${ip}`, ipSpec);
      await this.hit(`rl:payments.webhook:global`, globalSpec);
      return true;
    }

    if (spec.ip) await this.hit(`rl:${bucket}:ip:${ip}`, spec.ip);
    if (spec.email && email) await this.hit(`rl:${bucket}:email:${email}`, spec.email);
    if (spec.user && userId) await this.hit(`rl:${bucket}:user:${userId}`, spec.user);
    if (spec.global) await this.hit(`rl:${bucket}:global`, spec.global);

    return true;
  }

  private resolveBucket(req: Request): string | null {
    const path = req.path || "";
    const method = req.method.toUpperCase();
    if (path.includes("/auth/mfa/verify-login")) return "auth.mfaLogin";
    if (path.includes("/auth/mfa/")) return "auth.mfa";
    if (path.includes("/auth/login")) return "auth.login";
    if (path.includes("/auth/register/check-email")) return "auth.registerCheck";
    if (path.includes("/auth/register")) return "auth.register";
    if (path.includes("/auth/forgot-password")) return "auth.forgot";
    if (path.includes("/auth/reset-password")) return "auth.reset";
    if (path.includes("/auth/resend-verification")) return "auth.verifyResend";
    if (path.includes("/auth/verify-email")) return "auth.verify";
    if (
      (method === "DELETE" && path === "/profile/account") ||
      (method === "POST" && path === "/auth/delete-account")
    ) {
      return "profile.delete_account";
    }
    if (method === "POST" && path.includes("/profile/geolocation/verify")) {
      return "profile.geocode";
    }
    if (
      method === "POST" &&
      (path.includes("/photos/sign-upload") ||
        path.includes("/photos/confirm-upload") ||
        path.includes("/images/sign-upload") ||
        path.includes("/payments/evc/proof/sign-upload") ||
        path.includes("/payments/evc/proof/upload"))
    ) {
      return "media.upload";
    }
    if (
      method !== "GET" &&
      (path.startsWith("/profile") || path.startsWith("/preferences"))
    ) {
      return "profile.write";
    }
    if (method === "POST" && /\/matches\/[^/]+\/action$/.test(path)) {
      return "matches.action";
    }
    if (method === "GET" && path.includes("/matches/discover")) {
      return "matches.discover";
    }
    if (method === "GET" && path.includes("/breakdown")) {
      return "matches.breakdown";
    }
    if (method === "POST" && /\/conversations\/[^/]+\/messages$/.test(path)) {
      return "chat.message";
    }
    if (method === "POST" && /\/conversations\/[^/]+\/typing$/.test(path)) {
      return "chat.typing";
    }
    if (method === "POST" && /\/conversations\/[^/]+\/read$/.test(path)) {
      return "chat.read";
    }
    if (
      method === "GET" &&
      (path.startsWith("/notifications") || path === "/me/unread-count")
    ) {
      return "notifications.poll";
    }
    if (
      method === "POST" &&
      (path.includes("/payments/stripe/registration-checkout") ||
        path.includes("/payments/stripe/premium-upgrade-checkout"))
    ) {
      return "payments.checkout";
    }
    if (method === "POST" && path.includes("/payments/stripe/verify-session")) {
      return "payments.verify";
    }
    if (
      method === "POST" &&
      (path.includes("/payments/evc/proof/sign-upload") ||
        path.includes("/payments/evc/proof/submit"))
    ) {
      return "payments.evc";
    }
    if (method === "POST" && path.includes("/payments/waafi/purchase")) {
      return "payments.waafi";
    }
    if (method === "POST" && path.includes("/webhooks/stripe")) {
      return "payments.webhook";
    }
    if (method === "POST" && path.includes("/support/public")) {
      return "support.public";
    }
    if (path.startsWith("/admin") || path.startsWith("/staff-invites") || path.startsWith("/support") || path.startsWith("/moderation")) {
      if (method === "DELETE" || path.includes("/delete") || /\/admin\/users\/[^/]+$/.test(path) && method === "DELETE") {
        return "admin.delete";
      }
      if (path.includes("/admin/users/emails") || path.includes("/admin/users/purge-typo-emails")) {
        return "admin.exportEmails";
      }
      if (path.includes("/staff-invites")) return "admin.invite";
      if (path.includes("/announcements")) return "admin.announce";
      if (path.includes("/evc")) return "admin.evc";
      if (path.includes("/support")) return "admin.support";
      if (method === "GET") return "admin.list";
      return "admin.mutate";
    }
    return null;
  }

  private async hit(key: string, spec: LimitSpec) {
    const client = this.redis.client!;
    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, spec.windowSec);
    }
    if (count > spec.max) {
      throw new HttpException(
        "Too many requests. Try again later.",
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
  }
}
