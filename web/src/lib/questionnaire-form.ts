import type { FieldConfig, StepConfig } from "@/components/questionnaire/steps";
import { isValidContactName, isValidContactPhone } from "@/lib/phone";
import type { Profile } from "@/types";
import type { Preferences } from "@/lib/profile-progress";

function formatHeightWeight(value: number, plus: string): string {
  if (value >= parseInt(plus)) return plus;
  return String(value);
}

function legacySubstanceUse(smokes?: string): string | undefined {
  if (!smokes) return undefined;
  if (smokes === "Never") return "No";
  if (smokes === "Sometimes" || smokes === "Yes") return "Yes";
  if (smokes === "No") return "No";
  return smokes;
}

export function isContactFieldsComplete(
  profile: { name?: string; phone?: string } | null | undefined,
  textFields: Record<string, string>
): boolean {
  const name = textFields.name?.trim() ?? "";
  const phone = textFields.phone?.trim() ?? "";
  return isValidContactName(name) && isValidContactPhone(phone);
}

export function initFormState(
  profile: Profile | null | undefined,
  preferences: Preferences | null | undefined
) {
  if (!profile) {
    return {
      selects: {},
      radios: {},
      multiSelects: {},
      textFields: {},
      bio: "",
      selectedCountry: "",
    };
  }

  const selects: Record<string, string> = {};
  const radios: Record<string, string> = {};
  const multiSelects: Record<string, string[]> = {};
  const textFields: Record<string, string> = {};

  if (profile.age > 0) selects.age = String(profile.age);
  if (profile.country) selects.country = profile.country;
  if (profile.city) selects.city = profile.city;
  if (profile.height > 0) selects.height = formatHeightWeight(profile.height, "200+");
  if (profile.weight > 0) selects.weight = formatHeightWeight(profile.weight, "100+");

  if (profile.religiousLevel) radios.religiousLevel = profile.religiousLevel;
  if (profile.prayerFrequency) radios.prayerFrequency = profile.prayerFrequency;
  if (profile.spousePrayerImportance) radios.spousePrayerImportance = profile.spousePrayerImportance;
  // Do not treat the signup placeholder gender as an answered choice.
  if (profile.gender && profile.registrationComplete === true) {
    radios.gender = profile.gender;
  }
  if (profile.wearsHijab !== undefined) radios.wearsHijab = profile.wearsHijab ? "Yes" : "No";
  if (profile.hasBeard !== undefined) radios.hasBeard = profile.hasBeard ? "Yes" : "No";

  if (profile.education) radios.education = profile.education;
  if (profile.occupation) radios.occupation = profile.occupation;

  if (profile.maritalStatus) radios.maritalStatus = profile.maritalStatus;

  const substanceUse = legacySubstanceUse(profile.smokes);
  if (substanceUse) radios.substanceUse = substanceUse;
  if (profile.substanceDetails) textFields.substanceDetails = profile.substanceDetails;
  if (profile.livingSituation) radios.livingSituation = profile.livingSituation;
  if (profile.polygynyOpenness) radios.polygynyOpenness = profile.polygynyOpenness;
  if (profile.acceptManWithWife) radios.acceptManWithWife = profile.acceptManWithWife;
  if (profile.citizenshipStatus) radios.citizenshipStatus = profile.citizenshipStatus;
  if (profile.marriageWorkPreference) radios.marriageWorkPreference = profile.marriageWorkPreference;

  if (profile.marriageTimeline) radios.marriageTimeline = profile.marriageTimeline;

  if (preferences) {
    if (preferences.minAge) selects.pref_minAge = String(preferences.minAge);
    if (preferences.minHeight) {
      selects.pref_minHeight = formatHeightWeight(preferences.minHeight, "200+");
    }
    if (preferences.minWeight) {
      selects.pref_minWeight = formatHeightWeight(preferences.minWeight, "100+");
    }
    if (preferences.educationLevel) radios.pref_educationLevel = preferences.educationLevel;
    if (preferences.acceptDivorcee) radios.pref_acceptDivorcee = preferences.acceptDivorcee;
    if (preferences.acceptWidow) radios.pref_acceptWidow = preferences.acceptWidow;
    if (preferences.partnerBeard) radios.pref_partnerBeard = preferences.partnerBeard;
    if (preferences.partnerHijabLevel) radios.pref_partnerHijabLevel = preferences.partnerHijabLevel;
    if (preferences.preferredCountries?.length) {
      multiSelects.pref_preferredCountries = preferences.preferredCountries;
    }
  }

  multiSelects.qualities = profile.qualities ?? [];
  multiSelects.hobbies = profile.hobbies ?? [];
  multiSelects.languagesSpoken = profile.languagesSpoken ?? [];

  if (profile.name && profile.name !== "User") {
    textFields.name = profile.name;
  }
  if (profile.phone) {
    textFields.phone = profile.phone;
  }

  return {
    selects,
    radios,
    multiSelects,
    textFields,
    bio: profile.bio ?? "",
    selectedCountry: profile.country ?? "",
  };
}

