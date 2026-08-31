#!/usr/bin/env node
/**
 * Generate a one-time admin bootstrap secret for Nest API.
 *
 * Usage:
 *   npm run bootstrap:admin -- you@example.com
 *
 * Set these on the Nest API (Render) environment, then register/login and open /admin.
 */
import { randomBytes } from "node:crypto";

const email = process.argv.find((arg) => arg.includes("@"));

if (!email) {
  console.error("Usage: npm run bootstrap:admin -- you@example.com");
  process.exit(1);
}

const secret = randomBytes(32).toString("base64");

console.log("Calaf admin bootstrap (Nest API)\n");
console.log(`Email:  ${email}`);
console.log(`Secret: ${secret}\n`);
console.log("Set on Render (Nest API env):\n");
console.log(`  ADMIN_BOOTSTRAP_EMAIL=${email}`);
console.log(`  ADMIN_BOOTSTRAP_SECRET=${secret}`);
console.log("\nThen:");
console.log("1. Register or sign in with that email");
console.log("2. Open /admin and claim owner access");
console.log("3. Unset ADMIN_BOOTSTRAP_SECRET after claiming (optional)");
