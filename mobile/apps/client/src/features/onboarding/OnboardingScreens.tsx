import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  apiClient,
  profile as profileApi,
  preferences as preferencesApi,
  photos as photosApi,
  questionnaire,
  ApiClientError,
} from "@hel/api-client";
import { useSession, securityHomeRoute } from "@/features/auth/SessionProvider";
import { SafeImage } from "@/ui/SafeImage";
import { useBackToClose } from "@/ui/mobile-kit";
import { LogoutControl } from "@/features/auth/LogoutControl";
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
import { MapPin } from "lucide-react";
import { requestDeviceLocation } from "@/platform/location";
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
    if (height > 0) answers.height = String(height);
    else delete answers.height;
    if (weight > 0) answers.weight = String(weight);
    else delete answers.weight;
  }

  // Existing members with a saved place are not forced to re-verify when editing.
  if (String(profile.country ?? "").trim() && String(profile.city ?? "").trim()) {
    answers.locationMode = "gps";
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
        answers[`pref_${key}`] = String(n);
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
      if (field.rangeMaxName) {
        const upper = parseNumericOption(answers[field.rangeMaxName]);
        if (Number.isFinite(upper) && upper > 0) {
          preferences[field.rangeMaxName.replace(/^pref_/, "")] = upper;
        }
      }
      continue;
    }

    // GPS location is saved by /profile/geolocation/verify, not this payload.
    if (field.name === "locationMode" || field.name === "profilePhoto") continue;

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

