"use client";

import { toast } from "sonner";
import { Ban, ShieldOff } from "lucide-react";
import { useMyBlocks, useUnblockUser } from "@/data/moderation/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/lib/i18n/context";
import { getSafeUserError } from "@/lib/safe-error";

type BlockedRow = {
  blockedUserId: string;
  name: string;
  createdAt: number;
};

export function BlockedUsersCard({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation();
  const blockedUsers = useMyBlocks() as BlockedRow[] | undefined;
  const unblockUser = useUnblockUser();

  const handleUnblock = async (blockedUserId: string, name: string) => {
    try {
      await unblockUser({ blockedUserId });
      toast.success(t("safety.unblockedToast", { name }));
    } catch (error) {
      toast.error(getSafeUserError(error, t("safety.actionFailed"))
      );
    }
  };

  if (blockedUsers === undefined) {
    return <Skeleton className={embedded ? "h-24 w-full" : "h-32 w-full rounded-2xl"} />;
  }

  const content = (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("safety.blockedUsersDesc")}</p>
      {blockedUsers.length === 0 ? (
        <p className="text-sm text-muted-foreground rounded-xl border border-dashed border-border px-4 py-6 text-center">
          {t("safety.noBlockedUsers")}
        </p>
      ) : (
        <div className="space-y-2">
          {blockedUsers.map((blocked) => (
            <div
              key={blocked.blockedUserId}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{blocked.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t("safety.blockedOn", {
                    date: new Date(blocked.createdAt).toLocaleDateString(),
                  })}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  handleUnblock(blocked.blockedUserId, blocked.name)
                }
              >
                <ShieldOff className="h-4 w-4 mr-1.5" />
                {t("safety.unblock")}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (embedded) return content;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Ban className="h-4 w-4 text-muted-foreground" />
          {t("safety.blockedUsersTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}
