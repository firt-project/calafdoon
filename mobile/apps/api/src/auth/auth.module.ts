import { Global, Module, forwardRef } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AdminModule } from "../admin/admin.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ProfileModule } from "../profile/profile.module";
import { RedisModule } from "../redis/redis.module";
import { RateLimitGuard } from "../redis/rate-limit.guard";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guards";
import { AuthService, MAIL_ADAPTER } from "./auth.service";
import { createMailAdapter, type MailAdapter } from "./mail.adapter";
import { SessionService } from "./session.service";

@Global()
@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    RedisModule,
    forwardRef(() => ProfileModule),
    forwardRef(() => AdminModule),
  ],
  controllers: [AuthController],
  providers: [
    SessionService,
    AuthService,
    RateLimitGuard,
    {
      provide: MAIL_ADAPTER,
      useFactory: (config: ConfigService): MailAdapter => {
        const driver = config.get<string>("MAIL_DRIVER") ?? "console";
        return createMailAdapter({
          driver,
          resendApiKey: config.get<string>("RESEND_API_KEY"),
          resendFrom: config.get<string>("RESEND_FROM"),
        });
      },
      inject: [ConfigService],
    },
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
  exports: [AuthService, SessionService, MAIL_ADAPTER, RateLimitGuard],
})
export class AuthModule {}
