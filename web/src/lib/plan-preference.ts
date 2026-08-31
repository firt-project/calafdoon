export const PLAN_PREFERENCE_KEY = "calaf-preferred-plan";

export type PlanPreference = "basic" | "premium";

export function parsePlanPreference(
  value: string | null | undefined
): PlanPreference | null {
  if (value === "basic" || value === "premium") return value;
  return null;
}

export function savePlanPreference(plan: PlanPreference): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(PLAN_PREFERENCE_KEY, plan);
}

export function getPlanPreference(): PlanPreference | null {
  if (typeof window === "undefined") return null;
  return parsePlanPreference(sessionStorage.getItem(PLAN_PREFERENCE_KEY));
}

export function clearPlanPreference(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(PLAN_PREFERENCE_KEY);
}

export function registerHrefForPlan(plan?: PlanPreference): string {
  return plan ? `/register?plan=${plan}` : "/register";
}
