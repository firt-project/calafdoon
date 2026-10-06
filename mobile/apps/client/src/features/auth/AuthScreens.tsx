import { FormEvent, useMemo, useState, type HTMLAttributes, type ReactNode } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { auth } from "@hel/api-client";
import { securityHomeRoute, useSession } from "@/features/auth/SessionProvider";
import { SITE_BRAND_NAME } from "@/lib/constants";
import { BrandLogo } from "@/ui/BrandLogo";
import { cn } from "@/utils/cn";

export { SplashPage } from "@/features/auth/SplashPage";

function AuthShell({
  children,
  backTo,
  hero = false,
  plain = false,
  sheet = false,
}: {
  children: ReactNode;
  backTo?: string;
  hero?: boolean;
  /** Flat, calm background (no decorative orbs) for form-heavy screens. */
  plain?: boolean;
  /** 2026 layout: hero photo header + rounded form sheet sliding up over it. */
  sheet?: boolean;
}) {
  const focusIntoView = (e: React.FocusEvent) => {
    const t = e.target as HTMLElement;
    if (t.matches("input, textarea, select")) {
      // Wait for the keyboard to finish resizing, then bring the field into view.
      window.setTimeout(() => t.scrollIntoView({ block: "center", behavior: "smooth" }), 300);
    }
  };

  if (sheet) {
    return (
      <div className="auth-sheet-layout" onFocus={focusIntoView}>
        <div className="auth-sheet-hero">
          <img src="/images/hero-couple.jpg" alt="" />
          <div className="auth-sheet-scrim" aria-hidden />
          {backTo ? (
            <Link to={backTo} className="auth-back auth-sheet-back" aria-label="Back">
              <ArrowLeft size={20} />
            </Link>
          ) : null}
          <div className="auth-sheet-brand">
            <img src="/brand/logo.svg" alt="" width={40} height={40} />
            <span>{SITE_BRAND_NAME}</span>
          </div>
        </div>
        <main className="auth-sheet">{children}</main>
      </div>
    );
  }

  return (
    <div
      className={cn("auth-layout", hero && "auth-layout-hero", plain && "auth-layout-plain")}
      onFocus={(e) => {
        const t = e.target as HTMLElement;
        if (t.matches("input, textarea, select")) {
          // Wait for the iOS keyboard to finish resizing, then bring the field into view.
          window.setTimeout(() => t.scrollIntoView({ block: "center", behavior: "smooth" }), 300);
        }
      }}
    >
      {hero ? (
        <div className="auth-hero-media" aria-hidden>
          <img src="/images/hero-couple.jpg" alt="" />
          <div className="auth-hero-scrim" />
        </div>
      ) : plain ? null : (
        <div className="auth-soft-bg" aria-hidden>
          <span className="auth-orb auth-orb-a" />
          <span className="auth-orb auth-orb-b" />
        </div>
      )}
      {backTo ? (
        <header className="auth-topbar">
          <Link to={backTo} className="auth-back" aria-label="Back">
            <ArrowLeft size={20} />
          </Link>
          <BrandLogo size="sm" showWordmark={false} className="auth-topbar-logo" />
          <span className="auth-topbar-spacer" />
        </header>
      ) : null}
      <div className="auth-body">{children}</div>
    </div>
  );
}

function AuthField({
  id,
  label,
  type,
  value,
  onChange,
  autoComplete,
  inputMode,
  required,
  minLength,
  leading,
  trailing,
  hint,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  required?: boolean;
  minLength?: number;
  leading?: ReactNode;
  trailing?: ReactNode;
  hint?: string;
}) {
  return (
    <label className="auth-field float" htmlFor={id}>
      <span className={cn("auth-field-shell", Boolean(leading) && "has-leading")}>
        {leading ? <span className="auth-field-leading">{leading}</span> : null}
        <input
          id={id}
          type={type}
          autoComplete={autoComplete}
          inputMode={inputMode}
          required={required}
          minLength={minLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder=" "
        />
        <span className="auth-field-label">{label}</span>
        {trailing}
      </span>
      {hint ? <span className="auth-field-hint">{hint}</span> : null}
    </label>
  );
}

function passwordScore(password: string) {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return Math.min(score, 4);
}

function PasswordStrength({ password }: { password: string }) {
  const score = passwordScore(password);
  const labels = ["Too short", "Weak", "Okay", "Strong", "Excellent"];
  if (!password) return null;
  return (
    <div className="auth-strength" aria-live="polite">
      <div className="auth-strength-bars" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn("auth-strength-bar", score > i && `lvl-${score}`)} />
        ))}
      </div>
      <span>{labels[score]}</span>
    </div>
  );
}

