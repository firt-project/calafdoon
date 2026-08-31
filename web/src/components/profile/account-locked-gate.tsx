"use client";

import Link from "next/link";
import { PauseCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AccountLockedGate({
  status,
  className,
}: {
  status: "paused" | "suspended" | "banned";
  className?: string;
}) {
  const title =
    status === "paused" ? "Account paused" : "Account unavailable";
  const body =
    status === "paused"
      ? "Matching and messaging are temporarily unavailable while your account is paused."
      : "Matching and messaging are unavailable for this account.";

  return (
    <Card className={cn("border-border max-w-lg mx-auto", className)}>
      <CardContent className="p-6 sm:p-8 space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300">
          <PauseCircle className="h-6 w-6" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
        </div>
        <Button asChild className="rounded-xl">
          <Link href="/account-status">View account status</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
