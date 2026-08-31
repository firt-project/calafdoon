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
import {
  PINO_REDACT_PATHS,
  REDACTED,
  serializeErrorForLog,
  serializeRequestForLog,
  serializeResponseForLog,
} from "./observability/log-redact";
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
        // Serializers sanitize copies; redact paths are defense-in-depth.
        // Live req/res objects used by auth are never mutated.
        serializers: {
          req: serializeRequestForLog,
          res: serializeResponseForLog,
          err: serializeErrorForLog,
        },
        redact: {
          paths: PINO_REDACT_PATHS,
          censor: REDACTED,
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
