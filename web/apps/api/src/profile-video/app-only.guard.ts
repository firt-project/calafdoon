import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";

/**
 * Profile videos are an app feature. The mobile app sends its session in the
 * X-Session-Token header; the website's session lives in an HttpOnly cookie that page
 * scripts cannot read, so the website never sends that header. Requests without it are
 * refused, which keeps the feature out of the website. (The app may also carry the cookie
 * through its native HTTP layer, so the header, not the cookie, is the discriminator.)
 */
@Injectable()
export class AppOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers?.["x-session-token"];
    if (typeof header !== "string" || header.length === 0) {
      throw new ForbiddenException("Profile videos are available in the mobile app.");
    }
    return true;
  }
}
