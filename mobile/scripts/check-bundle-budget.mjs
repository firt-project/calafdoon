#!/usr/bin/env node
/**
 * Fails if the production Vite main JS chunk grows beyond the Phase 5 budget.
 * Usage: node scripts/check-bundle-budget.mjs apps/client/dist
 */
import fs from "node:fs";
import path from "node:path";

const distDir = path.resolve(process.argv[2] || "apps/client/dist");
const assetsDir = path.join(distDir, "assets");

/** Phase 5 measured main chunk ≈ 473,279 bytes. Allow ~12% headroom for normal churn. */
const MAX_MAIN_CHUNK_BYTES = 530_000;

if (!fs.existsSync(assetsDir)) {
  console.error(`Missing assets dir: ${assetsDir}`);
  process.exit(1);
}

const files = fs.readdirSync(assetsDir).filter((f) => /^index-.*\.js$/.test(f));
if (files.length === 0) {
  console.error("No index-*.js main chunk found in dist/assets");
  process.exit(1);
}

let worst = { name: "", size: 0 };
for (const f of files) {
  const size = fs.statSync(path.join(assetsDir, f)).size;
  if (size > worst.size) worst = { name: f, size };
}

console.log(
  `Main chunk ${worst.name}: ${worst.size} bytes (budget ${MAX_MAIN_CHUNK_BYTES})`
);

if (worst.size > MAX_MAIN_CHUNK_BYTES) {
  console.error(
    `Bundle budget exceeded by ${worst.size - MAX_MAIN_CHUNK_BYTES} bytes`
  );
  process.exit(1);
}

console.log("Bundle budget OK");
