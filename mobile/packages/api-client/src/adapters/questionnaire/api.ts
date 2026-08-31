import { apiClient } from "../api-client";
import type { QuestionnaireAdapter } from "./types";

export const apiQuestionnaire: QuestionnaireAdapter = {
  async updateQuestionnaire(step, data) {
    return apiClient.post("/profile/questionnaire/update", { step, data });
  },
  async autoSave(step, data) {
    return apiClient.post("/profile/questionnaire/autosave", { step, data });
  },
  async completeQuestionnaire(data) {
    return apiClient.post("/profile/complete-questionnaire", data ?? {});
  },
  async saveProfileEdits(data) {
    return apiClient.post("/profile/questionnaire/save-edits", { data });
  },
};
