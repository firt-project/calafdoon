"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LoadingRecovery } from "@/components/auth/loading-recovery";
import { Skeleton } from "@/components/ui/skeleton";
import { useLoadingTimeout } from "@/hooks/use-loading-timeout";
import { getPostLoginRoute } from "@/lib/post-login-route";
import { useUnifiedAuth } from "@/data/auth/hooks";
import { useApiAuth } from "@/components/auth/api-auth-provider";

/**
 * Redirects signed-in users away from login/register.
 * Never hide the form behind auth loading — Chrome guests must see login immediately.
 */
export function GuestGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, user } = useUnifiedAuth();
  const { accessState } = useApiAuth();
  const router = useRouter();
  const waitingOnUser = isAuthenticated && user === undefined;
  const stuck = useLoadingTimeout(waitingOnUser, 8_000);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    if (user === undefined || user === null) return;

    router.replace(getPostLoginRoute(user, accessState));
  }, [isAuthenticated, isLoading, router, user, accessState]);

  if (isAuthenticated && !isLoading) {
    if (waitingOnUser && stuck) {
      return (
        <div className="auth-bg flex min-h-dvh items-center justify-center px-4">
          <LoadingRecovery stuck />
        </div>
      );
    }

    return (
      <div className="auth-bg flex min-h-dvh items-center justify-center px-4">
        <Skeleton className="h-72 w-full max-w-md rounded-2xl" />
      </div>
    );
  }

  return <>{children}</>;
}