export function WelcomePage() {
  const { user, accessState } = useSession();
  const navigate = useNavigate();
  if (user) return <Navigate to={securityHomeRoute(user, accessState)} replace />;
  return (
    <AuthShell hero>
      <div className="welcome-content">
        <div className="welcome-brand">
          <BrandLogo size="hero" light showTag={false} className="welcome-logo" />
        </div>
        <div className="welcome-cta">
          <button
            type="button"
            className="btn btn-welcome-primary btn-block btn-lg"
            onClick={() => navigate("/register")}
          >
            Create account
          </button>
          <button
            type="button"
            className="btn btn-welcome-secondary btn-block btn-lg"
            onClick={() => navigate("/login")}
          >
            Sign in
          </button>
          <p className="muted" style={{ textAlign: "center", fontSize: "0.75rem", opacity: 0.7 }}>
            App v1.1.4
          </p>
          <div className="auth-legal-row welcome-legal">
            <button
              type="button"
              className="link-quiet"
              onClick={() => navigate("/legal/privacy")}
            >
              Privacy
            </button>
            <span aria-hidden>·</span>
            <button
              type="button"
              className="link-quiet"
              onClick={() => navigate("/legal/terms")}
            >
              Terms
            </button>
          </div>
        </div>
      </div>
    </AuthShell>
  );
}

