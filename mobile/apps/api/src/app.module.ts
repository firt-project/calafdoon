import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { AdminModule } from "./admin/admin.module";
import { AuthModule } from "./auth/auth.module";
import { ChatModule } from "./chat/chat.module";
import { validateEnv } from "./config/env.validation";
import { DownloadModule } from "./download/download.module";
import { HealthModule } from "./health/health.module";
import { MediaModule } from "./media/media.module";
import { MatchingModule } from "./matching/matching.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { ObservabilityModule } from "./observability/observability.module";
import { PaymentsModule } from "./payments/payments.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ProfileModule } from "./profile/profile.module";
import { QueueModule } from "./queue/queue.module";
import { RedisModule } from "./redis/redis.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? "info",
        transport:
          process.env.NODE_ENV !== "production"
            ? { target: "pino-pretty", options: { singleLine: true } }
            : undefined,
        redact: {
          paths: [
            "req.headers.authorization",
            "req.headers.cookie",
            "password",
            "passwordHash",
            "currentPassword",
            "newPassword",
            "token",
            "secret",
            "req.body.password",
            "req.body.currentPassword",
            "req.body.newPassword",
            "req.body.token",
            "req.body.email",
            "email",
            "signedUrl",
            "url",
          ],
          remove: true,
        },
      },
    }),
    PrismaModule,
    RedisModule,
    QueueModule,
    ObservabilityModule,
    HealthModule,
    MediaModule,
    AuthModule,
    ProfileModule,
    MatchingModule,
    ChatModule,
    NotificationsModule,
    PaymentsModule,
    AdminModule,
    DownloadModule,
  ],
})
export class AppModule {}
