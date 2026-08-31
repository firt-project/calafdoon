import { defineConfig, devices } from "@playwright/test";

/**
 * Staging E2E. Specs self-skip unless STAGING_E2E=1.
 * No production targets.
 */
export default defineConfig({
  testDir: "./e2e/staging",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.STAGING_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
