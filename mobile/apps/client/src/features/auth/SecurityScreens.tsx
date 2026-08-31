import { FormEvent, useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { auth, ApiClientError } from "@hel/api-client";
import {
  securityHomeRoute,
  useSession,
} from "@/features/auth/SessionProvider";
import { userFacingError } from "@/platform/errors";

export function VerifyEmailPage() {
  const { user, ready, refresh, logout, accessState } = useSession();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const verified = user?.emailVerified !== false;

  useEffect(() => {
    if (!ready) return;
    if (!user && !token) {
      navigate("/login", { replace: true });
    }
  }, [ready, user, token, navigate]);

  useEffect(() => {
    if (!ready || !token || verified) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      setError(null);
      try {
        await auth.verifyEmail(token);
        if (cancelled) return;
        setStatus("Email verified.");
        await refresh();
        if (!cancelled) navigate("/", { replace: true });
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof ApiClientError
              ? e.message
              : "Could not verify that link. Request a new email."
          );
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // One-shot per token
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, token]);

  useEffect(() => {
    if (!ready || !user || token) return;
    if (verified) {
      navigate(securityHomeRoute(user, accessState), { replace: true });
    }
  }, [ready, user, verified, token, accessState, navigate]);

  async function onResend() {
    setResending(true);
    setError(null);
    setStatus(null);
    try {
      await auth.resendVerification();
      setStatus("Verification email sent. Check your inbox.");
    } catch (e) {
      setError(userFacingError(e));
    } finally {
      setResending(false);
    }
  }

  if (!ready || busy) {
    return (
      <div className="screen" aria-busy="true">
        <p className="muted center" style={{ marginTop: "30vh" }}>
          {busy ? "Verifying your email…" : "Loading…"}
        </p>
      </div>
    );
  }

  return (
    <div className="screen pad">
      <header className="screen-header">
        <h1>Verify your email</h1>
      </header>
      <p className="muted">
        We sent a link to <strong>{user?.email ?? "your email"}</strong>. Open it
        on this device, or request a new one.
      </p>
      {error ? (
        <div className="form-error" role="alert">
          {error}
        </div>
      ) : null}
      {status ? (
        <div className="form-success" role="status">
          {status}
        </div>
      ) : null}
      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={resending || !user}
        onClick={() => void onResend()}
      >
        {resending ? "Sending…" : "Resend verification email"}
      </button>
      <button
        type="button"
        className="btn btn-secondary btn-block"
        onClick={() => void logout().then(() => navigate("/login"))}
      >
        Sign out
      </button>
    </div>
  );
}

export function ForcedChangePasswordPage() {
  const { user, ready, logout } = useSession();
  const navigate = useNavigate();
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (ready && !user) return <Navigate to="/login" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirm) {
      setError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await auth.changePassword(currentPassword, newPassword);
      await logout();
      navigate("/login", { replace: true });
    } catch (err) {
      setError(userFacingError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen pad">
      <header className="screen-header">
        <h1>Change password</h1>
      </header>
      <p className="muted">
        For your security, you must set a new password before using the app.
      </p>
      {error ? (
        <div className="form-error" role="alert">
          {error}
        </div>
      ) : null}
      <form className="form" onSubmit={(e) => void onSubmit(e)}>
        <label>
          Current password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </label>
        <label>
          New password
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNew(e.target.value)}
          />
        </label>
        <label>
          Confirm new password
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? "Saving…" : "Update password"}
        </button>
      </form>
    </div>
  );
}

export function EnrollMfaPage() {
  const { user, ready, refresh, logout } = useSession();
  const navigate = useNavigate();
  const [step, setStep] = useState<"start" | "confirm" | "codes">("start");
  const [secret, setSecret] = useState("");
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (ready && !user) return <Navigate to="/login" replace />;

  async function startEnroll() {
    setBusy(true);
    setError(null);
    try {
      const res = await auth.mfaEnrollStart();
      setSecret(res.secret);
      setQr(res.qrCodeDataUrl);
      setStep("confirm");
    } catch (e) {
      setError(userFacingError(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnroll(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await auth.mfaEnrollConfirm(code.trim());
      setRecovery(res.recoveryCodes ?? []);
      setStep("codes");
    } catch (err) {
      setError(userFacingError(err));
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    await refresh();
    navigate("/", { replace: true });
  }

  return (
    <div className="screen pad">
      <header className="screen-header">
        <h1>Set up two-factor auth</h1>
      </header>
      <p className="muted">
        Staff accounts need an authenticator app (Google Authenticator, Authy,
        etc.).
      </p>
      {error ? (
        <div className="form-error" role="alert">
          {error}
        </div>
      ) : null}

      {step === "start" ? (
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={busy}
          onClick={() => void startEnroll()}
        >
          {busy ? "Preparing…" : "Start setup"}
        </button>
      ) : null}

      {step === "confirm" ? (
        <form className="form" onSubmit={(e) => void confirmEnroll(e)}>
          {qr ? (
            <img
              src={qr}
              alt="MFA QR code"
              style={{ width: 180, height: 180, margin: "0 auto", display: "block" }}
            />
          ) : null}
          <p className="muted small center">
            Or enter secret: <code>{secret}</code>
          </p>
          <label>
            6-digit code
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              minLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
            />
          </label>
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "Confirming…" : "Confirm"}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-block"
            onClick={() => void auth.mfaEnrollCancel().catch(() => undefined)}
          >
            Cancel
          </button>
        </form>
      ) : null}

      {step === "codes" ? (
        <div className="stack" style={{ gap: "0.75rem" }}>
          <p>
            Save these recovery codes somewhere safe. Each code works once.
          </p>
          <ul className="admin-activity-list">
            {recovery.map((c) => (
              <li key={c}>
                <code>{c}</code>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-primary btn-block" onClick={() => void finish()}>
            Done
          </button>
        </div>
      ) : null}

      <button
        type="button"
        className="btn btn-secondary btn-block"
        style={{ marginTop: "1rem" }}
        onClick={() => void logout().then(() => navigate("/login"))}
      >
        Sign out
      </button>
    </div>
  );
}