export function LoginPage() {
  const { login, verifyMfaLogin, user, accessState, error, clearError } =
    useSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  if (user) {
    return <Navigate to={securityHomeRoute(user, accessState)} replace />;
  }

  async function finishSignedIn() {
    // Re-read /auth/me so routing uses fresh accessState (not a stale Home).
    try {
      const boot = await auth.bootstrapMe();
      const dest = securityHomeRoute(boot.user, boot.accessState);
      navigate(dest || "/welcome", { replace: true });
    } catch {
      navigate("/", { replace: true });
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    clearError();
    setBusy(true);
    try {
      const result = await login(email.trim(), password);
      if ("mfaRequired" in result && result.mfaRequired) {
        setMfaToken(result.mfaToken);
        setMfaCode("");
        return;
      }
      await finishSignedIn();
    } catch {
      /* error in context */
    } finally {
      setBusy(false);
    }
  }

  async function onVerifyMfa(e: FormEvent) {
    e.preventDefault();
    if (!mfaToken) return;
    clearError();
    setBusy(true);
    try {
      await verifyMfaLogin(mfaToken, mfaCode.trim());
      setMfaToken(null);
      setMfaCode("");
      await finishSignedIn();
    } catch {
      /* error in context */
    } finally {
      setBusy(false);
    }
  }

  if (mfaToken) {
    return (
      <AuthShell backTo="/login" sheet>
        <div className="reg">
          <header className="reg-head">
            <h1 className="font-display">Verification code</h1>
            <p>
              Enter the 6-digit code from your authenticator app, or a recovery
              code.
            </p>
          </header>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <form className="auth-form reg-form" onSubmit={(ev) => void onVerifyMfa(ev)}>
            <AuthField
              id="mfa-code"
              label="Code"
              type="text"
              autoComplete="one-time-code"
              inputMode="numeric"
              required
              value={mfaCode}
              onChange={setMfaCode}
              leading={<Lock size={18} aria-hidden />}
            />
            <button
              className="btn btn-primary btn-block btn-lg reg-cta"
              disabled={busy || mfaCode.trim().length < 6}
              type="submit"
            >
              {busy ? "Verifying…" : "Verify"}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-block"
              onClick={() => {
                setMfaToken(null);
                setMfaCode("");
                clearError();
              }}
            >
              Back to sign in
            </button>
          </form>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell backTo="/welcome" sheet>
      <div className="reg">
        <header className="reg-head">
          <h1 className="font-display">Welcome back</h1>
          <p>Sign in to continue to {SITE_BRAND_NAME}.</p>
        </header>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <form className="auth-form reg-form" onSubmit={onSubmit}>
          <AuthField
            id="login-email"
            label="Email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={setEmail}
            leading={<Mail size={18} aria-hidden />}
          />
          <AuthField
            id="login-password"
            label="Password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            minLength={8}
            value={password}
            onChange={setPassword}
            leading={<Lock size={18} aria-hidden />}
            trailing={
              <button
                type="button"
                className="auth-field-toggle"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            }
          />
          <div className="reg-forgot">
            <Link to="/forgot-password">Forgot password?</Link>
          </div>
          <button className="btn btn-primary btn-block btn-lg reg-cta" disabled={busy} type="submit">
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="reg-switch">
          New here? <Link to="/register">Create account</Link>
        </p>
        <p className="reg-secure">
          <Lock size={14} aria-hidden /> Your details are private and never shared.
        </p>
      </div>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { register, user, accessState, error, clearError } = useSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const matchOk = useMemo(
    () => !confirm || password === confirm,
    [password, confirm]
  );

  if (user) return <Navigate to={securityHomeRoute(user, accessState)} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    clearError();
    setLocalError(null);
    if (password !== confirm) {
      setLocalError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setLocalError("Password must be at least 8 characters");
      return;
    }
    if (!accepted) {
      setLocalError("Please accept the Terms and Privacy Policy");
      return;
    }
    setBusy(true);
    try {
      await register(email.trim(), password);
      navigate("/", { replace: true });
    } catch {
      /* context */
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell backTo="/welcome" sheet>
      <div className="reg">
        <header className="reg-head">
          <h1 className="font-display">Create your account</h1>
          <p>Join {SITE_BRAND_NAME}. You must be 18 or older.</p>
        </header>
        {(localError || error) && (
          <div className="form-error" role="alert">
            {localError ||
              (/unable to create account/i.test(error ?? "")
                ? "We couldn't create this account. If you already registered with this email, try signing in instead."
                : error)}
          </div>
        )}
        <form className="auth-form reg-form" onSubmit={onSubmit}>
          <AuthField
            id="register-email"
            label="Email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={setEmail}
            leading={<Mail size={18} aria-hidden />}
          />
          <AuthField
            id="register-password"
            label="Password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={setPassword}
            leading={<Lock size={18} aria-hidden />}
            trailing={
              <button
                type="button"
                className="auth-field-toggle"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            }
            hint={password ? undefined : "Use at least 8 characters."}
          />
          <PasswordStrength password={password} />
          <AuthField
            id="register-confirm"
            label="Confirm password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={8}
            value={confirm}
            onChange={setConfirm}
            leading={<Lock size={18} aria-hidden />}
          />
          {!matchOk && (
            <p className="auth-inline-error" role="status">
              Passwords do not match
            </p>
          )}
          <label className="auth-check" htmlFor="register-terms">
            <span className={cn("auth-checkbox", accepted && "is-checked")}>
              <input
                id="register-terms"
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
              />
              {accepted ? <Check size={14} strokeWidth={3} aria-hidden /> : null}
            </span>
            <span className="auth-check-copy">
              I agree to the <Link to="/legal/terms">Terms</Link> and{" "}
              <Link to="/legal/privacy">Privacy Policy</Link>, and confirm I am 18+.
            </span>
          </label>
          <button
            className="btn btn-primary btn-block btn-lg reg-cta"
            disabled={busy || !accepted || !matchOk}
            type="submit"
          >
            {busy ? "Creating…" : "Continue"}
          </button>
        </form>
        <p className="reg-switch">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
        <p className="reg-secure">
          <Lock size={14} aria-hidden /> Your details are private and never shared.
        </p>
      </div>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { auth } = await import("@hel/api-client");
      await auth.forgotPassword(email.trim());
      setMessage(
        "If that email is registered, reset instructions were sent. Check your inbox."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell backTo="/login" sheet>
      <div className="reg">
        <header className="reg-head">
          <h1 className="font-display">Reset your password</h1>
          <p>Enter your account email and we’ll send you a reset link.</p>
        </header>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        {message && (
          <div className="form-success" role="status">
            {message}
          </div>
        )}
        <form className="auth-form reg-form" onSubmit={onSubmit}>
          <AuthField
            id="forgot-email"
            label="Email"
            type="email"
            required
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={setEmail}
            leading={<Mail size={18} aria-hidden />}
          />
          <button className="btn btn-primary btn-block btn-lg reg-cta" disabled={busy} type="submit">
            {busy ? "Sending…" : "Send reset link"}
          </button>
        </form>
        <p className="reg-switch">
          <Link to="/login">Back to sign in</Link>
        </p>
      </div>
    </AuthShell>
  );
}
