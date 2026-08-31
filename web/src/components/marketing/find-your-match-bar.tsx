"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useUnifiedAuth } from "@/data/auth/hooks";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "@/lib/i18n/context";

const AGE_RANGES = ["18 - 25", "18 - 35", "18 - 45", "25 - 35", "25 - 45", "35 - 50"] as const;

const LOCATIONS = [
  "Mogadishu",
  "Hargeisa",
  "Nairobi",
  "London",
  "Minneapolis",
  "Toronto",
  "Dubai",
  "Cairo",
] as const;

/**
 * Decorative marketing search bar — does not query matches.
 * Search always sends visitors to register (or matches if already signed in).
 */
export function FindYourMatchBar() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isAuthenticated } = useUnifiedAuth();
  const [iam, setIam] = useState("");
  const [lookingFor, setLookingFor] = useState("");
  const [age, setAge] = useState("18 - 45");
  const [location, setLocation] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(isAuthenticated ? "/matches" : "/register");
  };

  return (
    <section className="relative z-20 -mt-10 px-4 sm:px-6 lg:px-8">
      <form
        onSubmit={handleSearch}
        className="mx-auto max-w-7xl rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xl"
      >
        <h2 className="mb-4 text-lg font-bold tracking-tight sm:text-xl">
          {t("landing.findMatchTitle")}
        </h2>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:items-end">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t("landing.findMatchIam")}
            </label>
            <Select value={iam || undefined} onValueChange={setIam}>
              <SelectTrigger className="h-11 w-full rounded-xl">
                <SelectValue placeholder={t("landing.findMatchSelect")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">{t("landing.findMatchMan")}</SelectItem>
                <SelectItem value="female">{t("landing.findMatchWoman")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t("landing.findMatchLookingFor")}
            </label>
            <Select value={lookingFor || undefined} onValueChange={setLookingFor}>
              <SelectTrigger className="h-11 w-full rounded-xl">
                <SelectValue placeholder={t("landing.findMatchSelect")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="female">{t("landing.findMatchWoman")}</SelectItem>
                <SelectItem value="male">{t("landing.findMatchMan")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t("landing.findMatchAge")}
            </label>
            <Select value={age} onValueChange={setAge}>
              <SelectTrigger className="h-11 w-full rounded-xl">
                <SelectValue placeholder={t("landing.findMatchSelect")} />
              </SelectTrigger>
              <SelectContent>
                {AGE_RANGES.map((range) => (
                  <SelectItem key={range} value={range}>
                    {range}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t("landing.findMatchLocation")}
            </label>
            <Select value={location || undefined} onValueChange={setLocation}>
              <SelectTrigger className="h-11 w-full rounded-xl">
                <SelectValue placeholder={t("landing.findMatchSelectCity")} />
              </SelectTrigger>
              <SelectContent>
                {LOCATIONS.map((city) => (
                  <SelectItem key={city} value={city}>
                    {city}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button type="submit" size="lg" className="h-11 w-full rounded-xl lg:w-auto lg:px-8">
            <Search className="mr-2 h-4 w-4" />
            {t("landing.findMatchSearch")}
          </Button>
        </div>
      </form>
    </section>
  );
}
