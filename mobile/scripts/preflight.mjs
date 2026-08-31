#!/usr/bin/env node
/**
 * Pre-deploy checks for Calaf (Nest API + Next frontend).
 *
 * Usage:
 *   npm run preflight
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  try {
    const envPath = resolve(process.cwd(), ".env.local");
    const contents = readFileSync(envPath, "utf8");
    for (const line of contents.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // optional
  }
}

loadEnvLocal();

const required = ["NEXT_PUBLIC_API_URL", "NEXT_PUBLIC_APP_URL"];
const missing = required.filter((k) => !(process.env[k] ?? "").trim());

if (missing.length) {
  console.error("Missing required frontend env:");
  for (const k of missing) console.error(`  - ${k}`);
  console.error("\nSee .env.example and infra/staging/vercel-api-mode.env.example");
  process.exit(1);
}

const socket =
  process.env.NEXT_PUBLIC_SOCKET_URL ?? process.env.NEXT_PUBLIC_API_URL;
console.log("Preflight OK (Nest API frontend)");
console.log(`  NEXT_PUBLIC_APP_URL=${process.env.NEXT_PUBLIC_APP_URL}`);
console.log(`  NEXT_PUBLIC_API_URL=${process.env.NEXT_PUBLIC_API_URL}`);
console.log(`  NEXT_PUBLIC_SOCKET_URL=${socket}`);
