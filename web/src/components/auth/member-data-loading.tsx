"use client";

import { LoadingRecovery } from "@/components/auth/loading-recovery";
import { useLoadingTimeout } from "@/hooks/use-loading-timeout";

/** Shared “Loading your data…” with retry after hang. */
export function MemberDataLoading({
  pending = true,
  timeoutMs = 8_000,
}: {
  pending?: boolean;
  timeoutMs?: number;
}) {
  const stuck = useLoadingTimeout(pending, timeoutMs);
  return <LoadingRecovery stuck={stuck} />;
}