export function getFieldValue(
  fieldName: string,
  profile: { gender?: string; maritalStatus?: string; children?: number; country?: string } | null | undefined,
  radios: Record<string, string>,
  selects?: Record<string, string>
): string | undefined {
  if (fieldName === "gender") return profile?.gender;
  if (radios[fieldName]) return radios[fieldName];
  if (selects?.[fieldName]) return selects[fieldName];
  if (fieldName === "maritalStatus") return profile?.maritalStatus;
  if (fieldName === "country") return selects?.country ?? profile?.country;
  return undefined;
}

export function isFieldVisible(
  field: FieldConfig,
  profile: { gender?: string; maritalStatus?: string; children?: number; country?: string } | null | undefined,
  radios: Record<string, string>,
  selects?: Record<string, string>
): boolean {
  if (field.condition) {
    const condValue = getFieldValue(field.condition.field, profile, radios, selects);
    if (condValue !== field.condition.value) return false;
  }
  if (field.showWhen) {
    const value = getFieldValue(field.showWhen.field, profile, radios, selects);
    if (!value || !field.showWhen.values.includes(value)) return false;
  }
  if (field.hideWhen) {
    const value = getFieldValue(field.hideWhen.field, profile, radios, selects);
    if (value && field.hideWhen.values.includes(value)) return false;
  }
  return true;
}

const PREFERRED_AGE_UPPER = 60;
const PREFERRED_HEIGHT_UPPER = 210;
const PREFERRED_WEIGHT_UPPER = 150;

export function getFieldOptions(
  field: FieldConfig,
  _profile: { gender?: string; maritalStatus?: string; children?: number; country?: string } | null | undefined,
  _radios: Record<string, string>
): string[] {
  return (field.options ?? []).map(String);
}

