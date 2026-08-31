import { Global, Module, forwardRef } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { PrismaModule } from "../prisma/prisma.module";
import { ProfileModule } from "../profile/profile.module";
import { RedisModule } from "../redis/redis.module";
import { RateLimitGuard } from "../redis/rate-limit.guard";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guards";
import { AuthService, MAIL_ADAPTER } from "./auth.service";
import { createMailAdapter, type MailAdapter } from "./mail.adapter";
import { CsrfGuard } from "./csrf";
import { MfaService } from "./mfa.service";
import { SessionService } from "./session.service";

@Global()
@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    RedisModule,
    forwardRef(() => ProfileModule),
  ],
  controllers: [AuthController],
  providers: [
    SessionService,
    MfaService,
    AuthService,
    RateLimitGuard,
    CsrfGuard,
    {
      provide: MAIL_ADAPTER,
      useFactory: (config: ConfigService): MailAdapter => {
        const driver = config.get<string>("MAIL_DRIVER") ?? "console";
        const nodeEnv = config.get<string>("NODE_ENV") ?? process.env.NODE_ENV;
        if (nodeEnv === "production" && driver !== "resend") {
          console.error(
            `[mail] MAIL_DRIVER must be "resend" in production (got "${driver}"). Password reset emails will not deliver.`
          );
        }
        const resendApiKey =
          config.get<string>("RESEND_API_KEY") ||
          config.get<string>("AUTH_RESEND_KEY") ||
          undefined;
        const resendFrom =
          config.get<string>("RESEND_FROM") ||
          config.get<string>("AUTH_EMAIL_FROM") ||
          undefined;
        if (driver === "resend" && !resendApiKey) {
          console.error(
            "[mail] MAIL_DRIVER=resend but neither RESEND_API_KEY nor AUTH_RESEND_KEY is set."
          );
        }
        return createMailAdapter({
          driver,
          resendApiKey,
          resendFrom,
        });
      },
      inject: [ConfigService],
    },
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      // Global CSRF for cookie-authenticated mutations (H5).
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
  ],
  exports: [
    AuthService,
    MfaService,
    SessionService,
    MAIL_ADAPTER,
    RateLimitGuard,
    CsrfGuard,
  ],
})
export class AuthModule {}
