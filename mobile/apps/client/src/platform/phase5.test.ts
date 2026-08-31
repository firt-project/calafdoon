import { describe, expect, it, vi } from "vitest";
import {
  intentFromDeltaX,
  shouldCommitSwipe,
  swipeThresholdPx,
} from "@/platform/swipe";
import { isValidPublicProfileId, publicIdFromProfilePath } from "@/platform/share-profile";
import { mapClientError } from "@/platform/errors";
import { ApiClientError } from "@hel/api-client";

describe("swipe threshold", () => {
  it("computes a sensible threshold from width", () => {
    expect(swipeThresholdPx(320)).toBeGreaterThanOrEqual(72);
    expect(swipeThresholdPx(320)).toBe(Math.round(320 * 0.28));
  });

  it("commits like/pass only past threshold", () => {
    const t = 90;
    expect(intentFromDeltaX(40, t)).toBeNull();
    expect(intentFromDeltaX(90, t)).toBe("like");
    expect(intentFromDeltaX(-90, t)).toBe("pass");
  });

  it("cancels short drags", () => {
    expect(shouldCommitSwipe(20, 0.1, 90)).toBeNull();
  });

  it("allows fast flick past half threshold", () => {
    expect(shouldCommitSwipe(50, 1.2, 90)).toBe("like");
    expect(shouldCommitSwipe(-50, -1.2, 90)).toBe("pass");
  });
});

describe("profile sharing validation", () => {
  it("rejects sequential ids and short ids", () => {
    expect(isValidPublicProfileId("12345")).toBe(false);
    expect(isValidPublicProfileId("abc")).toBe(false);
    expect(isValidPublicProfileId("local_profile_user-1")).toBe(true);
  });

  it("parses deep-link profile paths", () => {
    expect(publicIdFromProfilePath("/p/local_profile_abc")).toBe(
      "local_profile_abc"
    );
    expect(publicIdFromProfilePath("/p/12")).toBeNull();
  });
});

describe("error mapping", () => {
  it("maps auth expired", () => {
    const mapped = mapClientError(
      new ApiClientError({ message: "nope", status: 401 })
    );
    expect(mapped.kind).toBe("auth_expired");
  });

  it("maps offline status 0", () => {
    const mapped = mapClientError(
      new ApiClientError({ message: "offline", status: 0 })
    );
    expect(mapped.kind).toBe("offline");
  });
});

describe("chat draft keying", () => {
  it("keeps drafts namespaced per user and conversation", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
    const { saveChatDraft, loadChatDraft, clearChatDraft } = await import(
      "@/platform/chat-drafts"
    );
    await saveChatDraft("u1", "c1", "hello");
    expect(await loadChatDraft("u1", "c1")).toBe("hello");
    expect(await loadChatDraft("u2", "c1")).toBe("");
    await clearChatDraft("u1", "c1");
    expect(await loadChatDraft("u1", "c1")).toBe("");
    vi.unstubAllGlobals();
  });
});

describe("message dedupe", () => {
  it("dedupes by stable id", () => {
    const list = [
      { id: "a", message: "1" },
      { id: "a", message: "1-dup" },
      { id: "b", message: "2" },
    ];
    const seen = new Set<string>();
    const out = list.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
    expect(out).toHaveLength(2);
  });
});

describe("lazy route recovery copy", () => {
  it("exposes reload action labels in both locales", async () => {
    const { en } = await import("@/lib/i18n/translations/en");
    const { so } = await import("@/lib/i18n/translations/so");
    expect(en.mobilePhase5.reload).toBeTruthy();
    expect(so.mobilePhase5.reload).toBeTruthy();
    expect(en.mobilePhase5.biometricTitle).toBeTruthy();
    expect(so.mobilePhase5.biometricTitle).toBeTruthy();
  });
});
