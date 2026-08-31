"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { filterCountries } from "@/lib/country-search";
import { ALL_COUNTRIES } from "@/lib/countries";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/lib/i18n/context";

interface CountryComboboxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  noResultsLabel?: string;
}

export function CountryCombobox({
  value,
  onChange,
  placeholder,
  emptyLabel,
  noResultsLabel,
}: CountryComboboxProps) {
  const { t } = useTranslation();
  const searchPlaceholder = placeholder ?? t("common.searchCountries");
  const selectLabel = emptyLabel ?? t("common.selectCountry");
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

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        variant="outline"
        className="w-full justify-between h-12 rounded-xl font-normal"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={cn(!value && "text-muted-foreground")}>
          {value || selectLabel}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
      </Button>

      {open && (
        <div className="absolute z-50 mt-2 w-full rounded-xl border border-border bg-card shadow-lg">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="pl-9 h-10"
              />
            </div>
          </div>
          <ul className="max-h-60 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                {noResults}
              </li>
            ) : (
              filtered.map((country) => (
                <li key={country}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-left hover:bg-accent",
                      value === country && "bg-accent"
                    )}
                    onClick={() => {
                      onChange(country);
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    <Check
                      className={cn(
                        "h-4 w-4 text-primary",
                        value === country ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {country}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
