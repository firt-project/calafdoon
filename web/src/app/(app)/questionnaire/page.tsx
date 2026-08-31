"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Check } from "lucide-react";
import type { Profile } from "@/types";
import type { Preferences } from "@/lib/profile-progress";
import { useProfile, usePreferences, useEnsureProfile } from "@/data/profile/hooks";
import {
  useUpdateQuestionnaire,
  useAutoSaveQuestionnaire,
  useSaveProfileEdits,
} from "@/data/questionnaire/hooks";
import {
  calculateProfileProgress,
  getResumeStepIndex,
} from "@/lib/profile-progress";
import {
  countFormQuestions,
  getGlobalQuestionNumber,
  getResumeFieldIndex,
  getVisibleFields,
  initFormState,
} from "@/lib/questionnaire-form";
import { isValidContactName, isValidContactPhone } from "@/lib/phone";
import { Button } from "@/components/ui/button";
import { QuestionnaireStep } from "@/components/questionnaire/questionnaire-step";
import { QuestionnaireReview } from "@/components/questionnaire/questionnaire-review";
import { QuestionnairePhaseComplete } from "@/components/questionnaire/questionnaire-phase-complete";
import { QuestionnairePhotoStep } from "@/components/questionnaire/questionnaire-photo-step";
import { QuestionnaireShell } from "@/components/questionnaire/questionnaire-shell";
import { STEPS, ABOUT_YOU_STEP_COUNT, CONTACT_STEP_INDEX, PARTNER_PREFERENCES_STEP_INDEX } from "@/components/questionnaire/steps";
import { hasPaidAccess, isStaffRole } from "@/lib/access";
import { getAuthenticatedHomeRoute } from "@/lib/routes";
import { useTranslation } from "@/lib/i18n/context";
import { useQuestionnaireI18n } from "@/lib/i18n/questionnaire-i18n";
import { Skeleton } from "@/components/ui/skeleton";

const REVIEW_STEP_INDEX = STEPS.length;

