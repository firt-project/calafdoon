#!/usr/bin/env node
/**
 * Lightweight release security scan for the client dist + common secret paths.
 * Does not replace dedicated secret scanning tools.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const root = path.resolve(process.argv[2] || ".");
const distAssets = path.join(root, "apps/client/dist/assets");
let failed = false;

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed = true;
}

function warn(msg) {
  console.warn(`WARN: ${msg}`);
}

if (fs.existsSync(distAssets)) {
  const jsFiles = fs
    .readdirSync(distAssets)
    .filter((f) => f.endsWith(".js"))
    .map((f) => path.join(distAssets, f));

  const secretPatterns = [
    /sk_live_[A-Za-z0-9]+/,
    /sk_test_[A-Za-z0-9]{20,}/,
    /BEGIN (RSA |OPENSSH )?PRIVATE KEY/,
    /VITE_USE_LOCAL_DEMO["']?\s*[:=]\s*["']?true/i,
  ];

  for (const file of jsFiles) {
    const text = fs.readFileSync(file, "utf8");
    for (const re of secretPatterns) {
      if (re.test(text)) fail(`${path.basename(file)} matches ${re}`);
    }

    // Ban Vite-defined private API bases. Socket.IO may embed bare "http://localhost"
    // without a port as a library default — that alone is allowed.
    if (
      /["']https?:\/\/127\.0\.0\.1(?::\d+)?["']/.test(text) ||
      /["']https?:\/\/10\.0\.2\.2(?::\d+)?["']/.test(text) ||
      /["']https?:\/\/10\.0\.3\.2(?::\d+)?["']/.test(text) ||
      /["']https?:\/\/localhost:\d+["']/.test(text) ||
      /["']https?:\/\/192\.168\.\d+\.\d+(?::\d+)?["']/.test(text)
    ) {
      fail(
        `${path.basename(file)} embeds a private/local absolute API URL literal`
      );
    }
  }

  const main = jsFiles.find((f) => /index-.*\.js$/.test(path.basename(f)));
  if (main) {
    const text = fs.readFileSync(main, "utf8");
    if (!/https:\/\//.test(text)) {
      fail("Main chunk contains no https:// URL — unexpected for production API");
    }
  }

  console.log(`Scanned ${jsFiles.length} JS assets`);
} else {
  warn("dist/assets missing — skip built-asset scan (run production build first)");
}

try {
  const tracked = execSync(
    "git ls-files '*.jks' '*.keystore' '**/key.properties'",
    { cwd: root, encoding: "utf8" }
  ).trim();
  if (tracked) fail(`Tracked signing files:\n${tracked}`);
} catch {
  warn("git ls-files unavailable");
}

try {
  const envTracked = execSync(
    "git ls-files '**/.env' 'apps/api/.env' 'apps/client/.env'",
    { cwd: root, encoding: "utf8" }
  ).trim();
  if (envTracked) fail(`Tracked env files:\n${envTracked}`);
} catch {
  /* ignore */
}

if (failed) process.exit(1);
console.log("Release security audit OK");
