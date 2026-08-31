"use client";

import { useCallback, useEffect, useState } from "react";
import { apiPhotos } from "./api";

/** Drop-in upload helper that preserves EXIF strip via prepareImageForUpload. */
export function useUploadPhoto() {
  return useCallback(
    async (
      file: File,
      opts?: { slot?: "main" | "additional" | "private" }
    ) => apiPhotos.uploadFile(file, opts),
    []
  );
}

export function useAddAdditionalPhoto() {
  return useCallback(
    async (args: Record<string, unknown>) => apiPhotos.addAdditional(args),
    []
  );
}

export function useRemoveAdditionalPhoto() {
  return useCallback(
    async (id: string) => apiPhotos.removeAdditional(id),
    []
  );
}

export function useMyPhotos(enabled = true) {
  const [data, setData] = useState<unknown>(undefined);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) {
      setData(undefined);
      return;
    }
    let cancelled = false;
    void apiPhotos
      .listMine()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, tick]);
  const refresh = useCallback(() => setTick((n) => n + 1), []);
  return { data, refresh };
}
