"use client";

import { useCallback, useState } from "react";
import { useUnifiedAuth } from "@/data/auth/hooks";

/** Sign out and leave the app shell — do not stay on a protected page. */
export function useSignOut(redirectTo = "/login") {
  const { signOut } = useUnifiedAuth();
  const [pending, setPending] = useState(false);

  const handleSignOut = useCallback(async () => {
    if (pending) return;
    setPending(true);
    try {
      await signOut();
    } catch {
      // Still leave the session UI even if the network call fails.
    } finally {
      window.location.assign(redirectTo);
    }
  }, [pending, redirectTo, signOut]);

  return { signOut: handleSignOut, pending };
}
