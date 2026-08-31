"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { LazyImage } from "@/components/ui/lazy-image";
import { cn } from "@/lib/utils";

interface ProfilePhotoPreviewProps {
  imageUrl?: string | null;
  hasStoredPhoto?: boolean;
  alt: string;
  fallbackInitial?: string;
  className?: string;
  imageClassName?: string;
}

/** Shows a photo, or a letter fallback (never an endless spinner). */
export function ProfilePhotoPreview({
  imageUrl,
  hasStoredPhoto = false,
  alt,
  fallbackInitial = "?",
  className,
  imageClassName,
}: ProfilePhotoPreviewProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [imageUrl]);

  if (imageUrl && !failed) {
    return (
      <div className={cn("relative overflow-hidden", className)}>
        <LazyImage
          src={imageUrl}
          alt={alt}
          loading="eager"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(true);
            setFailed(true);
          }}
          className={cn("h-full w-full object-cover", imageClassName)}
        />
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    );
  }

  // Stored photo but no usable URL yet — show initial, not a forever spinner.
  if (hasStoredPhoto && !imageUrl) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted text-3xl font-semibold",
          className
        )}
      >
        {fallbackInitial.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center bg-muted text-3xl font-semibold",
        className
      )}
    >
      {fallbackInitial.charAt(0).toUpperCase()}
    </div>
  );
}
