import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyStore, storageService } from "@/storage/storage-service";

describe("storageService", () => {
  beforeEach(() => {
    const map = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
      removeItem: (k: string) => {
        map.delete(k);
      },
    });
    vi.stubGlobal("window", { localStorage: globalThis.localStorage });
  });

  it("round-trips export/import", () => {
    const data = emptyStore();
    data.accounts.push({
      id: "user_1",
      email: "test@example.com",
      passwordHash: "hash",
      salt: "salt",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    storageService.write(data);
    const exported = storageService.exportJson();
    storageService.clear();
    expect(storageService.read().accounts).toHaveLength(0);
    storageService.importJson(exported);
    expect(storageService.read().accounts[0]?.email).toBe("test@example.com");
  });

  it("rejects invalid import JSON", () => {
    expect(() => storageService.importJson("{not-json")).toThrow(/valid JSON/i);
    expect(() => storageService.importJson('{"version":2}')).toThrow(/version 1/i);
  });
});
