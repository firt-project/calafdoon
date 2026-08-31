"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n/context";

export function DataLoadError({
  message,
  onRetry,
  className,
}: {
  message?: string | null;
  onRetry?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <Card className={className ?? "border-border"}>
      <CardContent className="py-12 px-6 text-center space-y-4">
        <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
          {message?.trim() || t("common.loadFailed")}
        </p>
        {onRetry ? (
          <Button type="button" variant="outline" onClick={onRetry}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t("common.retry")}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
