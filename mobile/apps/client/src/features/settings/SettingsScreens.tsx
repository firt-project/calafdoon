import { FormEvent, useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  ChevronRight,
  CreditCard,
  FileText,
  Fingerprint,
  HelpCircle,
  Info,
  Languages,
  Lock,
  LogOut,
  Mail,
  MessageCircle,
  Palette,
  Shield,
  ShieldAlert,
  Trash2,
  User,
  UserRound,
  ClipboardList,
} from "lucide-react";
import {
  staffRoleLabel,
  useSession,
} from "@/features/auth/SessionProvider";
import { useTranslation } from "@/lib/i18n/context";
import { SUPPORT_EMAIL } from "@/lib/constants";
import { openMailTo } from "@/platform/external-links";
import { clearAllClientData, prefsStore } from "@/platform/secure-storage";
import { useTheme, type ThemeMode } from "@/platform/theme";
import {
  authenticateBiometric,
  getBiometricAvailability,
  isBiometricLockEnabled,
  setBiometricLockEnabled,
} from "@/platform/biometrics";
import { PageTitle, ScreenContainer } from "@/ui/design-system";
import { cn } from "@/utils/cn";

const NOTIF_KEY = "hel_notifications_enabled";

type IconTone =
  | "burgundy"
  | "blue"
  | "green"
  | "orange"
  | "purple"
  | "gray"
  | "danger";

function SettingsIcon({
  icon: Icon,
  tone = "burgundy",
}: {
  icon: typeof User;
  tone?: IconTone;
}) {
  return (
    <span className={cn("ios-settings-icon", `tone-${tone}`)} aria-hidden>
      <Icon size={15} strokeWidth={2.25} />
    </span>
  );
}

function SettingsGroup({
  title,
  children,
  danger,
}: {
  title: string;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <section
      className={cn("ios-settings-group", danger && "is-danger")}
      aria-label={title}
    >
      <h2 className="ios-settings-group-title">{title}</h2>
      <div className="ios-settings-card">{children}</div>
    </section>
  );
}

function SettingsLinkRow({
  to,
  icon,
  tone,
  title,
  subtitle,
  danger,
}: {
  to: string;
  icon: typeof User;
  tone?: IconTone;
  title: string;
  subtitle?: string;
  danger?: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn("ios-settings-row", danger && "is-danger")}
    >
      <SettingsIcon icon={icon} tone={tone} />
      <span className="ios-settings-copy">
        <strong>{title}</strong>
        {subtitle ? <span>{subtitle}</span> : null}
      </span>
      <ChevronRight size={16} className="ios-settings-chevron" aria-hidden />
    </Link>
  );
}

function SettingsButtonRow({
  icon,
  tone,
  title,
  subtitle,
  onClick,
  danger,
  chevron = true,
}: {
  icon: typeof User;
  tone?: IconTone;
  title: string;
  subtitle?: string;
  onClick: () => void;
  danger?: boolean;
  chevron?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn("ios-settings-row", danger && "is-danger")}
      onClick={onClick}
    >
      <SettingsIcon icon={icon} tone={tone} />
      <span className="ios-settings-copy">
        <strong>{title}</strong>
        {subtitle ? <span>{subtitle}</span> : null}
      </span>
      {chevron ? (
        <ChevronRight size={16} className="ios-settings-chevron" aria-hidden />
      ) : null}
    </button>
  );
}

function SettingsControlRow({
  icon,
  tone,
  title,
  subtitle,
  control,
}: {
  icon: typeof User;
  tone?: IconTone;
  title: string;
  subtitle?: string;
  control: ReactNode;
}) {
  return (
    <div className="ios-settings-row is-control">
      <SettingsIcon icon={icon} tone={tone} />
      <span className="ios-settings-copy">
        <strong>{title}</strong>
        {subtitle ? <span>{subtitle}</span> : null}
      </span>
      <div className="ios-settings-control">{control}</div>
    </div>
  );
}

