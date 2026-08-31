"use client";

import {
  EDUCATION_LEVELS,
  RELIGIOUS_LEVELS,
  OCCUPATIONS,
  MARITAL_STATUS,
  MARRIAGE_TIMELINE,
} from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CountryCombobox } from "@/components/ui/country-combobox";
import { useTranslation } from "@/lib/i18n/context";

interface MatchFiltersProps {
  filters: Record<string, string>;
  onChange: (filters: Record<string, string>) => void;
}

export function MatchFilters({ filters, onChange }: MatchFiltersProps) {
  const { t } = useTranslation();

  const update = (key: string, value: string) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label>{t("matchesPage.country")}</Label>
            <CountryCombobox
              value={filters.country ?? ""}
              onChange={(v) => update("country", v)}
            />
            {filters.country && (
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => update("country", "")}
              >
                {t("matchesPage.clearCountry")}
              </button>
            )}
          </div>
          <div className="space-y-2">
            <Label>{t("matchesPage.city")}</Label>
            <Input
              value={filters.city ?? ""}
              onChange={(e) => update("city", e.target.value)}
              placeholder={t("matchesPage.cityPlaceholder")}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("matchesPage.minAge")}</Label>
            <Select value={filters.minAge ?? ""} onValueChange={(v) => update("minAge", v)}>
              <SelectTrigger><SelectValue placeholder={t("matchesPage.any")} /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 43 }, (_, i) => (
                  <SelectItem key={i} value={String(18 + i)}>{18 + i}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("matchesPage.maxAge")}</Label>
            <Select value={filters.maxAge ?? ""} onValueChange={(v) => update("maxAge", v)}>
              <SelectTrigger><SelectValue placeholder={t("matchesPage.any")} /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 43 }, (_, i) => (
                  <SelectItem key={i} value={String(18 + i)}>{18 + i}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("matchesPage.religion")}</Label>
            <Select value={filters.religiousLevel ?? ""} onValueChange={(v) => update("religiousLevel", v)}>
              <SelectTrigger><SelectValue placeholder={t("matchesPage.any")} /></SelectTrigger>
              <SelectContent>
                {RELIGIOUS_LEVELS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("matchesPage.maritalStatus")}</Label>
            <Select value={filters.maritalStatus ?? ""} onValueChange={(v) => update("maritalStatus", v)}>
              <SelectTrigger><SelectValue placeholder={t("matchesPage.any")} /></SelectTrigger>
              <SelectContent>
                {MARITAL_STATUS.map((status) => (
                  <SelectItem key={status} value={status}>{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("matchesPage.marriageTimeline")}</Label>
            <Select value={filters.marriageTimeline ?? ""} onValueChange={(v) => update("marriageTimeline", v)}>
              <SelectTrigger><SelectValue placeholder={t("matchesPage.any")} /></SelectTrigger>
              <SelectContent>
                {MARRIAGE_TIMELINE.map((timeline) => (
                  <SelectItem key={timeline} value={timeline}>{timeline}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("matchesPage.education")}</Label>
            <Select value={filters.education ?? ""} onValueChange={(v) => update("education", v)}>
              <SelectTrigger><SelectValue placeholder={t("matchesPage.any")} /></SelectTrigger>
              <SelectContent>
                {EDUCATION_LEVELS.map((e) => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("matchesPage.occupation")}</Label>
            <Select value={filters.occupation ?? ""} onValueChange={(v) => update("occupation", v)}>
              <SelectTrigger><SelectValue placeholder={t("matchesPage.any")} /></SelectTrigger>
              <SelectContent>
                {OCCUPATIONS.map((o) => (
                  <SelectItem key={o} value={o}>{o}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
