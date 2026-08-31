"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Pencil, ChevronRight } from "lucide-react";
import { useCompleteQuestionnaire } from "@/data/questionnaire/hooks";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Profile } from "@/types";
import type { Preferences } from "@/lib/profile-progress";
import {
  getSectionStatus,
  PROFILE_SECTIONS,
} from "@/lib/profile-progress";
import { PHOTO_STEP_INDEX, STEPS } from "@/components/questionnaire/steps";
import { useQuestionnaireI18n } from "@/lib/i18n/questionnaire-i18n";
import { getSafeUserError } from "@/lib/safe-error";

interface QuestionnaireReviewProps {
  profile: Profile;
  preferences: Preferences | null | undefined;
  onEditStep: (stepIndex: number) => void;
  onEditGender?: () => void;
  onComplete: () => void;
  isEditMode?: boolean;
  /** Refetch profile/preferences before completeness checks (API mode). */
  onRefreshState?: () => Promise<{
    profile: Profile | null;
    preferences: Preferences | null;
  }>;
}

/** Map questionnaire step `id` → 0-based index in `STEPS` (Edit must use index, not id). */
function stepIndexById(stepId: number): number {
  const index = STEPS.findIndex((step) => step.id === stepId);
  return index >= 0 ? index : 0;
}

function firstIncompleteStep(
  profile: Profile,
  preferences: Preferences | null | undefined
): number | null {
  for (const section of PROFILE_SECTIONS) {
    if (getSectionStatus(section.id, profile, preferences) !== "complete") {
      return section.stepIndex;
    }
  }
  return null;
}

