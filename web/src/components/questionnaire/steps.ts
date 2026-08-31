import {
  AGE_OPTIONS,
  HEIGHT_OPTIONS,
  WEIGHT_OPTIONS,
  PRAYER_FREQUENCY,
  EDUCATION_LEVELS,
  OCCUPATIONS,
  MARITAL_STATUS,
  YES_NO,
  MARRIAGE_TIMELINE,
  HIJAB_LEVEL_PREFERENCE,
  LANGUAGES_SPOKEN,
  MARRIAGE_WORK_PREFERENCE,
  QUALITIES,
  HOBBIES,
} from "@/lib/constants";

export type QuestionnairePhase = "about" | "partner" | "photo";

export interface StepConfig {
  id: number;
  title: string;
  description: string;
  phase: QuestionnairePhase;
  fields: FieldConfig[];
}

export interface FieldConfig {
  name: string;
  label: string;
  type:
    | "select"
    | "radio"
    | "number"
    | "textarea"
    | "multi-select"
    | "range"
    | "country-search"
    | "country-multi"
    | "gender-select"
    | "text";
  options?: readonly string[] | number[];
  required?: boolean;
  condition?: { field: string; value: string };
  /** Show only when the dependency field matches one of these values. */
  showWhen?: { field: string; values: string[] };
  hideWhen?: { field: string; values: string[] };
  min?: number;
  max?: number;
  maxSelect?: number;
  preferences?: boolean;
  uiOnly?: boolean;
  /** Override i18n key for FIELD_LABELS (defaults to `name`). */
  labelKey?: string;
}

/** Part 1 — about the user. Gender is the first question (also collected at /register/details). */
const GENDER_STEP: StepConfig = {
  id: 0,
  title: "About you",
  description: "Choose man or woman to continue",
  phase: "about",
  fields: [
    {
      name: "gender",
      label: "I am a",
      type: "gender-select",
      required: true,
    },
  ],
};

const ABOUT_YOU_STEPS: StepConfig[] = [
  GENDER_STEP,
  {
    id: 1,
    title: "Basic Information",
    description: "Tell us about yourself",
    phase: "about",
    fields: [
      { name: "age", label: "Age", type: "select", options: AGE_OPTIONS, required: true },
      { name: "country", label: "Country", type: "country-search", required: true },
      { name: "city", label: "City", type: "select", options: [], required: true },
      { name: "height", label: "Height (cm)", type: "select", options: HEIGHT_OPTIONS, required: true },
      { name: "weight", label: "Weight (kg)", type: "select", options: WEIGHT_OPTIONS, required: true },
      {
        name: "languagesSpoken",
        label: "Languages you speak",
        type: "multi-select",
        options: LANGUAGES_SPOKEN,
        required: true,
      },
    ],
  },
  {
    id: 2,
    title: "Your Religious Practice",
    description: "Your own religious habits",
    phase: "about",
    fields: [
      {
        name: "prayerFrequency",
        label: "Do you perform the five daily prayers?",
        type: "radio",
        options: PRAYER_FREQUENCY,
        required: true,
      },
      {
        name: "wearsHijab",
        label: "Do you wear hijab?",
        type: "radio",
        options: YES_NO,
        condition: { field: "gender", value: "female" },
        required: true,
      },
    ],
  },
  {
    id: 3,
    title: "Education",
    description: "Your educational background",
    phase: "about",
    fields: [
      { name: "education", label: "Education Level", type: "radio", options: EDUCATION_LEVELS, required: true },
    ],
  },
  {
    id: 4,
    title: "Employment",
    description: "Your work situation",
    phase: "about",
    fields: [
      { name: "occupation", label: "Employment Status", type: "radio", options: OCCUPATIONS, required: true },
      {
        name: "marriageWorkPreference",
        label: "After marriage, what is your preference?",
        type: "radio",
        options: MARRIAGE_WORK_PREFERENCE,
        condition: { field: "gender", value: "female" },
        required: true,
      },
    ],
  },
  {
    id: 5,
    title: "Marriage & Family",
    description: "Your marriage history and family",
    phase: "about",
    fields: [
      {
        name: "maritalStatus",
        label: "What is your marital status?",
        type: "radio",
        options: MARITAL_STATUS,
        required: true,
      },
    ],
  },
  {
    id: 6,
    title: "Lifestyle",
    description: "Your daily habits",
    phase: "about",
    fields: [
      {
        name: "substanceUse",
        label: "Do you use any substances (smoking, drugs, etc.)?",
        type: "radio",
        options: YES_NO,
        required: true,
      },
      {
        name: "substanceDetails",
        label: "Please describe what you use",
        type: "textarea",
        required: true,
        condition: { field: "substanceUse", value: "Yes" },
      },
    ],
  },
  {
    id: 7,
    title: "About You",
    description: "Your plans, personality, and interests",
    phase: "about",
    fields: [
      { name: "marriageTimeline", label: "Marriage Timeline", type: "radio", options: MARRIAGE_TIMELINE, required: true },
      { name: "qualities", label: "Choose up to 10 qualities that describe you", type: "multi-select", options: QUALITIES, maxSelect: 10, required: true },
      { name: "hobbies", label: "Choose your hobbies", type: "multi-select", options: HOBBIES, required: true },
    ],
  },
];