function NativeSwitch({
  checked,
  disabled,
  onChange,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  "aria-label": string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      className={cn("ios-switch", checked && "is-on")}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="ios-switch-knob" />
    </button>
  );
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  "aria-label": ariaLabel,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (next: T) => void;
  "aria-label": string;
}) {
  return (
    <div className="ios-segmented" role="group" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={cn("ios-segment", value === opt.value && "is-active")}
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function BiometricSettingsRow() {
  const { user } = useSession();
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(false);
  const [label, setLabel] = useState(t("mobilePhase5.biometricTitle"));
  const [available, setAvailable] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const info = await getBiometricAvailability();
      setAvailable(info.available);
      setLabel(info.label || t("mobilePhase5.biometricTitle"));
      setReason(info.reason ?? null);
      setEnabled(await isBiometricLockEnabled());
    })();
  }, [t]);

  async function toggle(next: boolean) {
    if (!user) return;
    setBusy(true);
    setMessage(null);
    try {
      if (next) {
        if (!available) {
          setMessage(reason ?? t("settingsPage.biometricsUnavailable"));
          return;
        }
        const auth = await authenticateBiometric(
          t("settingsPage.enableBiometrics", { label })
        );
        if (!auth.ok) {
          setMessage(
            auth.cancelled ? t("settingsPage.cancelled") : auth.message
          );
          return;
        }
        await setBiometricLockEnabled(true);
        setEnabled(true);
      } else {
        await setBiometricLockEnabled(false);
        setEnabled(false);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SettingsControlRow
        icon={Fingerprint}
        tone="purple"
        title={label}
        subtitle={
          available
            ? t("mobilePhase5.biometricExplain")
            : reason ?? t("settingsPage.biometricsUnavailable")
        }
        control={
          <NativeSwitch
            checked={enabled}
            disabled={busy || (!available && !enabled) || !user}
            aria-label={label}
            onChange={(next) => void toggle(next)}
          />
        }
      />
      {message ? (
        <p className="ios-settings-inline-note" role="status">
          {message}
        </p>
      ) : null}
    </>
  );
}

export function SettingsHomePage() {
  const { user, accessState, logout, offline } = useSession();
  const { locale, setLocale, t } = useTranslation();
  const { mode, setMode } = useTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [notificationsOn, setNotificationsOn] = useState(true);
  const roleLabel = staffRoleLabel(user, accessState);
  const isStaff = Boolean(roleLabel);

  useEffect(() => {
    void prefsStore.get(NOTIF_KEY).then((stored) => {
      if (stored === "0" || stored === "false") setNotificationsOn(false);
      else if (stored === "1" || stored === "true") setNotificationsOn(true);
    });
  }, []);

  async function onLogout() {
    await logout();
    queryClient.clear();
    navigate("/welcome", { replace: true });
  }

  async function clearCache() {
    queryClient.clear();
    setMessage(t("settingsPage.cacheCleared"));
  }

  async function toggleNotifications(next: boolean) {
    setNotificationsOn(next);
    await prefsStore.set(NOTIF_KEY, next ? "1" : "0");
  }

  const appearanceLabel =
    mode === "system"
      ? t("settingsPage.themeSystem")
      : mode === "light"
        ? t("settingsPage.themeLight")
        : t("settingsPage.themeDark");

  return (
    <ScreenContainer className="ios-settings" aria-label={t("app.settings")}>
      <PageTitle title={t("app.settings")} />

      {offline && (
        <div className="form-error" role="status">
          {t("settingsPage.offline")}
        </div>
      )}
      {message && (
        <div className="form-success" role="status">
          {message}
        </div>
      )}

      <SettingsGroup title={t("settingsPage.account")}>
        <div className="ios-settings-row is-static">
          <SettingsIcon icon={UserRound} tone="burgundy" />
          <span className="ios-settings-copy">
            <strong>{user?.email ?? t("settingsPage.signedIn")}</strong>
            <span>
              {t("settingsPage.signedIn")}
              {roleLabel ? ` · ${roleLabel}` : ""}
            </span>
          </span>
        </div>

        {isStaff ? (
          <>
            <div className="ios-settings-row is-static">
              <SettingsIcon icon={Shield} tone="blue" />
              <span className="ios-settings-copy">
                <strong>{t("settingsPage.staffTools", { role: roleLabel ?? "" })}</strong>
                <span>{t("settingsPage.staffToolsDesc")}</span>
              </span>
            </div>
            <SettingsLinkRow
              to="/admin"
              icon={Shield}
              tone="blue"
              title={t("settingsPage.adminHome")}
            />
            <SettingsLinkRow
              to="/admin/messages"
              icon={MessageCircle}
              tone="green"
              title={t("settingsPage.supportMessages")}
            />
            <SettingsLinkRow
              to="/admin/announcements"
              icon={Bell}
              tone="orange"
              title={t("settingsPage.announcements")}
            />
            {roleLabel === "Owner" && (
              <SettingsLinkRow
                to="/admin/invites"
                icon={User}
                tone="purple"
                title={t("settingsPage.inviteAdmin")}
              />
            )}
            <SettingsLinkRow
              to="/settings/change-password"
              icon={Lock}
              tone="gray"
              title={t("profilePage.changePassword")}
              subtitle={t("settingsPage.changePasswordDesc")}
            />
          </>
        ) : (
          <>
            <SettingsLinkRow
              to="/profile"
              icon={User}
              tone="burgundy"
              title={t("settingsPage.profilePhotos")}
              subtitle={t("settingsPage.profilePhotosDesc")}
            />
            <SettingsLinkRow
              to="/settings/change-password"
              icon={Lock}
              tone="gray"
              title={t("profilePage.changePassword")}
              subtitle={t("settingsPage.changePasswordDesc")}
            />
            <SettingsLinkRow
              to="/onboarding/questionnaire"
              icon={ClipboardList}
              tone="blue"
              title={t("settingsPage.questionnaire")}
              subtitle={t("settingsPage.questionnaireDesc")}
            />
          </>
        )}
      </SettingsGroup>

      {!isStaff && (
        <SettingsGroup title={t("settingsPage.subscription")}>
          <SettingsLinkRow
            to="/plans"
            icon={CreditCard}
            tone="green"
            title={t("settingsPage.planBilling")}
            subtitle="WaafiPay membership — pay or renew with mobile wallet"
          />
        </SettingsGroup>
      )}

      <SettingsGroup title={t("settingsPage.preferences")}>
        <SettingsControlRow
          icon={Languages}
          tone="blue"
          title={t("settingsPage.language")}
          subtitle={
            locale === "so"
              ? t("common.languageSomali")
              : t("common.languageEnglish")
          }
          control={
            <SegmentedControl
              aria-label={t("settingsPage.language")}
              value={locale}
              onChange={(next) => setLocale(next)}
              options={[
                { value: "en", label: "EN" },
                { value: "so", label: "SO" },
              ]}
            />
          }
        />
        <SettingsControlRow
          icon={Palette}
          tone="purple"
          title={t("settingsPage.appearance")}
          subtitle={appearanceLabel}
          control={
            <SegmentedControl
              aria-label={t("settingsPage.appearance")}
              value={mode}
              onChange={(next) => setMode(next as ThemeMode)}
              options={[
                { value: "system", label: t("settingsPage.themeSystemShort") },
                { value: "light", label: t("settingsPage.themeLightShort") },
                { value: "dark", label: t("settingsPage.themeDarkShort") },
              ]}
            />
          }
        />
        <SettingsControlRow
          icon={Bell}
          tone="orange"
          title={t("settingsPage.notifications")}
          subtitle={
            notificationsOn
              ? t("settingsPage.notificationsOn")
              : t("settingsPage.notificationsOff")
          }
          control={
            <NativeSwitch
              checked={notificationsOn}
              aria-label={t("settingsPage.notifications")}
              onChange={(next) => void toggleNotifications(next)}
            />
          }
        />
      </SettingsGroup>

      <SettingsGroup title={t("settingsPage.privacy")}>
        <SettingsLinkRow
          to="/legal/privacy"
          icon={Shield}
          tone="blue"
          title={t("nav.privacy")}
        />
        <SettingsLinkRow
          to="/legal/safety"
          icon={ShieldAlert}
          tone="orange"
          title={t("settingsPage.safety")}
        />
        <SettingsLinkRow
          to="/legal/guidelines"
          icon={FileText}
          tone="gray"
          title={t("settingsPage.guidelines")}
        />
        <SettingsButtonRow
          icon={Trash2}
          tone="gray"
          title={t("settingsPage.clearCache")}
          subtitle={t("settingsPage.clearCacheDesc")}
          chevron={false}
          onClick={() => void clearCache()}
        />
      </SettingsGroup>

      <SettingsGroup title={t("settingsPage.security")}>
        <BiometricSettingsRow />
      </SettingsGroup>

      <SettingsGroup title={t("settingsPage.support")}>
        {!isStaff && (
          <SettingsLinkRow
            to="/settings/support"
            icon={MessageCircle}
            tone="green"
            title={t("settingsPage.messageSupport")}
            subtitle={t("settingsPage.messageSupportDesc")}
          />
        )}
        <SettingsLinkRow
          to="/legal/help"
          icon={HelpCircle}
          tone="blue"
          title={t("settingsPage.help")}
        />
        <SettingsLinkRow
          to="/legal/about"
          icon={Info}
          tone="gray"
          title={t("settingsPage.about")}
        />
        <SettingsButtonRow
          icon={Mail}
          tone="burgundy"
          title={t("settingsPage.emailSupport")}
          subtitle={SUPPORT_EMAIL}
          onClick={() =>
            void openMailTo(SUPPORT_EMAIL, "HelCalaf support")
          }
        />
      </SettingsGroup>

      <SettingsGroup title={t("settingsPage.legal")}>
        <SettingsLinkRow
          to="/legal/terms"
          icon={FileText}
          tone="gray"
          title={t("nav.terms")}
        />
      </SettingsGroup>

      <SettingsGroup title={t("settingsPage.session")}>
        <SettingsButtonRow
          icon={LogOut}
          tone="gray"
          title={t("app.logOut")}
          subtitle={t("settingsPage.logOutDesc")}
          chevron={false}
          onClick={() => void onLogout()}
        />
      </SettingsGroup>

      {!isStaff && (
        <SettingsGroup title={t("settingsPage.dangerZone")} danger>
          <SettingsLinkRow
            to="/settings/delete-account"
            icon={Trash2}
            tone="danger"
            title={t("settingsPage.deleteAccount")}
            subtitle={t("settingsPage.deleteAccountDesc")}
            danger
          />
        </SettingsGroup>
      )}
    </ScreenContainer>
  );
}

export function ChangePasswordPage() {
  const { logout } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirm) {
      setError("New password and confirmation do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { auth } = await import("@hel/api-client");
      await auth.changePassword(currentPassword, newPassword);
      queryClient.clear();
      await clearAllClientData();
      try {
        await logout();
      } catch {
        /* session already revoked server-side */
      }
      navigate("/login", { replace: true });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("profilePage.passwordChangeFailed")
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <Link to="/settings" className="back-btn" aria-label={t("common.back")}>
          ←
        </Link>
        <h1>{t("profilePage.changePassword")}</h1>
        <span />
      </header>
      <p className="muted">
        After you change your password you will need to sign in again on this device.
      </p>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      <form className="form" onSubmit={(e) => void onSubmit(e)}>
        <label>
          {t("profilePage.currentPassword")}
          <input
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </label>
        <label>
          {t("profilePage.newPassword")}
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </label>
        <label>
          {t("profilePage.confirmNewPassword")}
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
          {busy ? t("profilePage.updatingPassword") : t("profilePage.updatePassword")}
        </button>
      </form>
    </div>
  );
}

export function DeleteAccountPage() {
  const { deleteAccount } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (confirmText.trim().toUpperCase() !== "DELETE") {
      setError(t("settingsPage.deleteConfirmError"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(password);
      queryClient.clear();
      await clearAllClientData();
      navigate("/welcome", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("settingsPage.deleteFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <Link to="/settings" className="back-btn" aria-label={t("common.back")}>
          ←
        </Link>
        <h1>{t("settingsPage.deleteAccount")}</h1>
        <span />
      </header>
      <p>{t("settingsPage.deleteAccountBody")}</p>
      <p className="muted">{t("settingsPage.deleteAccountNote")}</p>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      <form className="form" onSubmit={(e) => void onSubmit(e)}>
        <label>
          {t("auth.password")}
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>
          {t("settingsPage.typeDelete")}
          <input
            type="text"
            autoCapitalize="characters"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            required
          />
        </label>
        <button type="submit" className="btn btn-danger btn-block" disabled={busy}>
          {busy ? t("settingsPage.deleting") : t("settingsPage.deleteMyAccount")}
        </button>
      </form>
    </div>
  );
}
