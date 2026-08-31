import { describe, expect, it } from "vitest";
import { createSecureAuthTokenStore } from "@/platform/secure-storage";

describe("secure auth token store (web)", () => {
  it("round-trips session and csrf tokens via sessionStorage", async () => {
    sessionStorage.clear();
    const store = createSecureAuthTokenStore();
    await store.setSessionToken("sess-1");
    await store.setCsrfToken("csrf-1");
    expect(await store.getSessionToken()).toBe("sess-1");
    expect(await store.getCsrfToken()).toBe("csrf-1");
    await store.setSessionToken(null);
    await store.setCsrfToken(null);
    expect(await store.getSessionToken()).toBeUndefined();
    expect(await store.getCsrfToken()).toBeUndefined();
  });
});
