import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";

/**
 * Profile videos are an app feature. Every request from the mobile app carries
 * `X-Hel-Client: app` (added by the app's API client); the website never sends it.
 * A valid X-Session-Token header (app-style session) is accepted too. This is a product
 * gate, not a security boundary: all the real checks (login, ownership, visibility) still apply.
 */
@Injectable()
export class AppOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const client = req.headers?.["x-hel-client"];
    const token = req.headers?.["x-session-token"];
    const isApp =
      client === "app" || (typeof token === "string" && token.length > 0);
    if (!isApp) {
      throw new ForbiddenException("Profile videos are available in the mobile app.");
    }
    return true;
  }
}
