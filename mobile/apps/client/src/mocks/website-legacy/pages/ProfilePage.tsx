import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { bumpData, useApp } from "@/hooks/use-app";
import { useTranslation } from "@/lib/i18n/context";
import { authService } from "@/services/auth-service";
import { safeErrorMessage } from "@/utils/cn";

export function ProfilePage() {
  const { t } = useTranslation();
  const { session, profile, refresh } = useApp();
  const [name, setName] = useState(profile?.answers.name ?? "");
  const [phone, setPhone] = useState(profile?.answers.phone ?? "");
  const [about, setAbout] = useState(String(profile?.answers.about ?? ""));
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!session || !profile) return null;
  const userId = session.userId;
  const email = session.email;

  function saveProfile(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      authService.patchProfile(userId, {
        answers: { name: name.trim(), phone: phone.trim(), about: about.trim() },
      });
      bumpData();
      refresh();
      setMessage("Profile updated.");
    } catch (err) {
      setError(safeErrorMessage(err, "Could not update profile."));
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      await authService.changePassword(userId, currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setMessage("Password updated on this device.");
    } catch (err) {
      setError(safeErrorMessage(err, "Could not change password."));
    }
  }

  return (
    <div className="stack">
      <h1 className="font-display">{t("app.myProfile")}</h1>
      {error && <div className="form-error">{error}</div>}
      {message && <div className="form-success">{message}</div>}

      <section className="card" style={{ padding: "1.25rem" }}>
        <div className="row">
          <div className="peer-avatar" style={{ fontSize: "1.5rem" }}>
            {profile.photoDataUrl ? (
              <img
                src={profile.photoDataUrl}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "1.25rem" }}
              />
            ) : (
              "👤"
            )}
          </div>
          <div>
            <strong>{profile.answers.name || email}</strong>
            <div className="muted">
              {profile.answers.gender} · {profile.answers.city}, {profile.answers.country}
            </div>
            <span className="badge badge-gold">{profile.plan}</span>
          </div>
        </div>
      </section>

      <form className="card" style={{ padding: "1.25rem" }} onSubmit={saveProfile}>
        <h2 className="font-display" style={{ marginTop: 0 }}>
          Edit details
        </h2>
        <div className="field">
          <label htmlFor="name">{t("auth.fullName")}</label>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="phone">{t("auth.phoneNumber")}</label>
          <input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="about">About</label>
          <textarea id="about" rows={3} value={about} onChange={(e) => setAbout(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary">
          Save profile
        </button>
        <Link to="/questionnaire" className="btn btn-secondary" style={{ marginLeft: "0.5rem" }}>
          Edit questionnaire
        </Link>
      </form>

      <form className="card" style={{ padding: "1.25rem" }} onSubmit={changePassword}>
        <h2 className="font-display" style={{ marginTop: 0 }}>
          Change password
        </h2>
        <div className="field">
          <label htmlFor="cur">Current password</label>
          <input
            id="cur"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="newp">{t("auth.newPassword")}</label>
          <input
            id="newp"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn btn-secondary">
          Update password
        </button>
      </form>

      <Link to="/settings" className="btn btn-ghost">
        Local data settings →
      </Link>
    </div>
  );
}
