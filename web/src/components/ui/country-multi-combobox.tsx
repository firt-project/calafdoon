"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import { filterCountries } from "@/lib/country-search";
import { ALL_COUNTRIES } from "@/lib/countries";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useTranslation } from "@/lib/i18n/context";

interface CountryMultiComboboxProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  noResultsLabel?: string;
}

export function CountryMultiCombobox({
  value,
  onChange,
  placeholder,
  noResultsLabel,
}: CountryMultiComboboxProps) {
  const { t } = useTranslation();
  const searchPlaceholder = placeholder ?? t("common.searchCountriesMulti");
  const noResults = noResultsLabel ?? t("common.noCountriesFound");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => filterCountries(ALL_COUNTRIES, search), [search]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggle = (country: string) => {
    if (value.includes(country)) {
      onChange(value.filter((c) => c !== country));
    } else {
      onChange([...value, country]);
    }
  };

  return (
    <div ref={containerRef} className="space-y-3">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((country) => (
            <Badge
              key={country}
              variant="secondary"
              className="gap-1 pr-1 rounded-xl"
            >
              {country}
              <button
                type="button"
                onClick={() => toggle(country)}
                className="ml-1 rounded-full p-0.5 hover:bg-muted"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder={searchPlaceholder}
            className="pl-11 h-12"
          />
        </div>

        {open && (
          <div className="absolute z-50 mt-2 w-full rounded-xl border border-border bg-card shadow-lg">
            <ul className="max-h-60 overflow-y-auto p-1">
              {filtered.length === 0 ? (
                <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {noResults}
                </li>
              ) : (
                filtered.map((country) => {
                  const selected = value.includes(country);
                  return (
                    <li key={country}>
                      <div
                        role="option"
                        aria-selected={selected}
                        tabIndex={0}
                        className={cn(
                          "flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-left hover:bg-accent",
                          selected && "bg-accent"
                        )}
                        onClick={() => toggle(country)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggle(country);
                          }
                        }}
                      >
                        <Checkbox
                          checked={selected}
                          tabIndex={-1}
                          className="pointer-events-none"
                          aria-hidden
                        />
                        {country}
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
