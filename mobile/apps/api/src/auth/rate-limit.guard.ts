import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";
import { normalizeEmail } from "./crypto-util";

type Bucket = { count: number; resetAt: number };

/**
 * Simple in-memory rate limiter for local Phase 4.
 * Keys by IP and by normalized email (when body present).
 */
@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  private readonly byIp = new Map<string, Bucket>();
  private readonly byEmail = new Map<string, Bucket>();

  private readonly windowMs = 15 * 60 * 1000;
  private readonly maxPerIp = 40;
  private readonly maxPerEmail = 15;

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const path = req.path || "";
    if (
      !path.includes("/auth/login") &&
      !path.includes("/auth/forgot-password") &&
      !path.includes("/auth/reset-password")
    ) {
      return true;
    }

    const now = Date.now();
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    this.hit(this.byIp, `ip:${ip}`, now, this.maxPerIp);

    const email =
      typeof req.body?.email === "string"
        ? normalizeEmail(req.body.email)
        : null;
    if (email) {
      this.hit(this.byEmail, `email:${email}`, now, this.maxPerEmail);
    }

    return true;
  }

  /** Test helper */
  reset() {
    this.byIp.clear();
    this.byEmail.clear();
  }

  private hit(map: Map<string, Bucket>, key: string, now: number, max: number) {
    const cur = map.get(key);
    if (!cur || cur.resetAt <= now) {
      map.set(key, { count: 1, resetAt: now + this.windowMs });
      return;
    }
    cur.count += 1;
    if (cur.count > max) {
      throw new HttpException(
        "Too many requests. Try again later.",
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
  }
}
