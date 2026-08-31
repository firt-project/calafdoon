import { Suspense, lazy, type ComponentType, type ReactNode } from "react";
import { ErrorBoundary } from "@/features/app/ErrorBoundary";

export function ChunkFallback({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="splash" aria-busy="true" aria-live="polite">
      <p className="muted">{label}</p>
    </div>
  );
}

export function ChunkLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="screen">
      <h1>Could not load this screen</h1>
      <p className="muted">
        A part of the app failed to download. Check your connection, then reload.
      </p>
      <button type="button" className="btn btn-primary" onClick={onRetry}>
        Reload
      </button>
    </div>
  );
}

export function lazyPage<P extends object>(
  loader: () => Promise<{ default: ComponentType<P> }>
) {
  return lazy(loader);
}

export function LazyRoute({
  children,
  label = "Loading…",
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<ChunkFallback label={label} />}>{children}</Suspense>
    </ErrorBoundary>
  );
}