function ageFromDob(iso: string): number {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return 0;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const beforeBirthday =
    now.getMonth() < d.getMonth() ||
    (now.getMonth() === d.getMonth() && now.getDate() < d.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WHEEL_ITEM_PX = 44;

/** One snapping column. `selected` is the item index, or -1 when nothing is chosen yet. */
function WheelColumn({
  items,
  selected,
  onSelect,
  label,
  initialIndex = 0,
}: {
  items: string[];
  selected: number;
  onSelect: (index: number) => void;
  label: string;
  /** Where an unset wheel opens (it only becomes a value once the user moves it). */
  initialIndex?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const ignoreUntil = useRef(0);
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastSelected = useRef(selected);

  // Keep the wheel in sync when the value changes from outside (e.g. day clamped).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = (selected >= 0 ? selected : initialIndex) * WHEEL_ITEM_PX;
    if (Math.abs(el.scrollTop - target) > 2) {
      ignoreUntil.current = Date.now() + 300; // our own scroll must not count as a choice
      el.scrollTo({ top: target });
    }
    lastSelected.current = selected;
  }, [selected, items.length, initialIndex]);

  function onScroll() {
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const el = ref.current;
      if (!el || Date.now() < ignoreUntil.current) return;
      const index = Math.min(
        items.length - 1,
        Math.max(0, Math.round(el.scrollTop / WHEEL_ITEM_PX))
      );
      if (index !== lastSelected.current) {
        lastSelected.current = index;
        onSelect(index);
      } else if (selected < 0) {
        onSelect(index);
      }
    }, 90);
  }

  useEffect(() => () => clearTimeout(settle.current), []);

  return (
    <div
      ref={ref}
      className="dob-wheel"
      role="listbox"
      aria-label={label}
      onScroll={onScroll}
    >
      {items.map((item, i) => (
        <button
          key={item}
          type="button"
          role="option"
          aria-selected={i === selected}
          className={cn("dob-item", i === selected && "is-selected")}
          onClick={() => {
            ref.current?.scrollTo({ top: i * WHEEL_ITEM_PX, behavior: "smooth" });
            onSelect(i);
          }}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

/** Date of birth → age. 18+ is enforced by the year range and by validation. */
function DobField({
  age,
  value,
  onChange,
}: {
  age: unknown;
  value: string;
  onChange: (dob: string, age: number) => void;
}) {
  const thisYear = new Date().getFullYear();
  const years = useMemo(
    () => Array.from({ length: 82 }, (_, i) => String(thisYear - 18 - i)),
    [thisYear]
  );
  const [y, m, d] = value ? value.split("-").map(Number) : [0, 0, 0];
  const yearIdx = y ? years.indexOf(String(y)) : -1;
  const monthIdx = m ? m - 1 : -1;
  const daysInMonth = new Date(y || 2000, m || 1, 0).getDate();
  const days = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => String(i + 1)),
    [daysInMonth]
  );
  const dayIdx = d ? Math.min(d, daysInMonth) - 1 : -1;

  function commit(nextY: number, nextM: number, nextD: number) {
    const maxDay = new Date(nextY, nextM, 0).getDate();
    const day = Math.min(nextD, maxDay);
    const iso = `${nextY}-${String(nextM).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    onChange(iso, ageFromDob(iso));
  }

  // Unset parts fall back to sensible defaults the first time any wheel moves.
  const curY = y || Number(years[Math.min(years.length - 1, 7)]);
  const curM = m || 1;
  const curD = d || 1;

  const computed = value ? ageFromDob(value) : 0;
  const knownAge = Number(age);
  const summary = value
    ? `${Math.min(d, daysInMonth)} ${MONTHS[m - 1]} ${y}`
    : null;

  return (
    <div className="q-field dob">
      <div className="dob-picker">
        <div className="dob-band" aria-hidden />
        <WheelColumn
          label="Day"
          items={days}
          selected={dayIdx}
          onSelect={(i) => commit(curY, curM, i + 1)}
        />
        <WheelColumn
          label="Month"
          items={MONTHS}
          selected={monthIdx}
          onSelect={(i) => commit(curY, i + 1, curD)}
        />
        <WheelColumn
          label="Year"
          items={years}
          selected={yearIdx}
          onSelect={(i) => commit(Number(years[i]), curM, curD)}
        />
      </div>
      <p className={cn("dob-summary", computed >= 18 && "is-ready")} role="status">
        {summary ? (
          <>
            <strong>{summary}</strong> · You are {computed} years old
          </>
        ) : knownAge > 0 ? (
          `Saved age: ${knownAge}. Scroll to enter your date of birth.`
        ) : (
          "Scroll each column to pick your birthday"
        )}
      </p>
    </div>
  );
}

/** Preferred range (age / height / weight): two wheels, From and To, kept in order. */
function RangeWheelField({
  field,
  answers,
  onChange,
}: {
  field: FieldConfig;
  answers: Record<string, unknown>;
  onChange: (name: string, value: unknown) => void;
}) {
  const min = field.min ?? 0;
  const max = field.max ?? 0;
  const unit = field.unit ?? "";
  const maxName = field.rangeMaxName ?? "";
  const items = useMemo(
    () => Array.from({ length: max - min + 1 }, (_, i) => String(min + i)),
    [min, max]
  );
  const toIdx = (v: unknown) => {
    const n = Number.parseInt(String(v ?? ""), 10);
    return Number.isFinite(n) && n >= min && n <= max ? n - min : -1;
  };
  const lo = toIdx(answers[field.name]);
  const hi = toIdx(answers[maxName]);
  const defLo = Math.max(0, (field.defaultValue ?? min) - min);
  const defHi = Math.max(0, (field.defaultMax ?? max) - min);

  /** Always store both bounds together, with From never above To. */
  function commit(nextLo: number, nextHi: number, moved: "lo" | "hi") {
    let a = nextLo;
    let b = nextHi;
    if (a > b) {
      if (moved === "lo") b = a;
      else a = b;
    }
    onChange(field.name, items[a]);
    onChange(maxName, items[b]);
  }

  return (
    <div className="q-field nw">
      <div className="nw-readout" role="status">
        {lo >= 0 && hi >= 0 ? (
          <>
            <strong>
              {items[lo]} – {items[hi]}
            </strong>{" "}
            <span>{unit}</span>
          </>
        ) : (
          <small>Scroll From and To</small>
        )}
      </div>
      <div className="rw-heads" aria-hidden>
        <span>From</span>
        <span>To</span>
      </div>
      <div className="nw-picker rw-picker">
        <div className="dob-band" aria-hidden />
        <WheelColumn
          label={`${field.label} from`}
          items={items}
          selected={lo}
          initialIndex={defLo}
          onSelect={(i) => commit(i, hi >= 0 ? hi : Math.max(i, defHi), "lo")}
        />
        <WheelColumn
          label={`${field.label} to`}
          items={items}
          selected={hi}
          initialIndex={defHi}
          onSelect={(i) => commit(lo >= 0 ? lo : Math.min(i, defLo), i, "hi")}
        />
      </div>
    </div>
  );
}

/** One big number wheel (height in cm, weight in kg) with a live imperial hint. */
function NumberWheelField({
  field,
  value,
  onChange,
}: {
  field: FieldConfig;
  value: unknown;
  onChange: (next: string) => void;
}) {
  const min = field.min ?? 0;
  const max = field.max ?? 0;
  const unit = field.unit ?? "";
  const items = useMemo(
    () => Array.from({ length: max - min + 1 }, (_, i) => String(min + i)),
    [min, max]
  );
  const n = Number.parseInt(String(value ?? ""), 10);
  const idx = Number.isFinite(n) && n >= min && n <= max ? n - min : -1;
  const initial = Math.max(0, (field.defaultValue ?? min) - min);

  let hint = "";
  if (idx >= 0) {
    if (unit === "cm") {
      const totalIn = Math.round(n / 2.54);
      hint = `${Math.floor(totalIn / 12)} ft ${totalIn % 12} in`;
    } else if (unit === "kg") {
      hint = `${Math.round(n * 2.2046)} lb`;
    }
  }

  return (
    <div className="q-field nw">
      <div className="nw-readout" role="status">
        {idx >= 0 ? (
          <>
            <strong>{n}</strong> <span>{unit}</span>
            <small>{hint}</small>
          </>
        ) : (
          <small>Scroll to choose</small>
        )}
      </div>
      <div className="nw-picker">
        <div className="dob-band" aria-hidden />
        <WheelColumn
          label={field.label}
          items={items}
          selected={idx}
          initialIndex={initial}
          onSelect={(i) => onChange(items[i])}
        />
      </div>
    </div>
  );
}

type GeoState = "idle" | "busy" | "denied" | "failed";

/**
 * Location, like other dating apps: one clear permission request, no way around it.
 * The position is verified on the server, which saves the city and country.
 */
function LocationField({
  mode,
  city,
  country,
  onGps,
}: {
  mode: string;
  city: string;
  country: string;
  onGps: (country: string, city: string) => void;
}) {
  const [state, setState] = useState<GeoState>("idle");
  const [note, setNote] = useState<string | null>(null);

  async function turnOn() {
    setState("busy");
    setNote(null);
    const pos = await requestDeviceLocation();
    if (!pos.ok) {
      setState(pos.reason === "denied" ? "denied" : "failed");
      return;
    }
    try {
      const res = await apiClient.post<{ country: string; city: string }>(
        "/profile/geolocation/verify",
        {
          latitude: pos.latitude,
          longitude: pos.longitude,
          accuracy: pos.accuracy,
        }
      );
      onGps(res.country, res.city);
      setState("idle");
    } catch (e) {
      const msg = e instanceof ApiClientError ? e.message : "";
      setNote(
        /COUNTRY_UNSUPPORTED/.test(msg)
          ? "HelCalaf isn't available in your area yet."
          : null
      );
      setState("failed");
    }
  }

  const confirmed = mode === "gps" && Boolean(city) && Boolean(country);

  return (
    <div className="q-field q-location">
      <div className="q-location-card">
        <MapPin size={22} aria-hidden />
        {confirmed ? (
          <div>
            <strong>
              {city}, {country}
            </strong>
            <p className="muted">Location confirmed</p>
          </div>
        ) : (
          <p>
            We use your location to show you people nearby. Only your city is
            shown to others, never your exact position.
          </p>
        )}
      </div>
      {state === "denied" && (
        <p className="q-location-note" role="status">
          Location is needed to find people near you. If you blocked it, open
          your phone Settings, then Apps, HelCalaf, Permissions, Location, and
          allow it. Then tap the button again.
        </p>
      )}
      {state === "failed" && (
        <p className="q-location-note" role="status">
          {note ??
            "We couldn't get your location. Make sure location is switched on, then try again."}
        </p>
      )}
      <button
        type="button"
        className={confirmed ? "btn btn-ghost btn-block" : "btn btn-primary btn-block"}
        disabled={state === "busy"}
        onClick={() => void turnOn()}
      >
        {state === "busy"
          ? "Finding you…"
          : confirmed
            ? "Update my location"
            : "Turn on location"}
      </button>
    </div>
  );
}

const POPULAR_COUNTRIES = [
  "Somalia", "Kenya", "Ethiopia", "Djibouti", "United Arab Emirates",
  "Saudi Arabia", "Qatar", "United Kingdom", "United States", "Canada",
  "Sweden", "Norway", "Netherlands", "Australia", "Finland", "Denmark",
  "Germany", "Turkey",
];

/** Multi-country picker: selected chips on top, search, popular countries first. */
function CountryMultiField({
  selected,
  onChange,
  label,
  hideLabel,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
  label: string;
  hideLabel: boolean;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const pool = q
    ? (ALL_COUNTRIES as readonly string[]).filter((c) => c.toLowerCase().includes(q))
    : POPULAR_COUNTRIES;
  const shown = pool.filter((c) => !selected.includes(c));

  function toggle(c: string) {
    onChange(selected.includes(c) ? selected.filter((x) => x !== c) : [...selected, c]);
  }

  return (
    <div className="q-field">
      {!hideLabel && <p className="q-label">{label}</p>}
      {selected.length > 0 && (
        <div className="chips" style={{ marginBottom: "0.75rem" }}>
          {selected.map((c) => (
            <button
              key={c}
              type="button"
              className="chip selected"
              aria-pressed
              onClick={() => toggle(c)}
            >
              {c} ✕
            </button>
          ))}
        </div>
      )}
      <input
        className="q-input"
        type="search"
        placeholder="Search any country…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <p className="muted" style={{ margin: "0.75rem 0 0.5rem" }}>
        {q ? "Results" : "Popular"}
      </p>
      <div className="chips">
        {shown.map((c) => (
          <button key={c} type="button" className="chip" onClick={() => toggle(c)}>
            {c}
          </button>
        ))}
        {shown.length === 0 && <span className="muted">No countries found</span>}
      </div>
    </div>
  );
}

function QuestionnaireField({
  field,
  answers,
  onChange,
  onSingleSelect,
  hideLabel = false,
}: {
  field: FieldConfig;
  answers: Record<string, unknown>;
  onChange: (name: string, value: unknown) => void;
  /** Called after a single-choice tap so the page can auto-advance. */
  onSingleSelect?: (name: string, value: unknown) => void;
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

  if (field.type === "photo") {
    return (
      <PhotoStepBody
        onCountChange={(n) => onChange(field.name, n > 0 ? String(n) : "")}
      />
    );
  }

  if (field.type === "range") {
    return <RangeWheelField field={field} answers={answers} onChange={onChange} />;
  }

  if (field.type === "wheel") {
    return (
      <NumberWheelField
        field={field}
        value={value}
        onChange={(next) => onChange(field.name, next)}
      />
    );
  }

  if (field.type === "dob") {
    return (
      <DobField
        age={answers.age}
        value={typeof answers.dateOfBirth === "string" ? answers.dateOfBirth : ""}
        onChange={(dob, age) => {
          onChange("dateOfBirth", dob);
          onChange(field.name, age > 0 ? String(age) : "");
        }}
      />
    );
  }

  if (field.type === "location") {
    return (
      <LocationField
        mode={typeof value === "string" ? value : ""}
        city={typeof answers.city === "string" ? answers.city : ""}
        country={typeof answers.country === "string" ? answers.country : ""}
        onGps={(country, city) => {
          onChange("country", country);
          onChange("city", city);
          onChange(field.name, "gps");
        }}
      />
    );
  }

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
              onClick={() => {
                onChange(field.name, g);
                onSingleSelect?.(field.name, g);
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (field.type === "country-multi") {
    return (
      <CountryMultiField
        selected={Array.isArray(value) ? (value as string[]) : []}
        onChange={(next) => onChange(field.name, next)}
        label={field.label}
        hideLabel={hideLabel}
      />
    );
  }

  if (field.type === "multi-select" && options.length > 0) {
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
                onClick={() => {
                  onChange(field.name, optStr);
                  onSingleSelect?.(field.name, optStr);
                }}
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
                  onClick={() => {
                    onChange("city", optStr);
                    onSingleSelect?.("city", optStr);
                  }}
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
                  else onSingleSelect?.(field.name, optStr);
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
      <div className="q-progress">
        <div className="q-progress-meta">
          <span aria-hidden />
          <LogoutControl />
        </div>
        <div className="progress-track" aria-hidden>
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
  const [answersState, setAnswers] = useState<Record<string, unknown>>({});
  const answers = answersState;
  const [showList, setShowList] = useState(false);
  const reviewRef = useRef<HTMLDivElement>(null);
  useBackToClose(reviewRef, showList, () => setShowList(false));
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
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

  // A pending auto-advance must not fire after the user navigates elsewhere.
  useEffect(() => {
    clearTimeout(autoAdvanceTimer.current);
    return () => clearTimeout(autoAdvanceTimer.current);
  }, [screenIndex]);

  /** Single-choice tap: save and move on after a short beat (not on the last screen). */
  function autoAdvance(name: string, value: unknown) {
    if (busy || screenIndex >= screens.length - 1) return;
    const next = { ...answers, [name]: value };
    clearTimeout(autoAdvanceTimer.current);
    autoAdvanceTimer.current = setTimeout(() => {
      void saveAndContinue(undefined, next);
    }, 250);
  }

  function setField(name: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [name]: value }));
  }

  function validateCurrent(answers: Record<string, unknown>): string | null {
    if (!screen) return "No question available.";
    const field = screen.field;
    if (!field.required) return null;
    if (!isAnswered(field, answers)) {
      return field.type === "photo"
        ? "Add a photo to continue."
        : `${field.label} is required.`;
    }
    if (field.name === "age") {
      const dob = typeof answers.dateOfBirth === "string" ? answers.dateOfBirth : "";
      if (dob && ageFromDob(dob) < 18) return "You must be 18 or older to join.";
    }
    if (field.name === "name" && !looksLikeName(answers.name)) {
      return "Enter your full name (at least 2 characters).";
    }
    if (field.name === "phone" && !looksLikePhone(answers.phone)) {
      return "Enter your mobile number (country code is already selected).";
    }
    return null;
  }

  async function saveAndContinue(
    e?: FormEvent,
    answersOverride?: Record<string, unknown>
  ) {
    e?.preventDefault();
    if (!screen) return;
    const answers = answersOverride ?? answersState;
    const problem = validateCurrent(answers);
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
          // Check EVERYTHING required before finishing, and say exactly what is missing.
          const missing = nextScreens.filter(
            (sc) => sc.field.required && !isAnswered(sc.field, answers)
          );
          if (missing.length > 0) {
            const idx = nextScreens.findIndex(
              (sc) => sc.field.name === missing[0].field.name
            );
            if (idx >= 0) setScreenIndex(idx);
            const names = missing.map((sc) => sc.field.label.replace(/\?$/, ""));
            const shown = names.slice(0, 4).join(", ");
            const more = names.length > 4 ? ` and ${names.length - 4} more` : "";
            throw new Error(`Almost there. Still needed: ${shown}${more}.`);
          }
          if (!looksLikeName(answers.name)) {
            throw new Error("Enter your full name before finishing.");
          }
          if (!looksLikePhone(answers.phone)) {
            throw new Error(
              "Enter your mobile number before finishing (use the country code button if needed)."
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
    screen.field.type === "photo"
      ? "A clear photo of your face is required"
      : screen.field.type === "range"
      ? "Scroll both wheels, then tap Continue"
      : screen.field.type === "wheel"
      ? "Scroll to your number, then tap Continue"
      : screen.field.type === "dob"
      ? "We only show your age, never your birthday"
      : screen.field.type === "location"
        ? "We need your location to show people near you"
        : screen.field.name === "phone"
      ? "Add your number, then tap Finish"
      : screen.field.type === "multi-select" || screen.field.type === "country-multi"
        ? `${screen.field.maxSelect ? `Pick up to ${screen.field.maxSelect}` : "Select all that apply"}${screen.field.required ? "" : " · or skip"}`
        : "Tap an answer";

  return (
    <div className="screen q-screen">
      <div className="q-progress">
        <div className="q-progress-meta">
          <button
            type="button"
            className="q-jump"
            onClick={() => setShowList(true)}
            aria-label="Review and edit all answers"
          >
            {screenIndex + 1} of {screens.length} · Review ▾
          </button>
          {editing ? (
            <Link to="/profile" className="q-close">
              Close
            </Link>
          ) : (
            <LogoutControl />
          )}
        </div>
        <div className="progress-track" aria-hidden>
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {showList && (
        <div
          ref={reviewRef}
          className="q-review"
          role="dialog"
          aria-label="All answers"
          data-dialog-open="true"
        >
          <div className="q-review-head">
            <strong>Your answers</strong>
            <button type="button" className="q-close" onClick={() => setShowList(false)}>
              Close
            </button>
          </div>
          <ul className="q-review-list">
            {screens.map((sc, i) => {
              const v = answers[sc.field.name];
              const text = !isAnswered(sc.field, answers)
                ? "Not answered"
                : Array.isArray(v)
                  ? v.join(", ")
                  : sc.field.type === "photo"
                    ? `${String(v)} photo${Number(v) === 1 ? "" : "s"}`
                    : sc.field.rangeMaxName
                    ? `${String(v)} – ${String(answers[sc.field.rangeMaxName] ?? "")} ${sc.field.unit ?? ""}`.trim()
                    : String(v);
              return (
                <li key={sc.field.name}>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setScreenIndex(i);
                      setShowList(false);
                    }}
                  >
                    <span className="q-review-q">{sc.field.label}</span>
                    <span className="q-review-a">{text}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

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
            onSingleSelect={autoAdvance}
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
              : !screen.field.required && !isLast && !isAnswered(screen.field, answers)
                ? "Skip"
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

/** Photo grid + uploader, shared by the questionnaire's last question and the standalone page. */
function PhotoStepBody({
  onCountChange,
}: {
  onCountChange?: (count: number) => void;
}) {
  const [list, setList] = useState<OnboardingPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    let items: OnboardingPhoto[] = [];
    try {
      const res = (await photosApi.listMine()) as
        | { photos?: OnboardingPhoto[] }
        | OnboardingPhoto[];
      items = (Array.isArray(res) ? res : (res?.photos ?? [])).filter(
        (p) => p && (p.url || p.mediaId)
      );
    } catch {
      items = [];
    } finally {
      setList(items);
      setLoading(false);
      onCountChange?.(items.length);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return (
    <div className="q-field">
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
    </div>
  );
}

/**
 * Mandatory photo step. Sits between the questionnaire and payment — a member
 * cannot reach Home, Discover, Matches or the paywall without one clear photo.
 */
export function PhotoOnboardingPage() {
  const { user, accessState, refresh } = useSession();
  const navigate = useNavigate();
  const [photoCount, setPhotoCount] = useState(0);
  const [busy, setBusy] = useState(false);

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

  const hasPhoto = photoCount > 0;

  return (
    <div className="screen q-screen">
      <div className="q-progress">
        <div className="q-progress-meta">
          <span aria-hidden />
          <LogoutControl />
        </div>
        <div className="progress-track" aria-hidden>
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

      <PhotoStepBody onCountChange={setPhotoCount} />

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
