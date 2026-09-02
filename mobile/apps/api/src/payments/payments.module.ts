import { Module, forwardRef } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthModule } from "../auth/auth.module";
import { ChatModule } from "../chat/chat.module";
import { MediaModule } from "../media/media.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ProfileModule } from "../profile/profile.module";
import { QueueModule } from "../queue/queue.module";
import { RedisModule } from "../redis/redis.module";
import { RateLimitGuard } from "../redis/rate-limit.guard";
import { AdminModule } from "../admin/admin.module";
import { PaymentMailService } from "../mail/payment-mail.service";
import {
  PaymentEmailQueueService,
  PaymentReconcileQueueService,
} from "../queue/payment-email-queue.service";
import { EvcPaymentsService } from "./evc-payments.service";
import { GrantPaidAccessService } from "./grant-paid-access.service";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { WaafiPayClient } from "./waafi-pay.client";
import { WaafiPaymentsService } from "./waafi-payments.service";
import { PaystackClient } from "./paystack.client";
import { PaystackPaymentsService } from "./paystack-payments.service";
import {
  FakeStripeGateway,
  STRIPE_GATEWAY,
  StripeService,
} from "./stripe.gateway";
import { isStripeFakeForbidden } from "../config/env.validation";

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    RedisModule,
    MediaModule,
    ChatModule,
    QueueModule,
    ProfileModule,
    AuthModule,
    forwardRef(() => AdminModule),
  ],
  controllers: [PaymentsController],
  providers: [
    RateLimitGuard,
    PaymentMailService,
    PaymentEmailQueueService,
    PaymentReconcileQueueService,
    GrantPaidAccessService,
    PaymentsService,
    EvcPaymentsService,
    WaafiPayClient,
    WaafiPaymentsService,
    PaystackClient,
    PaystackPaymentsService,
    {
      provide: STRIPE_GATEWAY,
      useFactory: (config: ConfigService) => {
        const gateway = config.get<string>("STRIPE_GATEWAY");
        if (gateway === "fake") {
          if (
            isStripeFakeForbidden({
              NODE_ENV: (config.get<string>("NODE_ENV") ??
                "development") as "development" | "test" | "production",
              RENDER: config.get("RENDER") ?? process.env.RENDER,
              RENDER_SERVICE_ID:
                config.get("RENDER_SERVICE_ID") ?? process.env.RENDER_SERVICE_ID,
            })
          ) {
            throw new Error(
              "STRIPE_GATEWAY=fake is forbidden in production/Render. Refusing to start FakeStripeGateway."
            );
          }
          return new FakeStripeGateway();
        }
        return new StripeService(config);
      },
      inject: [ConfigService],
    },
  ],
  exports: [
    PaymentsService,
    EvcPaymentsService,
    WaafiPaymentsService,
    PaystackPaymentsService,
    GrantPaidAccessService,
    PaymentMailService,
    STRIPE_GATEWAY,
  ],
})
export class PaymentsModule {}
