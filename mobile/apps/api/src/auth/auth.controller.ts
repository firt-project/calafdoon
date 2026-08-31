import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { z } from "zod";
import { AuthService } from "./auth.service";
import {
  CurrentUser,
  Public,
  RequireProfile,
  AllowDuringPasswordReset,
  AllowWhileUnverified,
  AllowWhileMfaEnrollment,
  type AuthedRequest,
  type RequestUser,
} from "./auth.guards";
import { RateLimitGuard } from "../redis/rate-limit.guard";
import { ProfileService } from "../profile/profile.service";
import {
  clearAuthCookies,
  CSRF_COOKIE,
  CsrfGuard,
  issueCsrfCookie,
  setSessionCookie,
} from "./csrf";
import { MfaService } from "./mfa.service";

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException("Invalid request body");
  }
  return result.data;
}
const loginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(256),
});

const registerSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(256),
});

const registerCompleteSchema = z.object({
  gender: z.enum(["male", "female"]),
});

const emailSchema = z.object({
  email: z.string().email().max(320),
});

const resetSchema = z.object({
  token: z.string().min(10).max(512),
  newPassword: z.string().min(8).max(256),
});

const changeSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(8).max(256),
});

const verifyEmailSchema = z.object({
  token: z.string().min(10).max(512),
});

const deleteAccountSchema = z.object({
  password: z.string().min(1).max(256),
  confirm: z.literal(true),
});

const mfaCodeSchema = z.object({
  code: z.string().min(6).max(32),
});

const mfaLoginSchema = z.object({
  mfaToken: z.string().min(10).max(512),
  code: z.string().min(6).max(32),
});

const mfaDisableSchema = z.object({
  password: z.string().min(1).max(256),
  code: z.string().min(6).max(32),
});

