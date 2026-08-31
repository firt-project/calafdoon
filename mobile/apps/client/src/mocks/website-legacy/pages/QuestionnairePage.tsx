import { useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { RequireAuth } from "@/components/auth/gates";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import {
  PHOTO_STEP_INDEX,
  STEPS,
  type FieldConfig,
} from "@/data/questionnaire-steps";
import { bumpData, useApp } from "@/hooks/use-app";
import { getCitiesForCountry } from "@/lib/constants";
import { ALL_COUNTRIES } from "@/lib/countries";
import { useTranslation } from "@/lib/i18n/context";
import { authService } from "@/services/auth-service";
import type { ProfileAnswers } from "@/types";
import { cn, safeErrorMessage } from "@/utils/cn";

function fieldVisible(field: FieldConfig, answers: ProfileAnswers): boolean {
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

export function QuestionnairePage() {
  const { t } = useTranslation();
  const { session, profile, refresh } = useApp();
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<ProfileAnswers>(profile?.answers ?? {});
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(
    profile?.photoDataUrl ?? null
  );
  const [error, setError] = useState<string | null>(null);

  const step = STEPS[stepIndex];
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  const visibleFields = useMemo(
    () => step.fields.filter((f) => fieldVisible(f, answers)),
    [step, answers]
  );

  if (!session) return <Navigate to="/login" replace />;
  if (!profile?.registrationComplete) return <Navigate to="/register/details" replace />;

  function setValue(name: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [name]: value }));
  }

  function validateStep(): string | null {
    for (const field of visibleFields) {
      if (!field.required) continue;
      const val = answers[field.name];
      if (val == null || val === "" || (Array.isArray(val) && val.length === 0)) {
        return `${field.label} is required.`;
      }
    }
    return null;
  }

  function next() {
    const problem = validateStep();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    if (stepIndex >= STEPS.length - 1) {
      try {
        if (!session) return;
        authService.saveQuestionnaire(session.userId, answers, photoDataUrl);
        bumpData();
        refresh();
        navigate("/payment");
      } catch (err) {
        setError(safeErrorMessage(err, "Could not save questionnaire."));
      }
      return;
    }
    setStepIndex((i) => i + 1);
  }

  function back() {
    setError(null);
    setStepIndex((i) => Math.max(0, i - 1));
  }

  function onPhoto(file: File | null) {
    if (!file) {
      setPhotoDataUrl(null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > 2_500_000) {
      setError("Please use an image under 2.5MB for local storage.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPhotoDataUrl(typeof reader.result === "string" ? reader.result : null);
      setError(null);
    };
    reader.onerror = () => setError("Could not read image.");
    reader.readAsDataURL(file);
  }

  return (
    <RequireAuth>
      <MarketingLayout>
        <section className="section">
          <div className="container-narrow card" style={{ padding: "1.5rem" }}>
            <p className="muted" style={{ margin: 0 }}>
              {t("auth.stepOf", { step: stepIndex + 1, total: STEPS.length })}
            </p>
            <div className="progress-track" style={{ margin: "0.75rem 0 1.25rem" }}>
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <h1 className="font-display" style={{ marginTop: 0 }}>
              {step.title}
            </h1>
            <p className="muted">{step.description}</p>
            {error && <div className="form-error">{error}</div>}

            {stepIndex === PHOTO_STEP_INDEX ? (
              <div className="stack">
                <div className="field">
                  <label htmlFor="photo">Profile photo (optional)</label>
                  <input
                    id="photo"
                    type="file"
                    accept="image/*"
                    onChange={(e) => onPhoto(e.target.files?.[0] ?? null)}
                  />
                </div>
                {photoDataUrl && (
                  <img
                    src={photoDataUrl}
                    alt="Preview"
                    style={{
                      width: "8rem",
                      height: "8rem",
                      objectFit: "cover",
                      borderRadius: "1rem",
                      border: "1px solid var(--border)",
                    }}
                  />
                )}
              </div>
            ) : (
              visibleFields.map((field) => (
                <FieldInput
                  key={field.name}
                  field={field}
                  answers={answers}
                  onChange={setValue}
                />
              ))
            )}

            <div className="row" style={{ marginTop: "1.25rem" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={back}
                disabled={stepIndex === 0}
              >
                {t("common.back")}
              </button>
              <button type="button" className="btn btn-primary" onClick={next}>
                {stepIndex === STEPS.length - 1
                  ? t("auth.continueToPayment")
                  : t("auth.continue")}
              </button>
            </div>
          </div>
        </section>
      </MarketingLayout>
    </RequireAuth>
  );
}

function FieldInput({
  field,
  answers,
  onChange,
}: {
  field: FieldConfig;
  answers: ProfileAnswers;
  onChange: (name: string, value: unknown) => void;
}) {
  const value = answers[field.name];

  if (field.type === "gender-select") {
    return (
      <div className="field">
        <label>{field.label}</label>
        <div className="grid-2">
          {(["male", "female"] as const).map((g) => (
            <button
              key={g}
              type="button"
              className={cn("option-pill", value === g && "selected")}
              onClick={() => onChange(field.name, g)}
            >
              {g === "male" ? "Male" : "Female"}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (field.name === "city") {
    const cities = getCitiesForCountry(String(answers.country ?? ""));
    return (
      <div className="field">
        <label htmlFor={field.name}>{field.label}</label>
        {cities.length ? (
          <select
            id={field.name}
            value={String(value ?? "")}
            onChange={(e) => onChange(field.name, e.target.value)}
          >
            <option value="">Select…</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={field.name}
            value={String(value ?? "")}
            onChange={(e) => onChange(field.name, e.target.value)}
            placeholder="City"
          />
        )}
      </div>
    );
  }

  if (field.type === "multi-select" || field.type === "country-multi") {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    const options =
      field.type === "country-multi" ? ALL_COUNTRIES : (field.options ?? []);
    return (
      <div className="field">
        <label>{field.label}</label>
        <div className="chips">
          {options.map((opt) => {
            const label = String(opt);
            const active = selected.includes(label);
            return (
              <button
                key={label}
                type="button"
                className={cn("chip", active && "selected")}
                onClick={() => {
                  if (active) {
                    onChange(
                      field.name,
                      selected.filter((x) => x !== label)
                    );
                  } else if (!field.maxSelect || selected.length < field.maxSelect) {
                    onChange(field.name, [...selected, label]);
                  }
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (field.type === "radio") {
    return (
      <div className="field">
        <label>{field.label}</label>
        <div className="option-grid">
          {(field.options ?? []).map((opt) => {
            const label = String(opt);
            return (
              <button
                key={label}
                type="button"
                className={cn("option-pill", value === label && "selected")}
                onClick={() => onChange(field.name, label)}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <div className="field">
        <label htmlFor={field.name}>{field.label}</label>
        <textarea
          id={field.name}
          rows={3}
          value={String(value ?? "")}
          onChange={(e) => onChange(field.name, e.target.value)}
        />
      </div>
    );
  }

  if (field.type === "select" || field.type === "country-search") {
    const list =
      field.type === "country-search" ? ALL_COUNTRIES : (field.options ?? []);
    return (
      <div className="field">
        <label htmlFor={field.name}>{field.label}</label>
        <select
          id={field.name}
          value={String(value ?? "")}
          onChange={(e) => onChange(field.name, e.target.value)}
        >
          <option value="">Select…</option>
          {list.map((opt) => (
            <option key={String(opt)} value={String(opt)}>
              {String(opt)}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="field">
      <label htmlFor={field.name}>{field.label}</label>
      <input
        id={field.name}
        value={String(value ?? "")}
        onChange={(e) => onChange(field.name, e.target.value)}
      />
    </div>
  );
}
