# M11: hardened multi-stage Nest API image (non-root, production deps only).
# Build context: apps/api (see infra/docker-compose.yml).

FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json ./
# Full install for compile (Nest CLI / TypeScript live in devDependencies).
RUN npm install

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json nest-cli.json ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate && npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
# Official node image ships a non-root `node` user (uid/gid 1000).
ENV HOME=/home/node

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma
# Android install page + APK (served by DownloadController).
COPY public ./public
# Bust image cache when the APK binary changes (size alone is not enough).
COPY public/download/hel-calafkaaga.apk ./public/download/hel-calafkaaga.apk
ARG APK_BUNDLE_REV=2026-07-31-debug-apk
LABEL apk.bundle.rev="${APK_BUNDLE_REV}"

# Drop build-only packages; keep production deps (includes prisma CLI for migrate deploy).
RUN npm prune --omit=dev \
  && chown -R node:node /app

USER node
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
