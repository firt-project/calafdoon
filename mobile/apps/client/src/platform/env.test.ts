import { describe, expect, it, vi } from "vitest";

describe("client env", () => {
  it("readClientEnv returns configured API URL", async () => {
    vi.stubEnv("VITE_API_URL", "http://127.0.0.1:4000");
    vi.stubEnv("VITE_SOCKET_URL", "http://127.0.0.1:4000");
    vi.stubEnv("VITE_USE_LOCAL_DEMO", "false");
    vi.resetModules();
    const { readClientEnv } = await import("@/platform/env");
    const env = readClientEnv();
    expect(env.useLocalDemo).toBe(false);
    expect(env.apiUrl).toContain("4000");
  });
});
