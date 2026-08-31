"use client";

import { useEffect, useState } from "react";

/**
 * Profile / match photos use Nest signed imageUrl (same path as admin).
 * Do not call /media — that route is optional and often not required.
 */
export function useAuthenticatedMediaSrc(
  imageUrl?: string | null,
  _mediaId?: string | null
): string | undefined {
  const [src, setSrc] = useState<string | undefined>(imageUrl ?? undefined);

  useEffect(() => {
    setSrc(imageUrl ?? undefined);
  }, [imageUrl]);

  return src;
}
