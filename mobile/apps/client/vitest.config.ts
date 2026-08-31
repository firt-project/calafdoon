import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@hel/api-client": path.resolve(
        __dirname,
        "../../packages/api-client/src/adapters/index.ts"
      ),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    exclude: ["src/mocks/**"],
  },
});
