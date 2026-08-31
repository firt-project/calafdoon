import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { RequireAuth } from "@/components/auth/gates";
import { bumpData, useApp } from "@/hooks/use-app";
import { useTranslation } from "@/lib/i18n/context";
import { authService } from "@/services/auth-service";
import { safeErrorMessage } from "@/utils/cn";
import { cn } from "@/utils/cn";

export function RegisterDetailsPage() {
  const { t } = useTranslation();
  const { session, profile, refresh } = useApp();
  const navigate = useNavigate();
  const [gender, setGender] = useState<"male" | "female" | null>(
    profile?.answers.gender ?? null
  );
  const [error, setError] = useState<string | null>(null);

  if (!session) return <Navigate to="/login" replace />;

  function save() {
    if (!session || !gender) {
      setError(t("validation.genderRequired"));
      return;
    }
    try {
      authService.setGender(session.userId, gender);
      bumpData();
      refresh();
      navigate("/questionnaire");
    } catch (err) {
      setError(safeErrorMessage(err, t("validation.saveDetailsFailed")));
    }
  }

  return (
    <RequireAuth>
      <MarketingLayout>
        <section className="section">
          <div className="container-narrow card" style={{ padding: "1.75rem" }}>
            <h1 className="font-display">{t("auth.registerStep2Title")}</h1>
            <p className="muted">{t("auth.registerStep2Desc")}</p>
            {error && <div className="form-error">{error}</div>}
            <div className="grid-2" style={{ margin: "1.25rem 0" }}>
              <button
                type="button"
                className={cn("option-pill", gender === "male" && "selected")}
                onClick={() => setGender("male")}
              >
                {t("auth.male")}
              </button>
              <button
                type="button"
                className={cn("option-pill", gender === "female" && "selected")}
                onClick={() => setGender("female")}
              >
                {t("auth.female")}
              </button>
            </div>
            <button type="button" className="btn btn-primary btn-block btn-lg" onClick={save}>
              {t("auth.continueToQuestionnaire")}
            </button>
          </div>
        </section>
      </MarketingLayout>
    </RequireAuth>
  );
}

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (password !== confirm) {
      setError(t("validation.passwordsMismatch"));
      return;
    }
    setBusy(true);
    try {
      await authService.resetPassword(email, password);
      setSuccess("Password updated on this device. You can sign in now.");
      setTimeout(() => navigate("/login"), 900);
    } catch (err) {
      setError(safeErrorMessage(err, "Could not reset password."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <MarketingLayout>
      <section className="section">
        <div className="container-narrow card" style={{ padding: "1.75rem" }}>
          <h1 className="font-display">{t("auth.resetTitle")}</h1>
          <p className="muted">
            This app stores accounts only on your device. Enter your email and choose a new
            password — no email code is required offline.
          </p>
          {error && <div className="form-error">{error}</div>}
          {success && <div className="form-success">{success}</div>}
          <form onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="fp-email">{t("auth.email")}</label>
              <input
                id="fp-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="fp-pass">{t("auth.newPassword")}</label>
              <input
                id="fp-pass"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="fp-confirm">{t("auth.confirmPassword")}</label>
              <input
                id="fp-confirm"
                type="password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
              {busy ? t("auth.resetting") : t("auth.setNewPassword")}
            </button>
          </form>
          <p className="muted" style={{ marginTop: "1rem" }}>
            <Link to="/login">{t("auth.signInLink")}</Link>
          </p>
        </div>
      </section>
    </MarketingLayout>
  );
}
