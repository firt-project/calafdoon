/**
 * @deprecated Local-demo only. Production auth is Nest `/auth` via @hel/api-client.
 * Guarded by VITE_USE_LOCAL_DEMO — do not use as authoritative identity.
 */
import { z } from "zod";
import type { AppDataStore } from "@/types";

const STORAGE_KEY = "hel-calafkaaga-data-v1";

export const emptyStore = (): AppDataStore => ({
  version: 1,
  accounts: [],
  profiles: {},
  reactions: [],
  matches: [],
  messages: [],
  notifications: [],
  contacts: [],
  session: null,
});

const sessionSchema = z
  .object({
    userId: z.string().min(1),
    email: z.string().email(),
    createdAt: z.string(),
  })
  .nullable();

const storeSchema = z.object({
  version: z.literal(1),
  accounts: z.array(
    z.object({
      id: z.string(),
      email: z.string().email(),
      passwordHash: z.string().min(1),
      salt: z.string().min(1),
      createdAt: z.string(),
      updatedAt: z.string(),
    })
  ),
  profiles: z.record(z.string(), z.unknown()),
  reactions: z.array(z.unknown()),
  matches: z.array(z.unknown()),
  messages: z.array(z.unknown()),
  notifications: z.array(z.unknown()),
  contacts: z.array(z.unknown()),
  session: sessionSchema,
});

export type StorageErrorCode =
  | "unavailable"
  | "parse"
  | "validation"
  | "quota"
  | "unknown";

export class StorageError extends Error {
  code: StorageErrorCode;

  constructor(code: StorageErrorCode, message: string) {
    super(message);
    this.name = "StorageError";
    this.code = code;
  }
}

function assertBrowserStorage(): Storage {
  if (typeof window === "undefined" || !window.localStorage) {
    throw new StorageError(
      "unavailable",
      "Local storage is not available in this environment."
    );
  }
  return window.localStorage;
}

export const storageService = {
  key: STORAGE_KEY,

  read(): AppDataStore {
    try {
      const ls = assertBrowserStorage();
      const raw = ls.getItem(STORAGE_KEY);
      if (!raw) return emptyStore();
      const parsed: unknown = JSON.parse(raw);
      const result = storeSchema.safeParse(parsed);
      if (!result.success) {
        throw new StorageError(
          "validation",
          "Stored data failed validation. Try importing a valid backup or clearing data."
        );
      }
      return parsed as AppDataStore;
    } catch (err) {
      if (err instanceof StorageError) throw err;
      if (err instanceof SyntaxError) {
        throw new StorageError("parse", "Stored data is corrupted JSON.");
      }
      throw new StorageError(
        "unknown",
        err instanceof Error ? err.message : "Failed to read local data."
      );
    }
  },

  write(data: AppDataStore): void {
    try {
      const ls = assertBrowserStorage();
      const validated = storeSchema.safeParse(data);
      if (!validated.success) {
        throw new StorageError(
          "validation",
          "Refusing to save invalid application data."
        );
      }
      ls.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      if (err instanceof StorageError) throw err;
      if (
        err instanceof DOMException &&
        (err.name === "QuotaExceededError" || err.code === 22)
      ) {
        throw new StorageError(
          "quota",
          "Browser storage is full. Export and remove large photos, then try again."
        );
      }
      throw new StorageError(
        "unknown",
        err instanceof Error ? err.message : "Failed to save local data."
      );
    }
  },

  update(mutator: (current: AppDataStore) => AppDataStore): AppDataStore {
    const next = mutator(this.read());
    this.write(next);
    return next;
  },

  clear(): void {
    try {
      const ls = assertBrowserStorage();
      ls.removeItem(STORAGE_KEY);
    } catch (err) {
      throw new StorageError(
        "unknown",
        err instanceof Error ? err.message : "Failed to clear local data."
      );
    }
  },

  exportJson(): string {
    const data = this.read();
    return JSON.stringify(data, null, 2);
  },

  importJson(raw: string): AppDataStore {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new StorageError("parse", "Import file is not valid JSON.");
    }
    const result = storeSchema.safeParse(parsed);
    if (!result.success) {
      throw new StorageError(
        "validation",
        "Import file does not match Hel Calafkaaga data format (version 1)."
      );
    }
    const data = parsed as AppDataStore;
    this.write(data);
    return data;
  },
};
