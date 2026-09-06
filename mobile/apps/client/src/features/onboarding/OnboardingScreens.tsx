import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  profile as profileApi,
  preferences as preferencesApi,
  photos as photosApi,
  questionnaire,
  ApiClientError,
} from "@hel/api-client";
import { useSession, securityHomeRoute } from "@/features/auth/SessionProvider";
import { SafeImage } from "@/ui/SafeImage";
import { userFacingError } from "@/platform/errors";
import { markPhotoAdded } from "@/features/profile/photo-gate";
import {
  STEPS,
  type FieldConfig,
  type StepConfig,
} from "@/data/questionnaire-steps";
import { getCitiesForCountry } from "@/lib/constants";
import { ALL_COUNTRIES } from "@/lib/countries";
import { cn } from "@/utils/cn";
import { PhoneNumberField } from "@/features/onboarding/PhoneNumberField";
import { CountrySearchField } from "@/features/onboarding/CountrySearchField";

type QuestionScreen = {
  apiStepId: number;
  section: string;
  field: FieldConfig;
};

function fieldVisible(
  field: FieldConfig,
  answers: Record<string, unknown>
): boolean {
  if (field.uiOnly) return false;
  if (field.condition && answers[field.condition.field] !== field.condition.value) {
    return false;
  }
  if (
    field.showWhen &&
    !field.showWhen.values.includes(String(answers[field.showWhen.field] ?? ""))
  ) {
    return false;
  }
  if (
    field.hideWhen &&
    field.hideWhen.values.includes(String(answers[field.hideWhen.field] ?? ""))
  ) {
    return false;
  }
  return true;
}

/** One visible field per screen (Muzz-style). */
function buildQuestionScreens(
  steps: StepConfig[],
  answers: Record<string, unknown>,
  skipGenderStep: boolean
): QuestionScreen[] {
  const screens: QuestionScreen[] = [];
  for (const step of steps) {
    if (step.phase === "photo") continue;
    if (skipGenderStep && step.id === 0) continue;
    for (const field of step.fields) {
      if (!fieldVisible(field, answers)) continue;
      screens.push({
        apiStepId: step.id,
        section: step.title,
        field,
      });
    }
  }
  return screens;
}

function isAnswered(field: FieldConfig, answers: Record<string, unknown>): boolean {
  const val = answers[field.name];
  if (val == null || val === "") return false;
  if (Array.isArray(val) && val.length === 0) return false;
  // Signup placeholders use 0 / empty — never treat those as answered.
  if (
    field.name === "age" ||
    field.name === "height" ||
    field.name === "weight" ||
    field.name === "children"
  ) {
    const n = typeof val === "number" ? val : Number(String(val).match(/^(\d+)/)?.[1]);
    if (!Number.isFinite(n) || n <= 0) return false;
  }
  return true;
}

