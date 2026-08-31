import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import {
  buildE164,
  dialCountryForName,
  searchDialCountries,
  splitPhone,
  stripTrunkZero,
  type DialCountry,
} from "@/lib/country-dial-codes";
import { cn } from "@/utils/cn";

type Props = {
  value?: string | null;
  profileCountry?: string | null;
  onChange: (e164: string) => void;
  hideLabel?: boolean;
  label?: string;
  required?: boolean;
};

export function PhoneNumberField({
  value,
  profileCountry,
  onChange,
  hideLabel,
  label = "Phone number",
  required,
}: Props) {
  const listId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const nationalRef = useRef<HTMLInputElement>(null);

  const initial = splitPhone(value, profileCountry);
  const [country, setCountry] = useState<DialCountry>(initial.country);
  const [national, setNational] = useState(initial.national);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");

  // When profile country changes and user hasn't entered a number yet, follow it.
  useEffect(() => {
    if (national.trim()) return;
    const next = dialCountryForName(profileCountry);
    setCountry((prev) => (prev.dial === next.dial ? prev : next));
  }, [profileCountry, national]);

  // Keep local fields in sync if parent restores a saved phone.
  useEffect(() => {
    const parsed = splitPhone(value, profileCountry);
    const current = buildE164(country.dial, national);
    if (!value) return;
    if (digitsMatch(value, current)) return;
    setCountry(parsed.country);
    setNational(parsed.national);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only rehydrate from external value
  }, [value]);

  useEffect(() => {
    if (!pickerOpen) return;
    const t = window.setTimeout(() => searchRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [pickerOpen]);

  const results = useMemo(() => searchDialCountries(query), [query]);

  function emit(nextCountry: DialCountry, nextNational: string) {
    const e164 = buildE164(nextCountry.dial, nextNational);
    onChange(e164);
  }

  function pickCountry(c: DialCountry) {
    setCountry(c);
    setPickerOpen(false);
    setQuery("");
    emit(c, national);
    window.setTimeout(() => nationalRef.current?.focus(), 50);
  }

  function onNationalChange(raw: string) {
    // Allow spaces while typing; store digits (keep leading 0 visible until blur).
    const cleaned = raw.replace(/[^\d\s]/g, "");
    setNational(cleaned);
    emit(country, cleaned);
  }

  function onNationalBlur() {
    const stripped = stripTrunkZero(national);
    if (stripped !== digitsOnly(national)) {
      setNational(stripped);
      emit(country, stripped);
    }
  }

  return (
    <div className="q-field phone-field">
      {!hideLabel ? (
        <label className="q-label" htmlFor="phone-national">
          {label}
        </label>
      ) : null}

      <div className="phone-row">
        <button
          type="button"
          className="phone-code-btn"
          aria-haspopup="listbox"
          aria-expanded={pickerOpen}
          aria-controls={listId}
          onClick={() => setPickerOpen((o) => !o)}
        >
          <span className="phone-code-iso">{country.iso2}</span>
          <span className="phone-code-dial">+{country.dial}</span>
          <ChevronDown size={16} aria-hidden />
        </button>
        <input
          ref={nationalRef}
          id="phone-national"
          className="q-input phone-national"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          required={required}
          placeholder="61 234 5678"
          value={national}
          onChange={(e) => onNationalChange(e.target.value)}
          onBlur={onNationalBlur}
          autoFocus
        />
      </div>

      <p className="muted small phone-hint">
        Using <strong>{country.name}</strong> (+{country.dial})
        {profileCountry &&
        dialCountryForName(profileCountry).dial === country.dial
          ? " from your profile country"
          : ""}
        . Tap the code to search another country.
      </p>

      {pickerOpen ? (
        <div className="phone-picker" role="dialog" aria-label="Choose country code">
          <div className="phone-picker-head">
            <Search size={16} aria-hidden />
            <input
              ref={searchRef}
              className="phone-picker-search"
              type="search"
              placeholder="Search country or code (e.g. Somalia, 252)…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (results[0]) pickCountry(results[0]);
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setPickerOpen(false);
                  setQuery("");
                }
              }}
              aria-label="Search country"
            />
            <button
              type="button"
              className="btn btn-ghost phone-picker-close"
              aria-label="Close"
              onClick={() => {
                setPickerOpen(false);
                setQuery("");
              }}
            >
              <X size={16} />
            </button>
          </div>
          <ul id={listId} className="phone-picker-list" role="listbox">
            {results.map((c) => {
              const selected = c.iso2 === country.iso2 && c.dial === country.dial;
              return (
                <li key={`${c.iso2}-${c.dial}-${c.name}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={cn("phone-picker-item", selected && "selected")}
                    onClick={() => pickCountry(c)}
                  >
                    <span className="phone-picker-name">{c.name}</span>
                    <span className="phone-picker-meta">
                      {c.iso2} · +{c.dial}
                    </span>
                  </button>
                </li>
              );
            })}
            {results.length === 0 ? (
              <li className="muted small" style={{ padding: "0.75rem" }}>
                No countries match.
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function digitsMatch(a: string, b: string): boolean {
  return digitsOnly(a) === digitsOnly(b);
}