export function buildStepData(
  step: StepConfig,
  profile: { gender?: string; maritalStatus?: string; children?: number; country?: string } | null | undefined,
  state: {
    radios: Record<string, string>;
    selects: Record<string, string>;
    multiSelects: Record<string, string[]>;
    textFields: Record<string, string>;
    bio: string;
  }
): Record<string, unknown> {
  const { radios, selects, multiSelects, textFields, bio } = state;
  const data: Record<string, unknown> = {};
  const preferences: Record<string, unknown> = {};

  for (const field of step.fields) {
    if (!isFieldVisible(field, profile, radios, selects)) continue;
    if (field.uiOnly) continue;

    if (field.name === "substanceUse") {
      data.smokes = radios.substanceUse ?? "";
      continue;
    }
    if (field.name === "substanceDetails") {
      data.substanceDetails = textFields.substanceDetails?.trim() ?? "";
      continue;
    }

    if (field.type === "textarea" && field.name === "bio") {
      data[field.name] = bio;
    } else if (field.type === "textarea") {
      data[field.name] = textFields[field.name]?.trim() ?? "";
    } else if (field.type === "multi-select" || field.type === "country-multi") {
      const values = multiSelects[field.name] ?? [];
      if (field.preferences) {
        preferences[field.name.replace("pref_", "")] = values;
      } else {
        data[field.name] = values;
      }
    } else if (field.type === "country-search") {
      const value = selects[field.name];
      if (field.preferences) {
        preferences[field.name.replace("pref_", "")] = value;
      } else {
        data[field.name] = value;
      }
    } else if (field.type === "select" || field.type === "number") {
      const value = selects[field.name];
      if (field.preferences) {
        const key = field.name.replace("pref_", "");
        preferences[key] =
          field.name.includes("Age") ||
          field.name.includes("Height") ||
          field.name.includes("Weight")
            ? value === "200+" || value === "100+"
              ? parseInt(value) || 200
              : parseInt(value) || 0
            : value;
      } else if (field.name === "age" || field.name === "height" || field.name === "weight") {
        data[field.name] =
          value === "200+" || value === "100+"
            ? parseInt(value) || 200
            : parseInt(value) || 0;
      } else if (field.name === "wearsHijab" || field.name === "hasBeard") {
        data[field.name] = value === "Yes";
      } else {
        data[field.name] = value;
      }
    } else if (field.type === "radio" || field.type === "gender-select") {
      const value = radios[field.name];
      if (field.preferences) {
        preferences[field.name.replace("pref_", "")] = value;
      } else if (field.name === "wearsHijab" || field.name === "hasBeard") {
        data[field.name] = value === "Yes";
      } else {
        data[field.name] = value;
      }
    } else if (field.type === "text") {
      const value = textFields[field.name]?.trim() ?? "";
      if (field.name === "name" && isValidContactName(value)) {
        data.name = value;
      } else if (field.name === "phone" && isValidContactPhone(value)) {
        data.phone = value;
      } else if (field.name !== "name" && field.name !== "phone") {
        data[field.name] = value;
      }
    }
  }

  if (Object.keys(preferences).length > 0) {
    // Single preferred age/height/weight: treat as minimum, keep matching range open above.
    if (typeof preferences.minAge === "number" && preferences.maxAge === undefined) {
      preferences.maxAge = PREFERRED_AGE_UPPER;
    }
    if (typeof preferences.minHeight === "number" && preferences.maxHeight === undefined) {
      preferences.maxHeight = PREFERRED_HEIGHT_UPPER;
    }
    if (typeof preferences.minWeight === "number" && preferences.maxWeight === undefined) {
      preferences.maxWeight = PREFERRED_WEIGHT_UPPER;
    }
    data.preferences = preferences;
  }

  return data;
}

export function validateField(
  field: FieldConfig,
  profile: {
    gender?: string;
    maritalStatus?: string;
    children?: number;
    country?: string;
    locationVerifiedAt?: number;
  } | null | undefined,
  state: {
    radios: Record<string, string>;
    selects: Record<string, string>;
    multiSelects: Record<string, string[]>;
    textFields: Record<string, string>;
    bio: string;
  }
): string | null {
  if (!isFieldVisible(field, profile, state.radios, state.selects)) return null;
  if (!field.required) return null;

  if (field.type === "textarea") {
    const value = field.name === "bio" ? state.bio : state.textFields[field.name] ?? "";
    return value.trim() ? null : "This field is required";
  }

  if (field.type === "multi-select" || field.type === "country-multi") {
    const values = state.multiSelects[field.name] ?? [];
    return values.length > 0 ? null : "Please select at least one option";
  }

  if (field.type === "radio" || field.type === "gender-select") {
    const radioKey = field.name === "substanceUse" ? "substanceUse" : field.name;
    return state.radios[radioKey] ? null : "Please select an option";
  }

  if (field.type === "country-search" || field.type === "select") {
    return state.selects[field.name]?.trim() ? null : "This field is required";
  }

  if (field.type === "text") {
    const value = state.textFields[field.name]?.trim() ?? "";
    if (!value) return "This field is required";
    if (field.name === "name" && !isValidContactName(value)) return "This field is required";
    if (field.name === "phone") {
      if (!isValidContactPhone(value)) {
        return value.length > 0 ? "Please enter a valid phone number" : "This field is required";
      }
    }
    return null;
  }

  return null;
}

