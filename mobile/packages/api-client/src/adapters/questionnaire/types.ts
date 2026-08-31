export type QuestionnaireAdapter = {
  updateQuestionnaire(step: number, data: Record<string, unknown>): Promise<unknown>;
  autoSave(step: number, data: Record<string, unknown>): Promise<unknown>;
  completeQuestionnaire(data?: Record<string, unknown>): Promise<unknown>;
  saveProfileEdits(data: Record<string, unknown>): Promise<unknown>;
};

export const QUESTIONNAIRE_METHOD_NAMES = [
  "updateQuestionnaire",
  "autoSave",
  "completeQuestionnaire",
  "saveProfileEdits",
] as const;
