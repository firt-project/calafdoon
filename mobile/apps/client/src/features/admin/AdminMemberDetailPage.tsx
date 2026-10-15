import "./admin.css";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Ban,
  Camera,
  Check,
  Mail,
  MapPin,
  MoreHorizontal,
  Phone,
  UserRound,
  X,
} from "lucide-react";
import { admin, apiClient } from "@hel/api-client";
import { useTranslation } from "@/lib/i18n/context";
import { BottomSheet, SkeletonCard } from "@/ui/mobile-kit";
import { userFacingError } from "@/platform/errors";
import { hapticError, hapticSuccess } from "@/platform/haptics";

type ProfileDetail = Record<string, unknown> & {
  _id?: string;
  id?: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  gender?: string | null;
  role?: string;
  banned?: boolean;
  approved?: boolean;
  reviewStatus?: string | null;
  hasPaid?: boolean;
  hasPersonalSupport?: boolean;
  paidCents?: number;
  imageUrl?: string | null;
  city?: string | null;
  country?: string | null;
  age?: number | null;
  height?: number | null;
  weight?: number | null;
  education?: string | null;
  occupation?: string | null;
  maritalStatus?: string | null;
  religiousLevel?: string | null;
  prayerFrequency?: string | null;
  spousePrayerImportance?: string | null;
  wearsHijab?: boolean | null;
  hasBeard?: boolean | null;
  madhhab?: string | null;
  financialReadiness?: string | null;
  marriageWorkPreference?: string | null;
  wantChildren?: string | null;
  children?: number | null;
  familyInvolvement?: string | null;
  polygynyOpenness?: string | null;
  hasCurrentWife?: string | null;
  openToSecondWife?: string | null;
  acceptPreviouslyMarriedMan?: string | null;
  acceptFutureCoWife?: string | null;
  acceptManWithWife?: string | null;
  marriageTimeline?: string | null;
  marrySomeoneWithChildren?: string | null;
  smokes?: string | null;
  substanceDetails?: string | null;
  drinksAlcohol?: string | null;
  exercise?: string | null;
  livingSituation?: string | null;
  citizenshipStatus?: string | null;
  readyToRelocate?: string | null;
  loveLanguage?: string | null;
  languagesSpoken?: string[] | null;
  qualities?: string[] | null;
  hobbies?: string[] | null;
  bio?: string | null;
  about?: string | null;
  questionnaireComplete?: boolean;
  advisorReviewed?: boolean;
  verified?: boolean;
  waliName?: string | null;
  waliPhone?: string | null;
};

type Prefs = Record<string, unknown> | null;

type Activity = {
  messageCount?: number;
  likesGivenCount?: number;
  likesReceivedCount?: number;
  messages?: Array<{ body?: string; createdAt?: string; messageCreatedAt?: string }>;
};