/** Part 2 — what the user wants in a partner (after about-you is done). */
const PARTNER_PREFERENCES_STEPS: StepConfig[] = [
  {
    id: 8,
    title: "Partner Preferences",
    description: "What you are looking for in a spouse",
    phase: "partner",
    fields: [
      {
        name: "pref_partnerHijabLevel",
        label: "Hijab / niqab preference for your spouse",
        type: "radio",
        options: HIJAB_LEVEL_PREFERENCE,
        preferences: true,
        condition: { field: "gender", value: "male" },
        required: true,
      },
      {
        name: "pref_minAge",
        label: "Preferred Age",
        type: "select",
        options: AGE_OPTIONS,
        preferences: true,
        required: true,
      },
      {
        name: "pref_minHeight",
        label: "Preferred Height",
        type: "select",
        options: HEIGHT_OPTIONS,
        preferences: true,
        required: true,
      },
      {
        name: "pref_minWeight",
        label: "Preferred Weight (kg)",
        type: "select",
        options: WEIGHT_OPTIONS,
        preferences: true,
        required: true,
      },
      { name: "pref_preferredCountries", label: "Preferred Countries", type: "country-multi", preferences: true, required: false },
      { name: "pref_educationLevel", label: "Preferred Education", type: "radio", options: EDUCATION_LEVELS, preferences: true, required: true },
    ],
  },
];

const CONTACT_STEP: StepConfig = {
  id: 9,
  title: "Your contact details",
  description: "Your name and phone number",
  phase: "about",
  fields: [
    { name: "name", label: "Full name", type: "text", required: true },
    { name: "phone", label: "Phone number", type: "text", required: true },
  ],
};

const PROFILE_PHOTO_STEP: StepConfig = {
  id: 10,
  title: "Profile Photo",
  description: "Optional — a clear photo helps matches recognize you",
  phase: "photo",
  fields: [],
};

export const STEPS: StepConfig[] = [
  ...ABOUT_YOU_STEPS,
  ...PARTNER_PREFERENCES_STEPS,
  CONTACT_STEP,
  PROFILE_PHOTO_STEP,
];

export const ABOUT_YOU_STEP_COUNT = ABOUT_YOU_STEPS.length;
export const PARTNER_PREFERENCES_STEP_INDEX = ABOUT_YOU_STEP_COUNT;
export const CONTACT_STEP_INDEX = PARTNER_PREFERENCES_STEP_INDEX + 1;
export const PHOTO_STEP_INDEX = STEPS.length - 1;