/** Client-side phone check — expects E.164-ish +dial+national from PhoneNumberField. */
function looksLikePhone(phone: unknown): boolean {
  if (typeof phone !== "string") return false;
  const trimmed = phone.trim();
  if (!trimmed.startsWith("+")) return false;
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

function looksLikeName(name: unknown): boolean {
  if (typeof name !== "string") return false;
  const trimmed = name.trim();
  return trimmed.length >= 2 && trimmed !== "User";
}

function yn(value: unknown): string | undefined {
  if (value === true || value === "Yes" || value === "yes") return "Yes";
  if (value === false || value === "No" || value === "no") return "No";
  if (typeof value === "string" && value.trim()) return value;
  return undefined;
}

/** Flatten profile + preferences into the form answer shape (pref_* keys). */
function answersFromServer(
  profile: Record<string, unknown> | null,
  prefs: Record<string, unknown> | null
): Record<string, unknown> {
  if (!profile) return {};
  const answers: Record<string, unknown> = { ...profile };

  // Match website initFormState: ignore signup placeholders so basic questions show.
  const age = Number(profile.age ?? 0);
  if (!(age > 0)) delete answers.age;
  else answers.age = String(age);

  const height = Number(profile.height ?? 0);
  const weight = Number(profile.weight ?? 0);
  const questionnaireDone = profile.questionnaireComplete === true;
  // Fresh profiles are created with height=170 / weight=70 placeholders — don't skip those screens.
  if (!questionnaireDone && !(age > 0)) {
    delete answers.height;
    delete answers.weight;
  } else {
    if (height > 0) answers.height = height >= 200 ? "200+" : String(height);
    else delete answers.height;
    if (weight > 0) answers.weight = weight >= 100 ? "100+" : String(weight);
    else delete answers.weight;
  }

  if (!String(profile.country ?? "").trim()) delete answers.country;
  if (!String(profile.city ?? "").trim()) delete answers.city;

  const langs = profile.languagesSpoken;
  if (!Array.isArray(langs) || langs.length === 0) delete answers.languagesSpoken;

  const hijab = yn(profile.wearsHijab);
  if (hijab) answers.wearsHijab = hijab;
  const beard = yn(profile.hasBeard);
  if (beard) answers.hasBeard = beard;

  // UI asks substanceUse; API stores smokes.
  const smoke =
    yn(profile.smokes) ??
    (typeof profile.smokes === "string" ? profile.smokes : undefined);
  if (smoke === "Yes" || smoke === "No") answers.substanceUse = smoke;
  else if (typeof profile.smokes === "string" && profile.smokes.trim()) {
    answers.substanceUse = "Yes";
  }

  if (prefs && typeof prefs === "object") {
    for (const [key, value] of Object.entries(prefs)) {
      if (value == null || value === "") continue;
      if (
        key === "minAge" ||
        key === "maxAge" ||
        key === "minHeight" ||
        key === "maxHeight" ||
        key === "minWeight" ||
        key === "maxWeight"
      ) {
        const n = Number(value);
        if (!Number.isFinite(n) || n <= 0) continue;
        if ((key === "minHeight" || key === "maxHeight") && n >= 200) {
          answers[`pref_${key}`] = "200+";
        } else if ((key === "minWeight" || key === "maxWeight") && n >= 100) {
          answers[`pref_${key}`] = "100+";
        } else {
          answers[`pref_${key}`] = String(n);
        }
        continue;
      }
      answers[`pref_${key}`] = value;
    }
  }
  return answers;
}

/** Parse "200+", "100+", "5+", or plain numbers from option lists. */
function parseNumericOption(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const match = String(raw).trim().match(/^(\d+)/);
  return match ? Number(match[1]) : Number.NaN;
}

/** Nest pref_* into preferences for Nest splitQuestionnaireData. */
function buildApiPayload(
  answers: Record<string, unknown>,
  fields: FieldConfig[]
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const preferences: Record<string, unknown> = {};

  for (const field of fields) {
    if (!fieldVisible(field, answers)) continue;
    const raw = answers[field.name];
    if (raw === undefined || raw === null || raw === "") continue;
    if (Array.isArray(raw) && raw.length === 0) continue;

    if (field.preferences || field.name.startsWith("pref_")) {
      const key = field.name.replace(/^pref_/, "");
      const numericPref =
        field.type === "number" ||
        key === "minAge" ||
        key === "maxAge" ||
        key === "minHeight" ||
        key === "maxHeight" ||
        key === "minWeight" ||
        key === "maxWeight";
      preferences[key] = numericPref ? parseNumericOption(raw) : raw;
      continue;
    }

    if (field.name === "substanceUse") {
      payload.smokes = String(raw);
      continue;
    }

    if (
      field.name === "age" ||
      field.name === "height" ||
      field.name === "weight" ||
      field.name === "children"
    ) {
      const n = parseNumericOption(raw);
      // Never persist signup placeholders (age 0) — they fail completeness checks.
      if (Number.isFinite(n) && n > 0) payload[field.name] = n;
      continue;
    }

    payload[field.name] = raw;
  }

  // Single preferred age/height/weight UX still needs upper bounds for matching ranges.
  if (
    typeof preferences.minAge === "number" &&
    Number.isFinite(preferences.minAge) &&
    preferences.maxAge == null
  ) {
    preferences.maxAge = 60;
  }
  if (
    typeof preferences.minHeight === "number" &&
    Number.isFinite(preferences.minHeight) &&
    preferences.maxHeight == null
  ) {
    preferences.maxHeight = 210;
  }
  if (
    typeof preferences.minWeight === "number" &&
    Number.isFinite(preferences.minWeight) &&
    preferences.maxWeight == null
  ) {
    preferences.maxWeight = 150;
  }

  if (Object.keys(preferences).length > 0) {
    payload.preferences = preferences;
  }
  return payload;
}

function fieldOptions(
  field: FieldConfig,
  answers: Record<string, unknown>
): readonly string[] | number[] {
  if (field.type === "country-search" || field.type === "country-multi") {
    return ALL_COUNTRIES as unknown as string[];
  }
  if (field.name === "city") {
    return getCitiesForCountry(String(answers.country ?? ""));
  }
  return field.options ?? [];
}

function ChoicePill({
  label,
  selected,
  onClick,
  large = false,
  role,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  large?: boolean;
  role?: "option";
}) {
  return (
    <button
      type="button"
      role={role}
      aria-selected={role === "option" ? selected : undefined}
      aria-pressed={role === "option" ? undefined : selected}
      className={cn(
        "option-pill",
        large && "option-pill-lg",
        selected && "selected"
      )}
      onClick={onClick}
    >
      <span className="option-pill-label">{label}</span>
      <span className="option-pill-check" aria-hidden>
        ✓
      </span>
    </button>
  );
}

function QuestionnaireField({
  field,
  answers,
  onChange,
  hideLabel = false,
}: {
  field: FieldConfig;
  answers: Record<string, unknown>;
  onChange: (name: string, value: unknown) => void;
  hideLabel?: boolean;
}) {
  const value = answers[field.name];
  const options = fieldOptions(field, answers);
  const label = hideLabel ? null : (
    <p className="q-label">
      {field.label}
      {field.maxSelect ? (
        <span className="q-hint"> · up to {field.maxSelect}</span>
      ) : null}
    </p>
  );

  if (field.type === "textarea") {
    return (
      <div className="q-field">
        {!hideLabel && (
          <label className="q-label" htmlFor={field.name}>
            {field.label}
          </label>
        )}
        <textarea
          id={field.name}
          className="q-input"
          required={field.required}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(field.name, e.target.value)}
          rows={4}
          placeholder="Write a short answer…"
          autoFocus
        />
      </div>
    );
  }

  if (field.name === "phone") {
    return (
      <PhoneNumberField
        value={typeof value === "string" ? value : ""}
        profileCountry={
          typeof answers.country === "string" ? answers.country : null
        }
        onChange={(e164) => onChange("phone", e164)}
        hideLabel={hideLabel}
        label={field.label}
        required={field.required}
      />
    );
  }

  if (field.type === "country-search" || field.name === "country") {
    return (
      <CountrySearchField
        value={typeof value === "string" ? value : ""}
        onChange={(country) => {
          onChange(field.name, country);
          if (field.name === "country") onChange("city", "");
        }}
        hideLabel={hideLabel}
        label={field.label}
        required={field.required}
      />
    );
  }

  if (field.type === "gender-select") {
    return (
      <div className="q-field">
        {label}
        <div className="option-grid option-grid-2 q-gender">
          {(["male", "female"] as const).map((g) => (
            <ChoicePill
              key={g}
              large
              label={g === "male" ? "Man" : "Woman"}
              selected={value === g}
              onClick={() => onChange(field.name, g)}
            />
          ))}
        </div>
      </div>
    );
  }

  if (
    (field.type === "multi-select" || field.type === "country-multi") &&
    options.length > 0
  ) {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    const max = field.maxSelect;
    return (
      <div className="q-field">
        {label}
        <div className="chips">
          {options.map((opt) => {
            const optStr = String(opt);
            const active = selected.includes(optStr);
            return (
              <button
                key={optStr}
                type="button"
                className={cn("chip", active && "selected")}
                aria-pressed={active}
                onClick={() => {
                  let next = active
                    ? selected.filter((x) => x !== optStr)
                    : [...selected, optStr];
                  if (max && next.length > max) next = next.slice(0, max);
                  onChange(field.name, next);
                }}
              >
                {optStr}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (field.type === "radio" && options.length > 0) {
    return (
      <div className="q-field">
        {label}
        <div className="option-grid">
          {options.map((opt) => {
            const optStr = String(opt);
            return (
              <ChoicePill
                key={optStr}
                label={optStr}
                selected={String(value ?? "") === optStr}
                onClick={() => onChange(field.name, optStr)}
              />
            );
          })}
        </div>
      </div>
    );
  }

  if (field.name === "city") {
    const cityValue = value == null ? "" : String(value);
    return (
      <div className="q-field">
        {label}
        {options.length > 0 ? (
          <div className="option-grid" role="listbox" aria-label={field.label}>
            {options.map((opt) => {
              const optStr = String(opt);
              return (
                <ChoicePill
                  key={optStr}
                  role="option"
                  label={optStr}
                  selected={cityValue === optStr}
                  onClick={() => onChange("city", optStr)}
                />
              );
            })}
          </div>
        ) : (
          <input
            id={field.name}
            className="q-input"
            type="text"
            required={field.required}
            placeholder="Enter your city"
            value={cityValue}
            onChange={(e) => onChange("city", e.target.value)}
            autoComplete="address-level2"
            autoFocus
          />
        )}
      </div>
    );
  }

  if (options.length > 0) {
    // Always use tappable pills on phone — native <select> uses brand-tinted
    // system UI and often fails to commit the chosen value on Android WebView.
    const dense = options.length > 12;
    return (
      <div className="q-field">
        {label}
        <div
          className={cn("option-grid", dense && "option-grid-dense")}
          role="listbox"
          aria-label={field.label}
        >
          {options.map((opt) => {
            const optStr = String(opt);
            return (
              <ChoicePill
                key={optStr}
                role="option"
                label={optStr}
                selected={String(value ?? "") === optStr}
                onClick={() => {
                  onChange(field.name, optStr);
                  if (field.name === "country") onChange("city", "");
                }}
              />
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="q-field">
      {!hideLabel && (
        <label className="q-label" htmlFor={field.name}>
          {field.label}
        </label>
      )}
      <input
        id={field.name}
        className="q-input"
        type={field.type === "number" ? "number" : "text"}
        inputMode={field.type === "number" ? "numeric" : undefined}
        autoComplete={field.name === "name" ? "name" : undefined}
        required={field.required}
        placeholder={field.name === "name" ? "Your full name" : undefined}
        value={value == null ? "" : String(value)}
        onChange={(e) =>
          onChange(
            field.name,
            field.type === "number" ? Number(e.target.value) : e.target.value
          )
        }
        autoFocus
      />
    </div>
  );
}

export function GenderOnboardingPage() {
  const { refresh, accessState } = useSession();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<"male" | "female" | null>(null);

  useEffect(() => {
    // Already chose gender during register — don't ask again.
    if (accessState?.genderComplete || accessState?.registrationComplete) {
      navigate("/onboarding/questionnaire", { replace: true });
    }
  }, [accessState?.genderComplete, accessState?.registrationComplete, navigate]);

  async function choose(gender: "male" | "female") {
    setPicked(gender);
    setBusy(true);
    setError(null);
    try {
      await profileApi.completeRegistrationGender(gender);
      await refresh();
      navigate("/onboarding/questionnaire", { replace: true });
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Could not save gender");
      setBusy(false);
    }
  }

  return (
    <div className="screen q-screen">
      <div className="q-progress" aria-hidden>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: "8%" }} />
        </div>
      </div>
      <header className="q-head">
        <p className="q-kicker">Profile setup</p>
        <h1 className="font-display">I am a…</h1>
        <p className="muted">
          Choose man or woman for your marriage profile. You only choose this once.
        </p>
      </header>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      <div className="option-grid option-grid-2 q-gender">
        <button
          type="button"
          className={cn("option-pill option-pill-lg", picked === "male" && "selected")}
          disabled={busy}
          onClick={() => void choose("male")}
        >
          <span className="option-pill-label">Man</span>
        </button>
        <button
          type="button"
          className={cn("option-pill option-pill-lg", picked === "female" && "selected")}
          disabled={busy}
          onClick={() => void choose("female")}
        >
          <span className="option-pill-label">Woman</span>
        </button>
      </div>
    </div>
  );
}

export function QuestionnaireOnboardingPage() {
  const { refresh, accessState } = useSession();
  const navigate = useNavigate();
  const [screenIndex, setScreenIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [editing, setEditing] = useState(false);
  const [genderAlreadySet, setGenderAlreadySet] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const screens = useMemo(
    () =>
      buildQuestionScreens(
        STEPS,
        answers,
        editing || genderAlreadySet
      ),
    [answers, editing, genderAlreadySet]
  );

  // Keep index valid when conditional questions appear/disappear.
  useEffect(() => {
    if (screens.length === 0) return;
    if (screenIndex > screens.length - 1) {
      setScreenIndex(screens.length - 1);
    }
  }, [screens.length, screenIndex]);

  const screen = screens[Math.min(screenIndex, Math.max(0, screens.length - 1))];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [p, prefs] = await Promise.all([
          profileApi.getProfile() as Promise<Record<string, unknown> | null>,
          preferencesApi.getPreferences().catch(() => null) as Promise<Record<
            string,
            unknown
          > | null>,
        ]);
        if (cancelled) return;
        const complete = Boolean(
          p?.questionnaireComplete ?? accessState?.questionnaireComplete
        );
        setEditing(complete);
        const loaded = answersFromServer(p, prefs);
        const gender =
          loaded.gender === "male" || loaded.gender === "female"
            ? loaded.gender
            : p?.gender === "male" || p?.gender === "female"
              ? p.gender
              : null;
        // Only skip gender after the gender step (or finished questionnaire).
        // Register may seed a default gender — that must not skip /onboarding/gender.
        const skipGender = Boolean(
          p?.registrationComplete === true ||
            accessState?.genderComplete === true ||
            complete
        );
        if (gender) loaded.gender = gender;
        if (skipGender) setGenderAlreadySet(true);
        setAnswers(loaded);

        const initialScreens = buildQuestionScreens(STEPS, loaded, skipGender);
        if (!complete) {
          const firstEmpty = initialScreens.findIndex(
            (s) => !isAnswered(s.field, loaded)
          );
          if (firstEmpty >= 0) {
            setScreenIndex(firstEmpty);
          } else if (typeof p?.questionnaireStep === "number") {
            const idx = initialScreens.findIndex(
              (s) => s.apiStepId === p.questionnaireStep
            );
            if (idx >= 0) setScreenIndex(idx);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof ApiClientError
              ? e.message
              : "Could not load your questionnaire"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally re-runs only when questionnaire completion flips — genderComplete
    // is read for the initial skip decision but must not trigger a disruptive reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessState?.questionnaireComplete]);

  function setField(name: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [name]: value }));
  }

  function validateCurrent(): string | null {
    if (!screen) return "No question available.";
    const field = screen.field;
    if (!field.required) return null;
    if (!isAnswered(field, answers)) return `${field.label} is required.`;
    if (field.name === "name" && !looksLikeName(answers.name)) {
      return "Enter your full name (at least 2 characters).";
    }
    if (field.name === "phone" && !looksLikePhone(answers.phone)) {
      return "Enter your mobile number (country code is already selected).";
    }
    return null;
  }

  async function saveAndContinue(e?: FormEvent) {
    e?.preventDefault();
    if (!screen) return;
    const problem = validateCurrent();
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const payload = buildApiPayload(answers, [screen.field]);
      if (editing) {
        await questionnaire.saveProfileEdits(payload);
      } else {
        await questionnaire.updateQuestionnaire(screen.apiStepId, payload);
      }

      const nextScreens = buildQuestionScreens(
        STEPS,
        answers,
        editing || genderAlreadySet
      );
      const isLast = screenIndex >= nextScreens.length - 1;

      if (isLast) {
        if (editing) {
          const allFields = STEPS.flatMap((s) => s.fields);
          await questionnaire.saveProfileEdits(buildApiPayload(answers, allFields));
          await refresh();
          setStatus("Questionnaire updated.");
          navigate("/profile");
        } else {
          // Photo is optional — finish after contact details.
          if (!looksLikeName(answers.name)) {
            throw new Error("Enter your full name before finishing.");
          }
          if (!looksLikePhone(answers.phone)) {
            throw new Error(
              "Enter your mobile number before finishing (use the country code button if needed)."
            );
          }

          // Block Finish if basic fields were skipped (e.g. age:0 signup placeholder).
          const basicFields =
            STEPS.find((s) => s.id === 1)?.fields ??
            STEPS.flatMap((s) => s.fields).filter((f) =>
              ["age", "country", "city", "height", "weight", "languagesSpoken"].includes(
                f.name
              )
            );
          const missingBasic = basicFields.filter((f) => !isAnswered(f, answers));
          if (missingBasic.length > 0) {
            const idx = screens.findIndex((s) =>
              missingBasic.some((f) => f.name === s.field.name)
            );
            if (idx >= 0) setScreenIndex(idx);
            throw new Error(
              `Please answer: ${missingBasic.map((f) => f.label).join(", ")}.`
            );
          }

          // Flush every answer again — step-by-step saves can miss fields on Android.
          const allFields = STEPS.flatMap((s) => s.fields);
          const fullPayload = buildApiPayload(answers, allFields);
          await questionnaire.saveProfileEdits(fullPayload);
          // Also push via update so prod always has a step write path.
          await questionnaire.updateQuestionnaire(9, fullPayload);
          await questionnaire.completeQuestionnaire();
          await refresh();
          navigate("/plans");
        }
      } else {
        setScreenIndex((i) => i + 1);
        setStatus(null);
      }
    } catch (err) {
      const message =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not save answers";
      setError(
        /photo/i.test(message)
          ? `${message} Profile photo is optional.`
          : message
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="screen q-screen" aria-busy="true">
        <p className="muted center" style={{ marginTop: "30vh" }}>
          Loading your answers…
        </p>
      </div>
    );
  }

  if (!screen || screens.length === 0) {
    return (
      <div className="screen q-screen">
        <p>No questionnaire steps configured.</p>
        <Link to={editing ? "/profile" : "/plans"}>Continue</Link>
      </div>
    );
  }

  const progress = ((screenIndex + 1) / screens.length) * 100;
  const isLast = screenIndex >= screens.length - 1;
  const hint =
    screen.field.name === "phone"
      ? "Add your number, then tap Finish"
      : screen.field.type === "multi-select" || screen.field.type === "country-multi"
        ? screen.field.maxSelect
          ? `Pick up to ${screen.field.maxSelect}`
          : "Select all that apply"
        : "Tap an answer to continue";

  return (
    <div className="screen q-screen">
      <div className="q-progress">
        <div className="q-progress-meta">
          <span>
            {screenIndex + 1} of {screens.length}
          </span>
          {editing ? (
            <Link to="/profile" className="q-close">
              Close
            </Link>
          ) : (
            <span>{editing ? "Edit" : screen.section}</span>
          )}
        </div>
        <div className="progress-track" aria-hidden>
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <header className="q-head">
        <h1 className="font-display">{screen.field.label}</h1>
        <p className="muted">{hint}</p>
      </header>

      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {status && (
        <div className="form-success" role="status">
          {status}
        </div>
      )}

      <form className="q-form" onSubmit={(e) => void saveAndContinue(e)}>
        <div className="q-fields">
          <QuestionnaireField
            key={screen.field.name}
            field={screen.field}
            answers={answers}
            onChange={setField}
            hideLabel
          />
        </div>

        <div className="q-actions">
          {screenIndex > 0 ? (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => {
                setError(null);
                setStatus(null);
                setScreenIndex((i) => Math.max(0, i - 1));
              }}
            >
              Back
            </button>
          ) : (
            <span />
          )}
          <button type="submit" className="btn btn-primary q-continue" disabled={busy}>
            {busy
              ? "Saving…"
              : isLast
                ? editing
                  ? "Save changes"
                  : "Finish"
                : "Continue"}
          </button>
        </div>
      </form>
    </div>
  );
}


type OnboardingPhoto = { mediaId?: string; url?: string | null; isMain?: boolean };

/**
 * Mandatory photo step. Sits between the questionnaire and payment — a member
 * cannot reach Home, Discover, Matches or the paywall without one clear photo.
 */
export function PhotoOnboardingPage() {
  const { user, accessState, refresh } = useSession();
  const navigate = useNavigate();
  const [list, setList] = useState<OnboardingPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    try {
      const res = (await photosApi.listMine()) as
        | { photos?: OnboardingPhoto[] }
        | OnboardingPhoto[];
      const items = Array.isArray(res) ? res : (res?.photos ?? []);
      setList(items.filter((p) => p && (p.url || p.mediaId)));
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  async function addPhoto() {
    setBusy(true);
    setError(null);
    try {
      const { pickProfilePhoto, isPhotoPickCancelled } = await import(
        "@/platform/camera"
      );
      let picked;
      try {
        picked = await pickProfilePhoto("library");
      } catch (e) {
        if (isPhotoPickCancelled(e)) return;
        throw e;
      }
      const file = new File([picked.blob], picked.fileName, {
        type: picked.contentType,
      });
      await photosApi.uploadFile(file, {
        slot: list.length === 0 ? "main" : "additional",
      });
      markPhotoAdded();
      await reload();
    } catch (e) {
      setError(userFacingError(e));
    } finally {
      setBusy(false);
    }
  }

  async function continueOn() {
    setBusy(true);
    try {
      await refresh();
    } catch {
      /* non-blocking */
    }
    markPhotoAdded();
    navigate(securityHomeRoute(user, accessState), { replace: true });
  }

  const hasPhoto = list.length > 0;

  return (
    <div className="screen q-screen">
      <div className="q-progress" aria-hidden>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: "92%" }} />
        </div>
      </div>
      <header className="q-head">
        <p className="q-kicker">Profile setup</p>
        <h1 className="font-display">Add your photo</h1>
        <p className="muted">
          One clear photo of your face is required — profiles without a photo
          can't be shown to anyone. You can add more or change it later.
        </p>
      </header>

      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}

      <div className="onboard-photo-grid">
        {loading ? (
          <p className="muted small">Loading…</p>
        ) : (
          <>
            {list.map((p, i) => (
              <SafeImage
                key={p.mediaId ?? i}
                src={p.url ?? null}
                alt={`Photo ${i + 1}`}
                className="onboard-photo-thumb"
              />
            ))}
            {list.length < 5 && (
              <button
                type="button"
                className="onboard-photo-add"
                disabled={busy}
                onClick={() => void addPhoto()}
              >
                {busy ? "Uploading…" : "+ Add photo"}
              </button>
            )}
          </>
        )}
      </div>

      <div className="q-actions">
        <span />
        <button
          type="button"
          className="btn btn-primary q-continue"
          disabled={busy || !hasPhoto}
          onClick={() => void continueOn()}
        >
          {hasPhoto ? "Continue" : "Add a photo to continue"}
        </button>
      </div>
    </div>
  );
}
