import { photos as photosApi } from "@hel/api-client";

/**
 * Every member must have at least one profile photo before they can use the
 * app. We check once per session and cache the result — the onboarding photo
 * screen marks it satisfied as soon as the first upload lands.
 */
type Gate = "unknown" | "ok" | "none";
let cache: Gate = "unknown";

export function getPhotoGate(): Gate {
  return cache;
}

export function markPhotoAdded(): void {
  cache = "ok";
}

export function resetPhotoGate(): void {
  cache = "unknown";
}

export async function refreshPhotoGate(): Promise<"ok" | "none"> {
  try {
    const res = (await photosApi.listMine()) as
      | { photos?: unknown[] }
      | unknown[];
    const list = Array.isArray(res)
      ? res
      : Array.isArray(res?.photos)
        ? res.photos
        : [];
    cache = list.length > 0 ? "ok" : "none";
  } catch {
    // Fail open — a network hiccup must never lock a real member out.
    cache = "ok";
  }
  return cache as "ok" | "none";
}
