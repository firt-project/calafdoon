import { useEffect, useMemo, useState } from "react";

type Props = {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackText?: string;
  aspectRatio?: string;
};

/** Lazy image with skeleton + tasteful fallback; never logs URLs. */
export function SafeImage({
  src,
  alt,
  className,
  fallbackText = "?",
  aspectRatio = "3 / 4",
}: Props) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [src]);

  const showImg = Boolean(src) && !failed;
  const initial = useMemo(
    () => (fallbackText || "?").trim().slice(0, 1).toUpperCase() || "?",
    [fallbackText]
  );

  return (
    <div
      className={className}
      style={{
        position: "relative",
        aspectRatio,
        overflow: "hidden",
        background: "var(--surface-2)",
      }}
    >
      {!loaded && showImg && <div className="skeleton" style={{ position: "absolute", inset: 0 }} />}
      {showImg ? (
        <img
          src={src!}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: loaded ? 1 : 0,
            transition: "opacity 180ms ease",
          }}
        />
      ) : (
        <div
          className="safe-image-fallback"
          role="img"
          aria-label={alt}
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            fontFamily: "var(--font-display)",
            fontSize: "3rem",
            color: "var(--muted-foreground)",
          }}
        >
          {initial}
        </div>
      )}
    </div>
  );
}