@Controller("auth")
@UseGuards(RateLimitGuard, CsrfGuard)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly mfa: MfaService,
    private readonly profiles: ProfileService,
    private readonly config: ConfigService
  ) {}

  private cookieOpts() {
    const secure =
      this.config.get<string>("COOKIE_SECURE") === "true" ||
      this.config.get<string>("NODE_ENV") === "production";
    const domain = this.config.get<string>("COOKIE_DOMAIN") || undefined;
    return { secure, domain };
  }

  @Public()
  @Post("login")
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const parsed = parseBody(loginSchema, body);
    const result = await this.auth.login({
      email: parsed.email,
      password: parsed.password,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    if (result.kind === "mfa_required") {
      // L4: no session cookie until TOTP succeeds.
      return {
        mfaRequired: true as const,
        mfaToken: result.mfaToken,
        expiresAt: result.expiresAt.toISOString(),
      };
    }
    const opts = this.cookieOpts();
    setSessionCookie(res, result.rawToken, {
      ...opts,
      expiresAt: result.expiresAt,
    });
    const csrf = issueCsrfCookie(res, opts.secure, opts.domain);
    return {
      user: result.user,
      csrfToken: csrf,
      // H5: session lives in HttpOnly hel_session cookie only — do not return
      // a browser-readable sessionToken.
    };
  }

  /** L4: finish staff login after password + TOTP (or recovery code). */
  @Public()
  @Post("mfa/verify-login")
  @HttpCode(200)
  async verifyMfaLogin(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const parsed = parseBody(mfaLoginSchema, body);
    const result = await this.auth.completeMfaLogin({
      mfaToken: parsed.mfaToken,
      code: parsed.code,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    const opts = this.cookieOpts();
    setSessionCookie(res, result.rawToken, {
      ...opts,
      expiresAt: result.expiresAt,
    });
    const csrf = issueCsrfCookie(res, opts.secure, opts.domain);
    return {
      user: result.user,
      csrfToken: csrf,
    };
  }

  @Get("mfa/status")
  @AllowWhileMfaEnrollment()
  async mfaStatus(@CurrentUser() user: RequestUser) {
    return this.mfa.status(user.id);
  }

  @Post("mfa/enroll/start")
  @HttpCode(200)
  @AllowWhileMfaEnrollment()
  async mfaEnrollStart(@CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.mfa.enrollStart(user.id, req.ip);
  }

  @Post("mfa/enroll/confirm")
  @HttpCode(200)
  @AllowWhileMfaEnrollment()
  async mfaEnrollConfirm(
    @CurrentUser() user: RequestUser,
    @Body() body: unknown,
    @Req() req: Request
  ) {
    const parsed = parseBody(mfaCodeSchema, body);
    return this.mfa.enrollConfirm(user.id, parsed.code, req.ip);
  }

  @Post("mfa/enroll/cancel")
  @HttpCode(200)
  @AllowWhileMfaEnrollment()
  async mfaEnrollCancel(@CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.mfa.enrollCancel(user.id, req.ip);
  }

  @Post("mfa/disable")
  @HttpCode(200)
  @AllowWhileMfaEnrollment()
  async mfaDisable(
    @CurrentUser() user: RequestUser,
    @Body() body: unknown,
    @Req() req: Request
  ) {
    const parsed = parseBody(mfaDisableSchema, body);
    return this.mfa.disable(user.id, {
      password: parsed.password,
      code: parsed.code,
      ip: req.ip,
    });
  }

  @Post("mfa/recovery/regenerate")
  @HttpCode(200)
  @AllowWhileMfaEnrollment()
  async mfaRecoveryRegenerate(
    @CurrentUser() user: RequestUser,
    @Body() body: unknown,
    @Req() req: Request
  ) {
    const parsed = parseBody(mfaCodeSchema, body);
    return this.mfa.regenerateRecoveryCodes(user.id, {
      code: parsed.code,
      ip: req.ip,
    });
  }

  @Public()
  @Post("register/check-email")
  @HttpCode(200)
  async checkEmail(@Body() body: unknown) {
    const parsed = parseBody(emailSchema, body);
    return this.auth.checkEmailRegistered(parsed.email);
  }

  @Public()
  @Post("register")
  @HttpCode(200)
  async register(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const parsed = parseBody(registerSchema, body);
    const result = await this.auth.register({
      email: parsed.email,
      password: parsed.password,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    const opts = this.cookieOpts();
    setSessionCookie(res, result.rawToken, {
      ...opts,
      expiresAt: result.expiresAt,
    });
    const csrf = issueCsrfCookie(res, opts.secure, opts.domain);
    return {
      user: result.user,
      csrfToken: csrf,
    };
  }

  /**
   * Registration detail step (gender) — same behavior as
   * POST /profile/complete-registration-gender. Kept under /auth/register/*
   * for Phase 11 API parity with the Convex onboarding sequence.
   */
  @Post("register/complete")
  @HttpCode(200)
  @RequireProfile()
  async registerComplete(
    @CurrentUser() user: RequestUser,
    @Body() body: unknown
  ) {
    const parsed = parseBody(registerCompleteSchema, body);
    return {
      profile: await this.profiles.completeRegistrationGender(
        user.id,
        parsed.gender
      ),
    };
  }

  @Post("logout")
  @HttpCode(200)
  @AllowDuringPasswordReset()
  @AllowWhileUnverified()
  @AllowWhileMfaEnrollment()
  async logout(
    @CurrentUser() user: RequestUser,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response
  ) {
    await this.auth.logout(user.sessionId, user.id, req.ip);
    clearAuthCookies(res, this.cookieOpts());
    return { ok: true };
  }

  @Post("logout-all")
  @HttpCode(200)
  @AllowDuringPasswordReset()
  @AllowWhileUnverified()
  @AllowWhileMfaEnrollment()
  async logoutAll(
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    await this.auth.logoutAll(user.id, req.ip);
    clearAuthCookies(res, this.cookieOpts());
    return { ok: true };
  }

  @Get("me")
  @AllowDuringPasswordReset()
  @AllowWhileUnverified()
  @AllowWhileMfaEnrollment()
  async me(
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const view = await this.auth.me(user.id);
    const accessState = await this.auth.accessState(user.id);
    const opts = this.cookieOpts();
    // Reuse the existing CSRF token — rotating on every /auth/me left the
    // cross-site client (which cannot read the cookie) holding a stale header
    // token, so mutating requests started failing with 403.
    const existing = req.cookies?.[CSRF_COOKIE] as string | undefined;
    const csrf = existing || issueCsrfCookie(res, opts.secure, opts.domain);
    return { user: view, accessState, csrfToken: csrf };
  }

  @Public()
  @Post("forgot-password")
  @HttpCode(200)
  async forgotPassword(@Body() body: unknown, @Req() req: Request) {
    const parsed = parseBody(emailSchema, body);
    return this.auth.forgotPassword(parsed.email, req.ip);
  }

  @Public()
  @Post("reset-password")
  @HttpCode(200)
  async resetPassword(@Body() body: unknown, @Req() req: Request) {
    const parsed = parseBody(resetSchema, body);
    return this.auth.resetPassword({
      token: parsed.token,
      newPassword: parsed.newPassword,
      ip: req.ip,
    });
  }

  @Post("change-password")
  @HttpCode(200)
  @AllowDuringPasswordReset()
  @AllowWhileUnverified()
  @AllowWhileMfaEnrollment()
  async changePassword(
    @CurrentUser() user: RequestUser,
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const parsed = parseBody(changeSchema, body);
    const result = await this.auth.changePassword({
      userId: user.id,
      currentPassword: parsed.currentPassword,
      newPassword: parsed.newPassword,
      ip: req.ip,
    });
    clearAuthCookies(res, this.cookieOpts());
    return result;
  }

  @Public()
  @Post("verify-email")
  @HttpCode(200)
  async verifyEmail(@Body() body: unknown, @Req() req: Request) {
    const parsed = parseBody(verifyEmailSchema, body);
    return this.auth.verifyEmailToken(parsed.token, req.ip);
  }

  @Post("resend-verification")
  @HttpCode(200)
  @AllowDuringPasswordReset()
  @AllowWhileUnverified()
  @AllowWhileMfaEnrollment()
  async resendVerification(
    @CurrentUser() user: RequestUser,
    @Req() req: Request
  ) {
    return this.auth.resendEmailVerification(user.id, req.ip);
  }

  /**
   * Self-delete (web + mobile). Requires password. Permanently removes the member.
   * Allowed while unverified / forced-reset / MFA enroll so stuck users can leave.
   */
  @Post("delete-account")
  @HttpCode(200)
  @AllowDuringPasswordReset()
  @AllowWhileUnverified()
  @AllowWhileMfaEnrollment()
  async deleteAccount(
    @CurrentUser() user: RequestUser,
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const parsed = parseBody(deleteAccountSchema, body);
    await this.profiles.deleteMyAccount(user.id, parsed.password, req.ip);
    clearAuthCookies(res, this.cookieOpts());
    return { ok: true };
  }
}
