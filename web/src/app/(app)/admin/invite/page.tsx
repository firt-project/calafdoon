"use client";

import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import ApiAdminInviteContent from "./api-invite-content";

export default function AdminInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="auth-bg flex min-h-[calc(100dvh-var(--app-header))] items-center justify-center px-4">
          <Skeleton className="h-72 w-full max-w-md rounded-2xl" />
        </div>
      }
    >
      <ApiAdminInviteContent />
    </Suspense>
  );
}
