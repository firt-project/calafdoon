"use client";

import { LazyImage } from "@/components/ui/lazy-image";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type AuthenticatedMediaImageProps = {
  imageUrl?: string | null;
  /** Ignored — kept for call-site compatibility. Photos use signed imageUrl. */
  mediaId?: string | null;
  alt: string;
  className?: string;
  fallbackName?: string;
};

/**
 * Member profile photo — same approach as admin: render the signed imageUrl.
 * No /media proxy (avoids blank photos when that route is not deployed).
 */
export function AuthenticatedMediaImage({
  imageUrl,
  alt,
  className,
  fallbackName,
}: AuthenticatedMediaImageProps) {
  if (imageUrl) {
    return <LazyImage src={imageUrl} alt={alt} className={cn(className)} />;
  }
  if (fallbackName) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/10 to-muted",
          className
        )}
      >
        <Avatar className="h-24 w-24">
          <AvatarFallback className="text-3xl font-display">
            {fallbackName.charAt(0) || "?"}
          </AvatarFallback>
        </Avatar>
      </div>
    );
  }
  return null;
}
