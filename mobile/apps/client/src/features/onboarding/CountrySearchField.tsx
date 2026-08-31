import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { ALL_COUNTRIES } from "@/lib/countries";
import { searchDialCountries } from "@/lib/country-dial-codes";
import { cn } from "@/utils/cn";

type Props = {
  value?: string | null;
  onChange: (country: string) => void;
  hideLabel?: boolean;
  label?: string;
  required?: boolean;
  /** Prefer market countries at the top when the query is empty. */
  prioritizeMarket?: boolean;
};

export function CountrySearchField({
  value,
  onChange,
  hideLabel,
  label = "Country",
  required,
  prioritizeMarket = true,
}: Props) {
  const listId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => searchRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (prioritizeMarket) {
      return searchDialCountries(query)
        .map((c) => c.name)
        .filter((name) => (ALL_COUNTRIES as readonly string[]).includes(name));
    }
    if (!q) return [...ALL_COUNTRIES];
    return ALL_COUNTRIES.filter((name) => name.toLowerCase().includes(q));
  }, [query, prioritizeMarket]);

  function pick(name: string) {
    onChange(name);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="q-field country-search-field">
      {!hideLabel ? (
        <label className="q-label" htmlFor="country-search-input">
          {label}
        </label>
      ) : null}

      <button
        type="button"
        className={cn("q-input country-search-trigger", value && "has-value")}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{value || "Search country…"}</span>
        <Search size={16} aria-hidden />
      </button>

      {required ? (
        <input
          tabIndex={-1}
          aria-hidden
          required
          value={value ?? ""}
          onChange={() => undefined}
          className="country-search-required"
        />
      ) : null}

      {open ? (
        <div className="phone-picker" role="dialog" aria-label="Search country">
          <div className="phone-picker-head">
            <Search size={16} aria-hidden />
            <input
              ref={searchRef}
              id="country-search-input"
              className="phone-picker-search"
              type="search"
              placeholder="Type to search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (results[0]) pick(results[0]);
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setOpen(false);
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
                setOpen(false);
                setQuery("");
              }}
            >
              <X size={16} />
            </button>
          </div>
          <ul id={listId} className="phone-picker-list" role="listbox">
            {results.map((name) => {
              const selected = name === value;
              return (
                <li key={name}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={cn("phone-picker-item", selected && "selected")}
                    onClick={() => pick(name)}
                  >
                    <span className="phone-picker-name">{name}</span>
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
