"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type AdminUserAvatarProps = {
  name: string;
  imageUrl?: string | null;
  profileImageMediaId?: string | null;
  profileImageId?: string | null;
  className?: string;
};

/**
 * Admin avatar — signed imageUrl only (same as member photos).
 * Media ids are accepted for API shape compatibility but not required.
 */
export function AdminUserAvatar({
  name,
  imageUrl,
  className,
}: AdminUserAvatarProps) {
  return (
    <Avatar className={cn("h-11 w-11 border border-border", className)}>
      <AvatarImage src={imageUrl ?? undefined} alt="" />
      <AvatarFallback className="bg-muted font-semibold">
        {(name || "?").charAt(0)}
      </AvatarFallback>
    </Avatar>
  );
}
