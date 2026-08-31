import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { json as expressJson } from "express";
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { AppModule } from "./app.module";
import { RedisIoAdapter } from "./chat/redis-io.adapter";
import { resolveCorsOrigins } from "./config/cors-origins";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
    bodyParser: false,
  });
  const logger = app.get(Logger);
  app.useLogger(logger);
  app.enableShutdownHooks();

  const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
  const redisIoAdapter = new RedisIoAdapter(app, redisUrl);
  const redisOk = await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);
  if (redisOk) {
    logger.log("Socket.IO Redis adapter attached");
  } else {
    logger.warn("Socket.IO using in-memory adapter (Redis unavailable)");
  }

  const expressApp = app.getHttpAdapter().getInstance();
  const trustProxy = process.env.TRUST_PROXY === "true";
  if (trustProxy) {
    expressApp.set("trust proxy", 1);
  }

  // EVC screenshot proofs are sent as base64 JSON — raise default 100kb limit.
  app.use(
    expressJson({
      limit: "12mb",
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: Buffer }).rawBody = buf;
      },
    })
  );

  // Browser clients (Vercel) call this API cross-origin; do not force same-origin CORP.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );
  app.use(cookieParser());

  app.use((req: Request, res: Response, next: NextFunction) => {
    const id =
      (req.headers["x-request-id"] as string | undefined) ?? randomUUID();
    res.setHeader("x-request-id", id);
    (req as Request & { requestId?: string }).requestId = id;
    next();
  });

  const origins = resolveCorsOrigins();

  app.enableCors({
    origin: origins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-CSRF-Token",
      "X-XSRF-Token",
      "X-Request-Id",
      "X-Session-Token",
    ],
  });
  logger.log(`CORS allowlist: ${origins.join(", ") || "(empty)"}`);

  // Validate required secrets early (non-dev soft warn)
  const sessionSecret = process.env.SESSION_SECRET ?? process.env.AUTH_SECRET;
  if (!sessionSecret || sessionSecret.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET (min 32 chars) is required in production");
    }
    logger.warn(
      "SESSION_SECRET missing or short — using insecure development default"
    );
  }

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  logger.log(`Hel API (Phase 8 payments) listening on :${port}`);
}

bootstrap().catch((error: unknown) => {
  console.error(
    "Failed to start API:",
    error instanceof Error ? error.message : "unknown error"
  );
  process.exit(1);
});
