import { describe, expect, it } from "vitest";
import { isAllowedDeepLinkPath } from "@/navigation/deep-links";

describe("deep-link profile navigation", () => {
  it("allows opaque share paths", () => {
    expect(isAllowedDeepLinkPath("/p/local_profile_abc123")).toBe(true);
  });

  it("still blocks admin paths", () => {
    expect(isAllowedDeepLinkPath("/admin")).toBe(false);
  });
});
