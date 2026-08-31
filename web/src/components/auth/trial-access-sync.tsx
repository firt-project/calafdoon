"use client";

import { useEffect, useRef } from "react";
import { useEnsureProfile } from "@/data/profile/hooks";
import { useUnifiedAuth } from "@/data/auth/hooks";
import { isStaffRole } from "@/lib/access";

/** Backfill trial / profile flags for members. Staff accounts skip this. */
export function TrialAccessSync() {
  const ensureProfile = useEnsureProfile();
  const { user } = useUnifiedAuth();
  const syncedRef = useRef(false);

  useEffect(() => {
    if (user === undefined || user === null) return;
    const role = (user.profile as { role?: string } | null | undefined)?.role;
    if (isStaffRole(role)) return;
    if (syncedRef.current) return;
    syncedRef.current = true;
    void ensureProfile().catch(() => {
      syncedRef.current = false;
    });
  }, [ensureProfile, user]);

  return null;
}