export function getVisibleFields(
  step: StepConfig,
  profile: { gender?: string; maritalStatus?: string; children?: number; country?: string } | null | undefined,
  radios: Record<string, string>,
  selects?: Record<string, string>
): FieldConfig[] {
  return step.fields.filter((field) => isFieldVisible(field, profile, radios, selects));
}

type FormStateSlice = {
  radios: Record<string, string>;
  selects: Record<string, string>;
  multiSelects: Record<string, string[]>;
  textFields: Record<string, string>;
  bio: string;
};

/** Count visible questions in form steps (excludes photo). */
export function countFormQuestions(
  steps: StepConfig[],
  profile: { gender?: string; maritalStatus?: string; children?: number; country?: string } | null | undefined,
  state: FormStateSlice
): number {
  return steps
    .filter((s) => s.phase !== "photo")
    .reduce(
      (sum, step) =>
        sum + getVisibleFields(step, profile, state.radios, state.selects).length,
      0
    );
}

/** 1-based position in the flat question queue (form steps only). */
export function getGlobalQuestionNumber(
  steps: StepConfig[],
  stepIndex: number,
  fieldIndex: number,
  profile: { gender?: string; maritalStatus?: string; children?: number; country?: string } | null | undefined,
  state: FormStateSlice
): number {
  let n = 0;
  for (let s = 0; s < stepIndex; s++) {
    n += getVisibleFields(steps[s], profile, state.radios, state.selects).length;
  }
  return n + fieldIndex + 1;
}

export function isFieldAnswered(
  field: FieldConfig,
  profile: { gender?: string; maritalStatus?: string; children?: number; country?: string; name?: string; phone?: string } | null | undefined,
  state: {
    radios: Record<string, string>;
    selects: Record<string, string>;
    multiSelects: Record<string, string[]>;
    textFields: Record<string, string>;
    bio: string;
  }
): boolean {
  if (!isFieldVisible(field, profile, state.radios, state.selects)) return true;
  if (field.name === "name" || field.name === "phone") {
    const value = state.textFields[field.name]?.trim() ?? "";
    if (field.name === "name") return isValidContactName(value);
    return isValidContactPhone(value);
  }
  return validateField(field, profile, state) === null;
}

/** First unanswered visible question, or the last question if all are answered. */
export function getResumeFieldIndex(
  step: StepConfig,
  profile: { gender?: string; maritalStatus?: string; children?: number; country?: string } | null | undefined,
  state: {
    radios: Record<string, string>;
    selects: Record<string, string>;
    multiSelects: Record<string, string[]>;
    textFields: Record<string, string>;
    bio: string;
  }
): number {
  const visible = getVisibleFields(step, profile, state.radios, state.selects);
  if (visible.length === 0) return 0;
  for (let i = 0; i < visible.length; i++) {
    if (!isFieldAnswered(visible[i], profile, state)) return i;
  }
  return visible.length - 1;
}

export function validateStepFields(
  step: StepConfig,
  profile: {
    gender?: string;
    maritalStatus?: string;
    children?: number;
    country?: string;
    locationVerifiedAt?: number;
  } | null | undefined,
  state: {
    radios: Record<string, string>;
    selects: Record<string, string>;
    multiSelects: Record<string, string[]>;
    textFields: Record<string, string>;
    bio: string;
  }
): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const field of step.fields) {
    const error = validateField(field, profile, state);
    if (error) errors[field.name] = error;
  }

  return errors;
}
