import { SITE_BRAND_NAME } from "@/lib/constants";
import { cn } from "@/utils/cn";

type BrandLogoProps = {
  size?: "sm" | "md" | "lg" | "hero";
  showWordmark?: boolean;
  showTag?: boolean;
  light?: boolean;
  className?: string;
};

const SIZE = {
  sm: 36,
  md: 52,
  lg: 72,
  hero: 96,
} as const;

export function BrandLogo({
  size = "md",
  showWordmark = true,
  showTag = true,
  light = false,
  className,
}: BrandLogoProps) {
  const px = SIZE[size];
  return (
    <div className={cn("brand-logo", light && "brand-logo-light", className)}>
      <img
        src="/brand/logo.svg"
        alt=""
        width={px}
        height={px}
        className="brand-logo-mark"
        decoding="async"
      />
      {showWordmark ? (
        <div className="brand-logo-text">
          <span className="brand-logo-name">{SITE_BRAND_NAME}</span>
          {showTag ? (
            <span className="brand-logo-tag">Halal marriage matchmaking</span>
          ) : null}
        </div>
      ) : (
        <span className="sr-only">{SITE_BRAND_NAME}</span>
      )}
    </div>
  );
}
