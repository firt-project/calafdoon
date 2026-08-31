import { apiQuestionnaire } from "./api";
import type { QuestionnaireAdapter } from "./types";

export type { QuestionnaireAdapter } from "./types";
export { QUESTIONNAIRE_METHOD_NAMES } from "./types";

export function getQuestionnaireAdapter(): QuestionnaireAdapter {
  return apiQuestionnaire;
}

export const questionnaire = new Proxy({} as QuestionnaireAdapter, {
  get(_t, prop: string) {
    const adapter = getQuestionnaireAdapter();
    const value = adapter[prop as keyof QuestionnaireAdapter];
    return typeof value === "function" ? value.bind(adapter) : value;
  },
});