function ReviewSection({
  title,
  items,
  onEdit,
}: {
  title: string;
  items: { label: string; value: string }[];
  onEdit: () => void;
}) {
  const { reviewLabel, optionLabel, ui } = useQuestionnaireI18n();
  const filled = items.filter((i) => i.value && i.value !== "—");
  if (filled.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-muted/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-xl text-foreground">{reviewLabel(title)}</h3>
        <Button variant="outline" size="sm" onClick={onEdit} className="h-9 text-sm">
          <Pencil className="h-3.5 w-3.5 mr-1" />
          {ui("edit")}
        </Button>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
        {filled.map((item) => (
          <div key={item.label} className="min-w-0">
            <dt className="text-muted-foreground text-sm font-semibold uppercase tracking-wide">{reviewLabel(item.label)}</dt>
            <dd className="font-semibold mt-1 text-foreground break-words text-lg">{optionLabel(item.value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function QuestionnaireReview({
  profile,
  preferences,
  onEditStep,
  onEditGender,
  onComplete,
  isEditMode = false,
  onRefreshState,
}: QuestionnaireReviewProps) {
  const completeQuestionnaire = useCompleteQuestionnaire();
  const [submitting, setSubmitting] = useState(false);
  const { optionLabel, ui } = useQuestionnaireI18n();

  const translateList = (values: string[] | undefined) =>
    values?.length ? values.map((v) => optionLabel(v)).join(", ") : "—";

  const handleSubmit = async () => {
    if (isEditMode) {
      onComplete();
      return;
    }

    let latestProfile = profile;
    let latestPreferences = preferences;

    // API mode can have stale caches; validate against freshly fetched state.
    if (onRefreshState) {
      try {
        const fresh = await onRefreshState();
        if (fresh.profile) latestProfile = fresh.profile;
        latestPreferences = fresh.preferences;
      } catch {
        // Fall through and validate with whatever we have.
      }
    }

    const incompleteStep = firstIncompleteStep(
      latestProfile,
      latestPreferences
    );
    if (incompleteStep !== null) {
      toast.error(ui("answerAllRequired"));
      onEditStep(incompleteStep);
      return;
    }

    setSubmitting(true);
    try {
      await completeQuestionnaire({});
      toast.success(ui("profileComplete"));
      onComplete();
    } catch (error) {
      toast.error(getSafeUserError(error, ui("submitFailed")));
      const step = firstIncompleteStep(latestProfile, latestPreferences);
      if (step !== null) onEditStep(step);
    } finally {
      setSubmitting(false);
    }
  };

  const religiousItems = [
    { label: "Prayer Frequency", value: profile.prayerFrequency || "—" },
    ...(profile.gender === "female"
      ? [{ label: "Wears Hijab", value: profile.wearsHijab !== undefined ? (profile.wearsHijab ? "Yes" : "No") : "—" }]
      : []),
  ];

  const educationItems = [
    { label: "Education", value: profile.education || "—" },
  ];

  const employmentItems = [
    { label: "Occupation", value: profile.occupation || "—" },
    ...(profile.gender === "female"
      ? [
          {
            label: "Work Preference After Marriage",
            value: profile.marriageWorkPreference || "—",
          },
        ]
      : []),
  ];

  const marriageItems = [
    { label: "Marital Status", value: profile.maritalStatus ? optionLabel(profile.maritalStatus) : "—" },
  ];

  const lifestyleItems = [
    {
      label: "Substance Use",
      value:
        profile.smokes === "Yes"
          ? `Yes${profile.substanceDetails ? ` — ${profile.substanceDetails}` : ""}`
          : profile.smokes === "No"
            ? "No"
            : profile.smokes || "—",
    },
  ];

  const aboutItems = [
    { label: "Marriage Timeline", value: profile.marriageTimeline || "—" },
    { label: "Qualities", value: translateList(profile.qualities) },
    { label: "Hobbies", value: translateList(profile.hobbies) },
  ];

  const prefItems = [
    ...(profile.gender === "male"
      ? [{ label: "Partner Hijab / Niqab", value: preferences?.partnerHijabLevel || "—" }]
      : []),
    ...(preferences
      ? [
        { label: "Preferred Age", value: preferences.minAge != null ? String(preferences.minAge) : "—" },
        { label: "Preferred Height", value: preferences.minHeight != null ? `${preferences.minHeight} cm` : "—" },
        { label: "Preferred Weight", value: preferences.minWeight != null ? `${preferences.minWeight} kg` : "—" },
        { label: "Preferred Countries", value: preferences.preferredCountries?.length ? preferences.preferredCountries.join(", ") : ui("anyValue") },
        { label: "Preferred Education", value: preferences.educationLevel || "—" },
      ]
      : []),
  ];

  const basicItems = [
    { label: "Age", value: profile.age ? String(profile.age) : "—" },
    { label: "Country", value: profile.country || "—" },
    { label: "City", value: profile.city || "—" },
    { label: "Height", value: profile.height ? `${profile.height} cm` : "—" },
    { label: "Weight", value: profile.weight ? `${profile.weight} kg` : "—" },
    { label: "Languages", value: translateList(profile.languagesSpoken) },
  ];

  const contactItems = [
    { label: "Full name", value: profile.name || "—" },
    { label: "Phone number", value: profile.phone || "—" },
  ];

  return (
    <>
    <Card className="border-border shadow-lg shadow-primary/5 pb-4">
      <CardHeader className="border-b border-border bg-gradient-to-r from-accent/50 to-transparent dark:from-primary/10">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-2xl sm:text-3xl font-bold">{isEditMode ? ui("editProfileDetails") : ui("finalReview")}</CardTitle>
          {!isEditMode && (
            <Badge variant="outline" className="inline-flex items-center text-primary border-primary/30">
              <Check className="h-3 w-3 mr-1" />
              {ui("reviewBeforeSubmitting")}
            </Badge>
          )}
        </div>
        <CardDescription className="text-base leading-relaxed">
          {isEditMode ? ui("editModeDesc") : ui("reviewDesc")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pb-28">
        <ReviewSection
          title="Gender"
          items={[
            {
              label: "Gender",
              value: profile.gender === "female" ? "Female" : profile.gender === "male" ? "Male" : "—",
            },
          ]}
          onEdit={() => (onEditGender ? onEditGender() : onEditStep(0))}
        />
        <ReviewSection
          title="Basic Information"
          items={basicItems}
          onEdit={() => onEditStep(stepIndexById(1))}
        />
        <ReviewSection
          title="Your Religious Practice"
          items={religiousItems}
          onEdit={() => onEditStep(stepIndexById(2))}
        />
        <ReviewSection
          title="Education"
          items={educationItems}
          onEdit={() => onEditStep(stepIndexById(3))}
        />
        <ReviewSection
          title="Employment"
          items={employmentItems}
          onEdit={() => onEditStep(stepIndexById(4))}
        />
        <ReviewSection
          title="Marriage & Family"
          items={marriageItems}
          onEdit={() => onEditStep(stepIndexById(5))}
        />
        <ReviewSection
          title="Lifestyle"
          items={lifestyleItems}
          onEdit={() => onEditStep(stepIndexById(6))}
        />
        <ReviewSection
          title="About You"
          items={aboutItems}
          onEdit={() => onEditStep(stepIndexById(7))}
        />
        <ReviewSection
          title="Partner Preferences"
          items={prefItems}
          onEdit={() => onEditStep(stepIndexById(8))}
        />
        <ReviewSection
          title="Your contact details"
          items={contactItems}
          onEdit={() => onEditStep(stepIndexById(9))}
        />
        <ReviewSection
          title="Profile Photo"
          items={[
            {
              label: "Photo",
              value: profile.profileImageId || profile.imageUrl ? ui("uploaded") : "—",
            },
          ]}
          onEdit={() => onEditStep(PHOTO_STEP_INDEX)}
        />

      </CardContent>
    </Card>

    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/80 bg-background/95 backdrop-blur-md px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-xl">
        <Button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full h-14 min-h-14 rounded-2xl text-lg font-semibold"
          size="lg"
        >
          {isEditMode
            ? ui("saveChanges")
            : submitting
              ? ui("submitting")
              : ui("submitProfile")}
          <ChevronRight className="ml-2 h-5 w-5" />
        </Button>
      </div>
    </div>
    </>
  );
}
