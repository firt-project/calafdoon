# Questionnaire update report — why backend changed with the frontend

**Date:** 6 August 2026  
**Product:** Hel Calafkaaga  
**Audience:** Frontend / app team preparing to ship the questionnaire UI update  

---

## Summary

The questionnaire on the web app was shortened and simplified. Those questions are not UI-only: the Nest API decides whether a profile is **complete**, stores **partner preferences**, and uses them for **matching**.

If only the frontend stopped asking some questions (or started sending `preferredWeight`) without backend changes, users would hit:

- “Profile incomplete” / blocked matches after finishing the form
- Preferences save failures for the new weight field
- Wrong admin/review displays and incomplete scoring

So frontend and backend must ship together.

---

## What the frontend changed

Source of truth for visible questions: `src/components/questionnaire/steps.ts`  
Checklist: `questions.md`

### Removed from the form

| Question | Field key(s) |
|----------|----------------|
| Do you plan to marry another wife in the future? (men) | `openToSecondWife` |
| Would you accept if your husband marries another wife later? (women) | `acceptFutureCoWife` |
| Do you want children? | `wantChildren` |
| Would you marry someone with children? | `marrySomeoneWithChildren` |
| Preferred Max Age | `pref_maxAge` → `maxAge` |
| Preferred Max Height | `pref_maxHeight` → `maxHeight` |
| Accept someone with children? | `pref_acceptChildren` → `acceptChildren` |
| How often do you exercise? | `exercise` |
| Would you accept a man who was previously married? (women) | `acceptPreviouslyMarriedMan` |
| Do you have children from a previous marriage? | `hasChildren` (UI only) |
| How important is it that your spouse prays regularly? | `spousePrayerImportance` |

### Updated

| Before | After |
|--------|--------|
| Preferred Min Age + Max Age (range) | **Preferred Age** — one number (`minAge`) |
| Preferred Min Height + Max Height (range) | **Preferred Height** — one number (`minHeight`) |

On save, the form still fills upper bounds internally (`maxAge` / `maxHeight`) so matching ranges keep working.

### Added

| Question | Field key | Storage |
|----------|-----------|---------|
| Preferred Weight (kg) — one number | `pref_minWeight` | Preferences `minWeight` (+ auto `maxWeight`) |

### Current partner-preferences step (frontend)

1. Hijab / niqab preference *(men only)*  
2. Preferred Age  
3. Preferred Height  
4. Preferred Weight (kg)  
5. Preferred Countries  
6. Preferred Education  

Plus earlier about-you / contact / optional photo steps listed in `questions.md`.

---

## Why the backend had to be updated

### 1. Profile completeness gate (blocking)

Backend: `apps/api/src/profile/profile-completeness.ts`  
Frontend mirror: `src/lib/profile-progress.ts`

**Before:** Completeness required removed fields (`wantChildren`, `exercise`, `spousePrayerImportance`, `marrySomeoneWithChildren`, max age/height, etc.).

**After removing them only on the UI:** members would finish the questionnaire but the API would still return “profile incomplete” and block discover/matching.

**Backend fix:** Completeness now matches the shorter questionnaire. Preferences require `minAge`, `minHeight`, `minWeight`, and `educationLevel` (plus hijab preference for men).

### 2. New preference: weight (schema + API)

Preferred weight did not exist on `preferences`.

Without a DB column and API support:

- Questionnaire save of `preferences.minWeight` would be ignored or rejected
- Completeness could never see a saved weight preference

**Backend fix:**

| Layer | Change |
|-------|--------|
| Prisma | `min_weight`, `max_weight` on `preferences` |
| Migration | `apps/api/prisma/migrations/20260806150000_preference_weight/` |
| Preferences API | Accept / validate / return `minWeight`, `maxWeight` |
| Questionnaire prefs allow-list | Allow `minWeight` / `maxWeight` writes |
| Auth / profile defaults | Create new users with weight defaults |
| Matching | Soft score by preferred weight |

**Deploy requirement:** run migration before or with the app release:

```bash
cd apps/api && npx prisma migrate deploy
```

### 3. Preferences API contract

Endpoints: `GET/PUT/PATCH /preferences/me`

Allowed body now includes:

```ts
minWeight?: number  // preferred weight (kg), typically 45–100+
maxWeight?: number  // filled by web form when only preferred weight is chosen
```

Same pattern as age/height after the “single number” UX change.

### 4. Matching / compatibility

Removed questions are no longer collected for new members. Completeness no longer depends on them. Matching still tolerates old stored values where present.

Weight preference is included in compatibility scoring so the new field is not dead data.

### 5. Admin / review surfaces

Admin detail and questionnaire review were updated so staff see the current questions (single preferred age / height / weight; no removed fields as required UI).

---

## Frontend application checklist

Use this when updating the mobile/web client that talks to the Nest API.

### Do

- [ ] Ship UI that matches `questions.md` / `steps.ts`
- [ ] Stop requiring removed fields before calling “complete questionnaire”
- [ ] Collect Preferred Age, Height, Weight as **one select each**
- [ ] Send preferences patch/put including `minWeight` (and `minAge`, `minHeight`, `educationLevel`, etc.)
- [ ] Ensure API base URL points to a backend that has the weight migration applied
- [ ] Update any local completeness / progress logic to match backend rules

### Don’t

- [ ] Don’t release frontend-only and leave production API on old completeness rules
- [ ] Don’t send only UI labels without the preference keys (`minAge`, `minHeight`, `minWeight`, …)
- [ ] Don’t require `spousePrayerImportance`, `wantChildren`, `exercise`, max age/height, etc. for completion

### Suggested preference payload (partner step)

```json
{
  "minAge": 25,
  "maxAge": 60,
  "minHeight": 165,
  "maxHeight": 210,
  "minWeight": 70,
  "maxWeight": 150,
  "educationLevel": "Bachelor",
  "preferredCountries": ["Somalia"],
  "partnerHijabLevel": "Always"
}
```

Notes:

- `partnerHijabLevel` required for **male** users only  
- `maxAge` / `maxHeight` / `maxWeight` can be omitted if the client mirrors the web form’s upper-bound fill-in; otherwise send them explicitly  
- Empty `preferredCountries` means “any”

---

## Files touched (high level)

### Frontend (web)

- `src/components/questionnaire/steps.ts` — question list  
- `src/lib/questionnaire-form.ts` — form state / save mapping  
- `src/lib/profile-progress.ts` — progress / completeness  
- Review, admin panels, i18n, `questions.md`

### Backend (Nest + Prisma)

- `apps/api/prisma/schema.prisma` + migration `20260806150000_preference_weight`  
- `preferences.service.ts` / `preferences.controller.ts`  
- `profile-completeness.ts`, `questionnaire.ts`, `profile.service.ts`, `auth.service.ts`  
- `matching/compatibility.ts`, `score.service.ts`  
- Seeds / migration import helpers  

---

## Release order (recommended)

1. Deploy API + run `prisma migrate deploy` (adds weight columns; updates completeness)  
2. Deploy frontend / app with the new questionnaire  
3. Smoke-test: register → finish questionnaire → confirm no incomplete error → preferences show age/height/weight → matches load  

If frontend ships first against an old API: preferred weight will not persist, and completeness may still demand removed questions.

---

## Contact / ownership

- Questionnaire UI: `src/components/questionnaire/`  
- Completeness source of truth (API): `apps/api/src/profile/profile-completeness.ts`  
- Preferences API: `apps/api/src/profile/preferences.*.ts`
