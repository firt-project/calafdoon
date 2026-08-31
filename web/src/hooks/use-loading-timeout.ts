"use client";

import { useEffect, useState } from "react";

/** Flip to true after `ms` while `pending` stays true (e.g. Convex query stuck). */
export function useLoadingTimeout(pending: boolean, ms = 8_000) {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!pending) {
      setTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setTimedOut(true), ms);
    return () => clearTimeout(timer);
  }, [pending, ms]);

  return timedOut;
}