export default function QuestionnairePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEditMode = searchParams.get("edit") === "1";
  const { profile, refresh: refreshProfile } = useProfile() as {
    profile: Profile | null | undefined;
    refresh: () => Promise<Profile | null | undefined>;
  };
  const isStaff = isStaffRole(profile?.role);
  const {
    preferences,
    refresh: refreshPreferences,
  } = usePreferences() as {
    preferences: Preferences | null | undefined;
    refresh: () => Promise<Preferences | null | undefined>;
  };
  const updateQuestionnaire = useUpdateQuestionnaire();
  const autoSaveProfile = useAutoSaveQuestionnaire();
  const saveProfileEdits = useSaveProfileEdits();
  const ensureProfile = useEnsureProfile();
  const { ui } = useQuestionnaireI18n();
  const { t } = useTranslation();
  const welcome = searchParams.get("welcome") === "true";

  const refreshQuestionnaireState = async () => {
    const [nextProfile, nextPreferences] = await Promise.all([
      refreshProfile(),
      refreshPreferences(),
    ]);
    return {
      profile: nextProfile ?? null,
      preferences: nextPreferences ?? null,
    };
  };

  const [stepOverride, setStepOverride] = useState<number | null>(
    isEditMode ? REVIEW_STEP_INDEX : null
  );
  const [phaseComplete, setPhaseComplete] = useState<"about" | "partner" | null>(null);
  const [fieldIndex, setFieldIndex] = useState(0);
  const [fieldIndexInitializedForStep, setFieldIndexInitializedForStep] = useState<
    number | null
  >(null);
  const skipFieldResumeRef = useRef(false);
  const ensureProfileAttemptedRef = useRef(false);

  useEffect(() => {
    if (profile !== null || ensureProfileAttemptedRef.current) return;
    ensureProfileAttemptedRef.current = true;
    void ensureProfile().catch(() => {
      ensureProfileAttemptedRef.current = false;
    });
  }, [profile, ensureProfile]);

  const currentStep = useMemo(() => {
    if (stepOverride !== null) return stepOverride;
    if (!profile) return null;
    if (isEditMode) return REVIEW_STEP_INDEX;
    if (profile.questionnaireComplete) return null;
    const resume = getResumeStepIndex(profile, preferences ?? null);
    return resume >= REVIEW_STEP_INDEX ? REVIEW_STEP_INDEX : resume;
  }, [stepOverride, profile, preferences, isEditMode]);
  const isReviewStep = currentStep === REVIEW_STEP_INDEX;

  const formStateForNav = useMemo(
    () => initFormState(profile ?? null, preferences),
    [profile, preferences]
  );

  const globalQuestionTotal = useMemo(
    () => countFormQuestions(STEPS, profile ?? null, formStateForNav),
    [profile, formStateForNav]
  );

  const globalQuestionCurrent =
    currentStep !== null && !isReviewStep && currentStep < STEPS.length
      ? getGlobalQuestionNumber(
          STEPS,
          currentStep,
          fieldIndex,
          profile ?? null,
          formStateForNav
        )
      : 0;

  useEffect(() => {
    if (currentStep === null || isReviewStep || phaseComplete) return;
    if (fieldIndexInitializedForStep === currentStep) return;

    const stepConfig = STEPS[currentStep];
    if (!stepConfig || stepConfig.phase === "photo") {
      setFieldIndexInitializedForStep(currentStep);
      return;
    }

    if (skipFieldResumeRef.current) {
      skipFieldResumeRef.current = false;
      setFieldIndexInitializedForStep(currentStep);
      return;
    }

    setFieldIndex(
      getResumeFieldIndex(stepConfig, profile ?? null, formStateForNav)
    );
    setFieldIndexInitializedForStep(currentStep);
  }, [
    currentStep,
    isReviewStep,
    phaseComplete,
    fieldIndexInitializedForStep,
    profile,
    formStateForNav,
  ]);

  const totalSteps = STEPS.length + 1;
  const sectionProgress = profile
    ? calculateProfileProgress(profile, preferences ?? undefined)
    : 0;
  const stepProgress =
    currentStep !== null ? ((currentStep + 1) / totalSteps) * 100 : 0;
  const progress = isReviewStep
    ? 100
    : Math.max(sectionProgress, Math.round(stepProgress));

  const handleAutoSave = async (data: Record<string, unknown>) => {
    if (currentStep === null || isReviewStep) return;
    if (isEditMode) {
      await saveProfileEdits({ data });
      await refreshQuestionnaireState();
      return;
    }
    await autoSaveProfile({
      step: currentStep + 1,
      data,
    });
    await refreshQuestionnaireState();
  };

  const handleNext = async (stepData: Record<string, unknown>) => {
    if (currentStep === null) return;

    if (currentStep === CONTACT_STEP_INDEX) {
      const name = typeof stepData.name === "string" ? stepData.name : "";
      const phone = typeof stepData.phone === "string" ? stepData.phone : "";
      if (!isValidContactName(name) || !isValidContactPhone(phone)) {
        toast.error(ui("answerAllRequired"));
        return;
      }
    }

    try {
      if (!isReviewStep) {
        if (isEditMode) {
          await saveProfileEdits({ data: stepData });
          await refreshQuestionnaireState();
          toast.success(ui("changesSaved"));
          setStepOverride(REVIEW_STEP_INDEX);
          return;
        }
        await updateQuestionnaire({
          step: currentStep + 1,
          data: stepData,
        });
        await refreshQuestionnaireState();
      }

      if (currentStep < REVIEW_STEP_INDEX) {
        if (!isEditMode && currentStep === ABOUT_YOU_STEP_COUNT - 1) {
          setPhaseComplete("about");
          return;
        }
        if (!isEditMode && currentStep === PARTNER_PREFERENCES_STEP_INDEX) {
          setPhaseComplete("partner");
          return;
        }
        setPhaseComplete(null);
        skipFieldResumeRef.current = true;
        setFieldIndex(0);
        setFieldIndexInitializedForStep(null);
        setStepOverride(currentStep + 1);
      }
    } catch {
      toast.error(ui("saveFailedToast"));
    }
  };

  const handleBack = () => {
    setPhaseComplete(null);
    if (currentStep === null || isReviewStep || phaseComplete) return;

    const stepConfig = STEPS[currentStep];
    if (stepConfig?.phase === "photo") {
      if (currentStep > 0) {
        const prevStep = currentStep - 1;
        skipFieldResumeRef.current = true;
        setFieldIndex(
          getResumeFieldIndex(STEPS[prevStep], profile ?? null, formStateForNav)
        );
        setFieldIndexInitializedForStep(null);
        setStepOverride(prevStep);
      }
      return;
    }

    if (fieldIndex > 0) {
      setFieldIndex(fieldIndex - 1);
      return;
    }

    if (currentStep > 0) {
      const prevStep = currentStep - 1;
      const prevConfig = STEPS[prevStep];
      if (prevConfig.phase === "photo") {
        skipFieldResumeRef.current = true;
        setFieldIndex(0);
        setFieldIndexInitializedForStep(null);
        setStepOverride(prevStep);
        return;
      }
      const prevFields = getVisibleFields(
        prevConfig,
        profile ?? null,
        formStateForNav.radios,
        formStateForNav.selects
      );
      skipFieldResumeRef.current = true;
      setFieldIndex(Math.max(0, prevFields.length - 1));
      setFieldIndexInitializedForStep(null);
      setStepOverride(prevStep);
    }
  };

  const canGoBack =
    !phaseComplete &&
    !isReviewStep &&
    currentStep !== null &&
    (fieldIndex > 0 || currentStep > 0);

  const handleEditGender = () => {
    if (profile?.hasPaid || profile?.genderLocked) {
      toast.error(
        "Gender cannot be changed after payment. Contact support if this was a mistake."
      );
      return;
    }
    router.push("/register/details?editGender=1");
  };

  const handleEditStep = (stepIndex: number) => {
    setPhaseComplete(null);
    const stepConfig = STEPS[stepIndex];
    const resumeField =
      stepConfig && stepConfig.phase !== "photo"
        ? getResumeFieldIndex(stepConfig, profile ?? null, formStateForNav)
        : 0;
    skipFieldResumeRef.current = true;
    setFieldIndex(resumeField);
    setFieldIndexInitializedForStep(null);
    setStepOverride(stepIndex);
  };

  const handlePhaseContinue = () => {
    if (phaseComplete === "about") {
      setPhaseComplete(null);
      skipFieldResumeRef.current = true;
      setFieldIndex(0);
      setFieldIndexInitializedForStep(null);
      setStepOverride(PARTNER_PREFERENCES_STEP_INDEX);
      return;
    }
    if (phaseComplete === "partner") {
      setPhaseComplete(null);
      skipFieldResumeRef.current = true;
      setFieldIndex(0);
      setFieldIndexInitializedForStep(null);
      setStepOverride(CONTACT_STEP_INDEX);
    }
  };

  const handlePhotoContinue = async () => {
    try {
      if (!isEditMode) {
        await updateQuestionnaire({ step: STEPS.length, data: {} });
      }
      setStepOverride(REVIEW_STEP_INDEX);
    } catch {
      toast.error(ui("saveFailedToast"));
    }
  };

  const handleComplete = () => {
    if (isEditMode) {
      router.push("/profile");
      return;
    }
    router.push(getAuthenticatedHomeRoute(profile));
  };

  useEffect(() => {
    if (isStaff) {
      router.replace("/admin");
    }
  }, [isStaff, router]);

  // Members who already finished the questionnaire and paid should never see
  // the static "Profile submitted" screen (it confused people at login) —
  // send them straight to their home feed.
  const completedAndPaid =
    !!profile?.questionnaireComplete && !isEditMode && hasPaidAccess(profile);
  useEffect(() => {
    if (completedAndPaid && !isStaff) {
      router.replace("/dashboard");
    }
  }, [completedAndPaid, isStaff, router]);

  const phaseLabel = useMemo(() => {
    if (phaseComplete === "about") return ui("part1Complete");
    if (phaseComplete === "partner") return ui("part2Complete");
    if (isReviewStep) return ui("badgeReview");
    if (!currentStep && currentStep !== 0) return ui("badgeQuestionnaire");
    const stepConfig = STEPS[currentStep!];
    if (!stepConfig) return ui("badgeQuestionnaire");
    if (stepConfig.phase === "photo") return ui("badgePhoto");
    if (stepConfig.phase === "partner") return ui("badgePart2");
    return `${ui("part1AboutPrefix")} · ${ui("stepWord")} ${currentStep! + 1}/${ABOUT_YOU_STEP_COUNT}`;
  }, [currentStep, isReviewStep, phaseComplete, ui]);

  if (profile === undefined || isStaff) {
    return (
      <QuestionnaireShell progress={0} phaseLabel={ui("badgeQuestionnaire")}>
        <div className="space-y-4" role="status" aria-live="polite">
          <Skeleton className="h-10 w-full mb-6" aria-hidden />
          <Skeleton className="h-64 w-full rounded-2xl" aria-hidden />
          <p className="text-center text-sm text-muted-foreground">
            {t("common.loadingData")}
          </p>
        </div>
      </QuestionnaireShell>
    );
  }

  if (!profile) {
    return (
      <QuestionnaireShell progress={0} phaseLabel={ui("badgeQuestionnaire")}>
        <div className="text-center py-16">
          <p className="text-muted-foreground">{ui("profileNotFound")}</p>
          <Button className="mt-4" onClick={() => router.push("/dashboard")}>
            {ui("goToDashboard")}
          </Button>
        </div>
      </QuestionnaireShell>
    );
  }

  if (profile.questionnaireComplete && !isEditMode) {
    const paid = hasPaidAccess(profile);

    // Paid members are redirected to /dashboard (effect above) — show a
    // short loading state instead of the confusing static screen.
    if (paid) {
      return (
        <QuestionnaireShell progress={100} phaseLabel={ui("profileCompleteTitle")}>
          <div className="space-y-4 py-12" role="status" aria-busy>
            <Skeleton className="h-10 w-full" aria-hidden />
            <Skeleton className="h-48 w-full rounded-2xl" aria-hidden />
          </div>
        </QuestionnaireShell>
      );
    }

    return (
      <QuestionnaireShell progress={100} phaseLabel={ui("profileCompleteTitle")}>
        <div className="text-center py-12 sm:py-16">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary mx-auto mb-5">
            <Check className="h-8 w-8" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-3">
            {ui("profileCompleteTitle")}
          </h1>
          <p className="text-muted-foreground mb-8 max-w-sm mx-auto leading-relaxed">
            {ui("profileReadyPaySub")}
          </p>
          <div className="flex flex-col gap-3 max-w-xs mx-auto">
            <Button className="h-12 rounded-2xl" asChild>
              <a href="/payment">{t("dashboard.choosePlan")}</a>
            </Button>
            <Button variant="outline" className="h-12 rounded-2xl" asChild>
              <a href="/profile">{ui("myProfile")}</a>
            </Button>
          </div>
        </div>
      </QuestionnaireShell>
    );
  }

  if (currentStep === null) {
    return (
      <QuestionnaireShell progress={0} phaseLabel={ui("badgeQuestionnaire")}>
        <Skeleton className="h-10 w-full mb-6" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </QuestionnaireShell>
    );
  }

  const currentStepConfig = !isReviewStep ? STEPS[currentStep] : null;
  const isPhotoPhase = currentStepConfig?.phase === "photo";
  const showWelcome =
    welcome &&
    currentStep !== null &&
    currentStep <= 1 &&
    !isReviewStep &&
    !phaseComplete &&
    !isEditMode;
  const progressHint =
    !isReviewStep && progress < 100
      ? ui("profileCompleteFooter").replace("{p}", String(progress))
      : undefined;

  const displayStep = isReviewStep ? totalSteps : (currentStep ?? 0) + 1;
  const stepLabel = ui("progressStepOf")
    .replace("{step}", String(displayStep))
    .replace("{total}", String(totalSteps));

  const remainingSteps = Math.max(0, totalSteps - displayStep);
  const estimatedMinutes = Math.max(1, Math.ceil(remainingSteps * 1.1));
  const timeLabel =
    !isReviewStep && remainingSteps > 0
      ? remainingSteps <= 1
        ? ui("progressAlmostDone")
        : ui("progressMinutesLeft").replace("{m}", String(estimatedMinutes))
      : undefined;

  return (
    <QuestionnaireShell
      progress={progress}
      phaseLabel={phaseLabel}
      stepLabel={stepLabel}
      timeLabel={timeLabel}
      progressHint={progressHint}
      onBack={canGoBack ? handleBack : undefined}
    >
      {showWelcome && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 rounded-2xl border border-primary/15 bg-primary/[0.04] px-5 py-4"
        >
          <p className="text-sm font-semibold text-primary">
            {ui("welcomeQuestionnaireTitle")}
          </p>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            {ui("welcomeQuestionnaireSub")}
          </p>
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={phaseComplete ?? currentStep}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {phaseComplete ? (
            <QuestionnairePhaseComplete
              phase={phaseComplete}
              onContinue={handlePhaseContinue}
            />
          ) : isReviewStep ? (
            <QuestionnaireReview
              profile={profile}
              preferences={preferences}
              onEditStep={handleEditStep}
              onEditGender={handleEditGender}
              onComplete={handleComplete}
              isEditMode={isEditMode}
              onRefreshState={refreshQuestionnaireState}
            />
          ) : isPhotoPhase ? (
            <QuestionnairePhotoStep
              profile={profile}
              onSubmit={() => void handlePhotoContinue()}
            />
          ) : (
            <QuestionnaireStep
              key={`step-${currentStep}-${profile._id}`}
              step={STEPS[currentStep]}
              profile={profile}
              preferences={preferences}
              onSubmit={handleNext}
              onAutoSave={handleAutoSave}
              fieldIndex={fieldIndex}
              onFieldIndexChange={setFieldIndex}
              globalQuestionCurrent={globalQuestionCurrent}
              globalQuestionTotal={globalQuestionTotal}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </QuestionnaireShell>
  );
}
