import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  securityHomeRoute,
  useSession,
} from "@/features/auth/SessionProvider";
import { BrandLogo } from "@/ui/BrandLogo";
import { readClientEnv } from "@/platform/env";

export function SplashPage() {
  const { ready, user, accessState, error, offline, bootSlow, refresh } =
    useSession();
  const [retrying, setRetrying] = useState(false);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => setShowHint(true), 5_000);
    return () => clearTimeout(t);
  }, [ready]);

  async function onRetry() {
    setRetrying(true);
    try {
      await refresh();
    } finally {
      setRetrying(false);
    }
  }

  if (!ready) {
    let apiHost = "the server";
    try {
      apiHost = new URL(readClientEnv().apiUrl).host;
    } catch {
      /* env may throw only after ready in practice */
    }
    return (
      <div className="splash" aria-busy="true" aria-live="polite">
        <BrandLogo size="hero" light showWordmark className="splash-logo" />
        <p className="muted">
          {showHint
            ? `Still connecting to ${apiHost}…`
            : "Preparing your session…"}
        </p>
        {error ? <p className="muted">{error}</p> : null}
        {showHint ? (
          <p className="muted" style={{ fontSize: "0.85rem", maxWidth: 280, margin: "0 auto" }}>
            First open after idle can take up to a minute while the API wakes up.
          </p>
        ) : null}
      </div>
    );
  }

  if (user) {
    return <Navigate to={securityHomeRoute(user, accessState)} replace />;
  }

  if (offline || bootSlow || error) {
    return (
      <div className="splash" aria-live="polite">
        <BrandLogo size="hero" light showWordmark className="splash-logo" />
        <p className="muted">
          {error
            ? error
            : "Could not reach the server yet. You can retry or continue to sign in."}
        </p>
        <div
          className="stack"
          style={{ gap: "0.65rem", width: "min(100%, 280px)", margin: "0.5rem auto 0" }}
        >
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={retrying}
            onClick={() => void onRetry()}
          >
            {retrying ? "Retrying…" : "Retry connection"}
          </button>
          <Link className="btn btn-secondary btn-block" to="/welcome">
            Continue
          </Link>
        </div>
      </div>
    );
  }

  return <Navigate to="/welcome" replace />;
}
