import type { ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface LazyImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
}

/** Lazy-loaded image — works with any remote URL (Convex storage, etc.). */
export function LazyImage({ className, loading = "lazy", decoding = "async", ...props }: LazyImageProps) {
  return (
    <img
      loading={loading}
      decoding={decoding}
      className={cn(className)}
      {...props}
    />
  );
}
