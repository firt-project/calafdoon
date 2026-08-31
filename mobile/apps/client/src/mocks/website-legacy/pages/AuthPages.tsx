import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { GuestOnly } from "@/components/auth/gates";
import { bumpData, useApp } from "@/hooks/use-app";
import { useTranslation } from "@/lib/i18n/context";
import { SITE_BRAND_NAME } from "@/lib/constants";
import { authService, passwordSchema } from "@/services/auth-service";
import { safeErrorMessage } from "@/utils/cn";
import { ZodError } from "zod";

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { refresh } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      passwordSchema.parse(password);
      const session = await authService.login(email, password);
      bumpData();
      refresh();
      navigate(authService.getHomeRoute(session.userId));
    } catch (err) {
      if (err instanceof ZodError) setError(err.issues[0]?.message ?? t("validation.invalidCredentials"));
      else setError(safeErrorMessage(err, t("validation.invalidCredentials")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <GuestOnly>
      <MarketingLayout>
        <section className="section">
          <div className="container-narrow card" style={{ padding: "1.75rem" }}>
            <p className="badge">{t("auth.signInEyebrow")}</p>
            <h1 className="font-display" style={{ marginTop: "0.75rem" }}>
              {t("auth.welcomeBack")}
            </h1>
            <p className="muted">{t("auth.signInDesc", { name: SITE_BRAND_NAME })}</p>
            {error && <div className="form-error">{error}</div>}
            <form onSubmit={onSubmit}>
              <div className="field">
                <label htmlFor="email">{t("auth.email")}</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="password">{t("auth.password")}</label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={busy}>
                {busy ? t("auth.signingIn") : t("auth.signIn")}
              </button>
            </form>
            <p className="muted" style={{ marginTop: "1rem" }}>
              <Link to="/forgot-password">{t("auth.forgotPassword")}</Link>
            </p>
            <p className="muted">
              {t("auth.noAccount")} <Link to="/register">{t("auth.createAccount")}</Link>
            </p>
          </div>
        </section>
      </MarketingLayout>
    </GuestOnly>
  );
}

export function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { refresh } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(t("validation.passwordsMismatch"));
      return;
    }
    setBusy(true);
    try {
      await authService.register(email, password);
      bumpData();
      refresh();
      navigate("/register/details");
    } catch (err) {
      if (err instanceof ZodError) setError(err.issues[0]?.message ?? t("validation.registrationFailed"));
      else setError(safeErrorMessage(err, t("validation.registrationFailed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <GuestOnly>
      <MarketingLayout>
        <section className="section">
          <div className="container-narrow card" style={{ padding: "1.75rem" }}>
            <p className="badge">{t("auth.registerEyebrow")}</p>
            <h1 className="font-display" style={{ marginTop: "0.75rem" }}>
              {t("auth.registerHeading")}
            </h1>
            <p className="muted">{t("auth.registerStep1Desc")}</p>
            {error && <div className="form-error">{error}</div>}
            <form onSubmit={onSubmit}>
              <div className="field">
                <label htmlFor="reg-email">{t("auth.email")}</label>
                <input
                  id="reg-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="reg-password">{t("auth.password")}</label>
                <input
                  id="reg-password"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="reg-confirm">{t("auth.confirmPassword")}</label>
                <input
                  id="reg-confirm"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={busy}>
                {busy ? t("auth.creatingAccount") : t("auth.continue")}
              </button>
            </form>
            <p className="muted" style={{ marginTop: "1rem" }}>
              {t("auth.alreadyHaveAccount")} <Link to="/login">{t("auth.signInLink")}</Link>
            </p>
          </div>
        </section>
      </MarketingLayout>
    </GuestOnly>
  );
}