function str(v: unknown): string {
  if (v == null || v === "") return "";
  if (Array.isArray(v)) return v.filter(Boolean).join(", ");
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

function money(cents?: number): string {
  if (cents == null) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

function Field({
  label,
  value,
  emptyLabel,
}: {
  label: string;
  value?: unknown;
  emptyLabel: string;
}) {
  const text = str(value);
  return (
    <div className={`admin-detail-field${text ? "" : " is-empty"}`}>
      <dt>{label}</dt>
      <dd>{text || emptyLabel}</dd>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="admin-detail-section">
      <h2>{title}</h2>
      <dl className="admin-detail-grid">{children}</dl>
    </section>
  );
}

export function AdminMemberDetailPage() {
  const { profileId = "" } = useParams();
  const { t } = useTranslation();
  const empty = t("adminDetail.notProvided");
  const [profile, setProfile] = useState<ProfileDetail | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const [sheet, setSheet] = useState<
    null | "menu" | "reject" | "changes" | "pause" | "suspend" | "delete"
  >(null);
  const [reasonText, setReasonText] = useState("");
  const [messageText, setMessageText] = useState("");
  const [confirmName, setConfirmName] = useState("");

  const reload = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);
    setError(null);
    try {
      const [detailRes, activityRes] = await Promise.all([
        admin.users.detail(profileId) as Promise<{
          profile?: ProfileDetail;
          preferences?: Prefs;
        }>,
        admin.users.activity(profileId).catch(() => null) as Promise<Activity | null>,
      ]);
      setProfile(detailRes?.profile ?? null);
      setPrefs(detailRes?.preferences ?? null);
      setActivity(activityRes);
    } catch (e) {
      setError(userFacingError(e));
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await hapticSuccess();
      await reload();
    } catch (e) {
      await hapticError();
      setError(userFacingError(e));
    } finally {
      setBusy(false);
    }
  }

  function closeSheet() {
    setSheet(null);
    setReasonText("");
    setMessageText("");
    setConfirmName("");
  }

  const enc = encodeURIComponent(profileId);
  const status = profile?.reviewStatus ?? "";
  const isPaused = status === "paused";
  const isSuspended = status === "suspended";

  const isStaffMember =
    profile?.role === "admin" || profile?.role === "owner";
  const canApprove =
    !!profile &&
    !isStaffMember &&
    !profile.banned &&
    profile.reviewStatus !== "approved" &&
    profile.approved !== true;
  const profileComplete = profile?.questionnaireComplete === true;

  return (
    <div className="screen pad-tab">
      <header className="screen-header">
        <Link to="/admin/members" className="back-btn" aria-label="Back">
          ←
        </Link>
        <h1>{t("adminDetail.title")}</h1>
      </header>

      {loading && <SkeletonCard />}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}

      {!loading && !profile && !error && (
        <p className="muted center">{t("adminDetail.notFound")}</p>
      )}

      {profile && (
        <>
          <div className="admin-detail-hero">
            <div className="admin-detail-avatar">
              {profile.imageUrl ? (
                <img src={profile.imageUrl} alt="" />
              ) : (
                <UserRound size={32} aria-hidden />
              )}
            </div>
            <div className="admin-detail-hero-meta">
              <h2>{profile.name ?? "Member"}</h2>
              <p>
                <span
                  className={`admin-pill ${
                    profile.banned
                      ? "danger"
                      : profile.reviewStatus === "approved"
                        ? "ok"
                        : "warn"
                  }`}
                >
                  {profile.banned
                    ? "Banned"
                    : (profile.reviewStatus ?? "unknown")}
                </span>
                <span className={`admin-pill ${profileComplete ? "ok" : "warn"}`}>
                  {profileComplete
                    ? t("adminDetail.profileComplete")
                    : t("adminDetail.profileIncomplete")}
                </span>
                {profile.role && profile.role !== "user" ? (
                  <span className="admin-pill">{profile.role}</span>
                ) : null}
                {profile.hasPaid ? (
                  <span className="admin-pill ok">Paid</span>
                ) : (
                  <span className="admin-pill">Unpaid</span>
                )}
                {profile.verified ? (
                  <span className="admin-pill ok">Verified</span>
                ) : null}
              </p>
              <p className="muted small">
                {profile.email ?? "—"}
                {profile.gender ? ` · ${profile.gender}` : ""}
              </p>
            </div>
          </div>

          {!isStaffMember && (
            <div className="admin-actions" style={{ marginBottom: "1rem" }}>
              {canApprove && (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() =>
                    void run(() => admin.users.approve(profileId))
                  }
                >
                  <Check size={15} /> Approve
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => setSheet("reject")}
              >
                <X size={15} /> Reject
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() =>
                  void run(() => admin.users.requestPhoto(profileId))
                }
              >
                <Camera size={15} /> Request photo
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => setSheet("menu")}
              >
                <MoreHorizontal size={15} /> More
              </button>
              {!profile.banned ? (
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={busy}
                  onClick={() => void run(() => admin.users.ban(profileId))}
                >
                  <Ban size={15} /> Ban
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() => void run(() => admin.users.unban(profileId))}
                >
                  Unban
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    admin.users.advisorReviewed(
                      profileId,
                      !profile.advisorReviewed
                    )
                  )
                }
              >
                {profile.advisorReviewed
                  ? "Clear advisor review"
                  : t("adminDetail.markAdvisorReviewed")}
              </button>
            </div>
          )}

          <Section title="Contact">
            <Field label="Email" value={profile.email} emptyLabel={empty} />
            <Field label="Phone" value={profile.phone} emptyLabel={empty} />
            <Field
              label="Location"
              value={[profile.city, profile.country].filter(Boolean).join(", ")}
              emptyLabel={empty}
            />
            <Field
              label="Paid"
              value={money(profile.paidCents)}
              emptyLabel={empty}
            />
            <Field
              label="Support"
              value={
                profile.hasPersonalSupport ? "Personal support" : "Standard"
              }
              emptyLabel={empty}
            />
            <Field
              label="Guardian / Calaf"
              value={
                [profile.waliName, profile.waliPhone].filter(Boolean).join(" · ")
              }
              emptyLabel={empty}
            />
          </Section>

          <Section title={t("adminDetail.basicInfo")}>
            <Field label="Age" value={profile.age} emptyLabel={empty} />
            <Field
              label="Height"
              value={profile.height != null ? `${profile.height} cm` : ""}
              emptyLabel={empty}
            />
            <Field
              label="Weight"
              value={profile.weight != null ? `${profile.weight} kg` : ""}
              emptyLabel={empty}
            />
            <Field
              label={t("adminDetail.languages")}
              value={profile.languagesSpoken}
              emptyLabel={empty}
            />
            <Field
              label={t("adminDetail.citizenship")}
              value={profile.citizenshipStatus}
              emptyLabel={empty}
            />
          </Section>

          <Section title={t("adminDetail.religiousPractice")}>
            <Field
              label={t("adminDetail.religiousLevel")}
              value={profile.religiousLevel}
              emptyLabel={empty}
            />
            <Field
              label="Prayer frequency"
              value={profile.prayerFrequency}
              emptyLabel={empty}
            />
            <Field
              label={t("adminDetail.spousePrayerImportance")}
              value={profile.spousePrayerImportance}
              emptyLabel={empty}
            />
            <Field label="Madhhab" value={profile.madhhab} emptyLabel={empty} />
            {profile.gender === "female" ? (
              <Field
                label="Wears hijab"
                value={profile.wearsHijab}
                emptyLabel={empty}
              />
            ) : (
              <Field
                label="Has beard"
                value={profile.hasBeard}
                emptyLabel={empty}
              />
            )}
          </Section>

          <Section title={t("adminDetail.educationWork")}>
            <Field
              label="Education"
              value={profile.education}
              emptyLabel={empty}
            />
            <Field
              label="Occupation"
              value={profile.occupation}
              emptyLabel={empty}
            />
            <Field
              label={t("adminDetail.financialReadiness")}
              value={profile.financialReadiness}
              emptyLabel={empty}
            />
            <Field
              label={t("adminDetail.marriageWorkPreference")}
              value={profile.marriageWorkPreference}
              emptyLabel={empty}
            />
          </Section>

          <Section title={t("adminDetail.marriageFamily")}>
            <Field
              label="Marital status"
              value={profile.maritalStatus}
              emptyLabel={empty}
            />
            <Field
              label={t("adminDetail.wantChildren")}
              value={profile.wantChildren}
              emptyLabel={empty}
            />
            <Field
              label={t("adminDetail.children")}
              value={profile.children}
              emptyLabel={empty}
            />
            <Field
              label={t("adminDetail.marryWithChildren")}
              value={profile.marrySomeoneWithChildren}
              emptyLabel={empty}
            />
            <Field
              label={t("adminDetail.marriageTimeline")}
              value={profile.marriageTimeline}
              emptyLabel={empty}
            />
            <Field
              label={t("adminDetail.familyInvolvement")}
              value={profile.familyInvolvement}
              emptyLabel={empty}
            />
            <Field
              label={t("adminDetail.polygynyOpenness")}
              value={profile.polygynyOpenness}
              emptyLabel={empty}
            />
            {profile.gender === "male" ? (
              <>
                <Field
                  label={t("adminDetail.hasCurrentWife")}
                  value={profile.hasCurrentWife}
                  emptyLabel={empty}
                />
                <Field
                  label={t("adminDetail.openToSecondWife")}
                  value={profile.openToSecondWife}
                  emptyLabel={empty}
                />
              </>
            ) : (
              <>
                <Field
                  label={t("adminDetail.acceptPreviouslyMarriedMan")}
                  value={profile.acceptPreviouslyMarriedMan}
                  emptyLabel={empty}
                />
                <Field
                  label={t("adminDetail.acceptFutureCoWife")}
                  value={profile.acceptFutureCoWife}
                  emptyLabel={empty}
                />
                <Field
                  label={t("adminDetail.acceptManWithWife")}
                  value={profile.acceptManWithWife}
                  emptyLabel={empty}
                />
              </>
            )}
          </Section>

          <Section title={t("adminDetail.lifestyle")}>
            <Field
              label={t("adminDetail.substanceUse")}
              value={
                profile.smokes === "Yes" && profile.substanceDetails
                  ? `${profile.smokes} — ${profile.substanceDetails}`
                  : profile.smokes
              }
              emptyLabel={empty}
            />
            <Field
              label="Alcohol"
              value={profile.drinksAlcohol}
              emptyLabel={empty}
            />
            <Field label="Exercise" value={profile.exercise} emptyLabel={empty} />
            <Field
              label={t("adminDetail.livingSituation")}
              value={profile.livingSituation}
              emptyLabel={empty}
            />
            <Field
              label="Ready to relocate"
              value={profile.readyToRelocate}
              emptyLabel={empty}
            />
            <Field
              label="Love language"
              value={profile.loveLanguage}
              emptyLabel={empty}
            />
          </Section>

          <Section title={t("adminDetail.about")}>
            <Field
              label="Bio"
              value={profile.bio || profile.about}
              emptyLabel={empty}
            />
            <Field
              label="Qualities"
              value={profile.qualities}
              emptyLabel={empty}
            />
            <Field label="Hobbies" value={profile.hobbies} emptyLabel={empty} />
          </Section>

          <Section title={t("adminDetail.partnerPreferences")}>
            <Field
              label={t("adminDetail.preferredAge")}
              value={prefs?.minAge != null ? String(prefs.minAge) : ""}
              emptyLabel={empty}
            />
            <Field
              label={t("adminDetail.preferredHeight")}
              value={
                prefs?.minHeight != null ? `${prefs.minHeight} cm` : ""
              }
              emptyLabel={empty}
            />
            <Field
              label={t("adminDetail.preferredWeight")}
              value={
                prefs?.minWeight != null ? `${prefs.minWeight} kg` : ""
              }
              emptyLabel={empty}
            />
            <Field
              label={t("adminDetail.preferredCountries")}
              value={prefs?.preferredCountries}
              emptyLabel={empty}
            />
            <Field
              label={t("adminDetail.preferredEducation")}
              value={prefs?.educationLevel}
              emptyLabel={empty}
            />
            <Field
              label={t("adminDetail.religiousLevel")}
              value={prefs?.religiousLevel}
              emptyLabel={empty}
            />
            <Field
              label={t("adminDetail.acceptChildren")}
              value={prefs?.acceptChildren}
              emptyLabel={empty}
            />
            <Field
              label={t("adminDetail.acceptDivorcee")}
              value={prefs?.acceptDivorcee}
              emptyLabel={empty}
            />
            <Field
              label={t("adminDetail.acceptWidow")}
              value={prefs?.acceptWidow}
              emptyLabel={empty}
            />
            <Field
              label={t("adminDetail.partnerHijabLevel")}
              value={prefs?.partnerHijabLevel}
              emptyLabel={empty}
            />
            <Field
              label={t("adminDetail.partnerBeard")}
              value={prefs?.partnerBeard}
              emptyLabel={empty}
            />
            <Field
              label="Ready to relocate"
              value={prefs?.readyToRelocate}
              emptyLabel={empty}
            />
            <Field
              label="Desired qualities"
              value={prefs?.qualities}
              emptyLabel={empty}
            />
            <Field
              label="Shared hobbies"
              value={prefs?.hobbies}
              emptyLabel={empty}
            />
          </Section>

          {activity && (
            <Section title={t("adminDetail.activityTitle")}>
              <Field
                label={t("adminDetail.messagesLabel")}
                value={activity.messageCount}
                emptyLabel="0"
              />
              <Field
                label={t("adminDetail.likesGivenLabel")}
                value={activity.likesGivenCount}
                emptyLabel="0"
              />
              <Field
                label={t("adminDetail.likesReceivedLabel")}
                value={activity.likesReceivedCount}
                emptyLabel="0"
              />
            </Section>
          )}

          {activity?.messages && activity.messages.length > 0 && (
            <section className="admin-detail-section">
              <h2>{t("adminDetail.recentMessages")}</h2>
              <ul className="admin-activity-list">
                {activity.messages.slice(0, 8).map((m, i) => {
                  const when = m.messageCreatedAt ?? m.createdAt;
                  return (
                    <li key={i}>
                      <span>{m.body || t("adminDetail.imageMessage")}</span>
                      {when ? (
                        <small className="muted">
                          {new Date(when).toLocaleString()}
                        </small>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <p className="muted small center" style={{ marginTop: "0.5rem" }}>
            <Mail size={12} style={{ verticalAlign: "middle" }} />{" "}
            {profile.email ?? "—"}
            {" · "}
            <Phone size={12} style={{ verticalAlign: "middle" }} />{" "}
            {profile.phone ?? "—"}
            {" · "}
            <MapPin size={12} style={{ verticalAlign: "middle" }} />{" "}
            {[profile.city, profile.country].filter(Boolean).join(", ") || "—"}
          </p>
        </>
      )}
      <BottomSheet open={sheet === "menu"} title="More actions" onClose={closeSheet}>
        <div className="stack">
          <button type="button" className="btn btn-secondary btn-block" onClick={() => setSheet("changes")}>
            Request changes
          </button>
          {isPaused ? (
            <button
              type="button"
              className="btn btn-secondary btn-block"
              disabled={busy}
              onClick={() => {
                closeSheet();
                void run(() => apiClient.post(`/admin/users/${enc}/resume`, {}));
              }}
            >
              Resume account
            </button>
          ) : (
            <button type="button" className="btn btn-secondary btn-block" onClick={() => setSheet("pause")}>
              Pause account
            </button>
          )}
          {isSuspended ? (
            <button
              type="button"
              className="btn btn-secondary btn-block"
              disabled={busy}
              onClick={() => {
                closeSheet();
                void run(() => apiClient.post(`/admin/users/${enc}/unsuspend`, {}));
              }}
            >
              Lift suspension
            </button>
          ) : (
            <button type="button" className="btn btn-secondary btn-block" onClick={() => setSheet("suspend")}>
              Suspend account
            </button>
          )}
          <button type="button" className="btn btn-danger btn-block" onClick={() => setSheet("delete")}>
            Delete member…
          </button>
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === "reject"} title="Reject this profile?" onClose={closeSheet}>
        <div className="stack">
          <p className="muted small" style={{ margin: 0 }}>The member sees this reason.</p>
          <textarea rows={3} value={reasonText} onChange={(e) => setReasonText(e.target.value)} placeholder="e.g. Photo does not show your face" />
          <button
            type="button"
            className="btn btn-danger btn-block"
            disabled={busy || reasonText.trim().length < 3}
            onClick={() => {
              const reason = reasonText.trim();
              closeSheet();
              void run(() => admin.users.reject(profileId, reason));
            }}
          >
            Reject
          </button>
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === "changes"} title="Request changes" onClose={closeSheet}>
        <div className="stack">
          <p className="muted small" style={{ margin: 0 }}>
            Ask the member to fix something and resubmit, without rejecting them.
          </p>
          <textarea rows={3} value={reasonText} onChange={(e) => setReasonText(e.target.value)} placeholder="What must change? e.g. Add a clear photo of your face" />
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={busy || reasonText.trim().length < 3}
            onClick={() => {
              const text = reasonText.trim();
              closeSheet();
              void run(() =>
                apiClient.post(`/admin/users/${enc}/request-changes`, {
                  whatMustChange: text,
                  publicInstructions: text,
                })
              );
            }}
          >
            Send request
          </button>
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === "pause"} title="Pause account" onClose={closeSheet}>
        <div className="stack">
          <p className="muted small" style={{ margin: 0 }}>
            The member cannot use the app until you resume the account.
          </p>
          <textarea rows={2} value={reasonText} onChange={(e) => setReasonText(e.target.value)} placeholder="Internal reason (optional)" />
          <textarea rows={2} value={messageText} onChange={(e) => setMessageText(e.target.value)} placeholder="Message shown to the member (optional)" />
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={busy}
            onClick={() => {
              const body = {
                reason: reasonText.trim() || undefined,
                publicUserMessage: messageText.trim() || undefined,
              };
              closeSheet();
              void run(() => apiClient.post(`/admin/users/${enc}/pause`, body));
            }}
          >
            Pause account
          </button>
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === "suspend"} title="Suspend account" onClose={closeSheet}>
        <div className="stack">
          <p className="muted small" style={{ margin: 0 }}>
            Use for rule violations. The member is locked out until you lift it.
          </p>
          <textarea rows={2} value={reasonText} onChange={(e) => setReasonText(e.target.value)} placeholder="Internal reason" />
          <textarea rows={2} value={messageText} onChange={(e) => setMessageText(e.target.value)} placeholder="Message shown to the member (optional)" />
          <button
            type="button"
            className="btn btn-danger btn-block"
            disabled={busy || reasonText.trim().length < 3}
            onClick={() => {
              const body = {
                reason: reasonText.trim(),
                publicUserMessage: messageText.trim() || undefined,
              };
              closeSheet();
              void run(() => apiClient.post(`/admin/users/${enc}/suspend`, body));
            }}
          >
            Suspend
          </button>
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === "delete"} title="Delete this member?" onClose={closeSheet}>
        <div className="stack">
          <p className="muted small" style={{ margin: 0 }}>
            This permanently removes {profile?.name ?? "the member"} and cannot be undone. Type their name to confirm.
          </p>
          <input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={String(profile?.name ?? "Name")} />
          <button
            type="button"
            className="btn btn-danger btn-block"
            disabled={
              busy ||
              confirmName.trim().toLowerCase() !==
                String(profile?.name ?? "").trim().toLowerCase() ||
              !profile?.name
            }
            onClick={() => {
              closeSheet();
              setBusy(true);
              admin.users
                .delete(profileId)
                .then(() => {
                  void hapticSuccess();
                  navigate("/admin/members", { replace: true });
                })
                .catch((e) => {
                  void hapticError();
                  setError(userFacingError(e));
                })
                .finally(() => setBusy(false));
            }}
          >
            Delete permanently
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
