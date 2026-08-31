# Frontend Provider Matrix

`NEXT_PUBLIC_BACKEND_PROVIDER` selects the implementation. Default **`convex`**. Never auto-infer to `api`.

## Domain inventory + adapter matrix

| Domain | Stable methods | Convex impl | API impl (Nest) | Hooks | Wired UI (Phase 10) |
|--------|----------------|-------------|-----------------|-------|---------------------|
| **auth** | getSession, getCurrentUser, login, register, logout, logoutAll, forgotPassword, resetPassword, changePassword, bootstrapMe | Convex Auth + `users.currentUser` / `account.changePassword` | `/auth/*` | `useUnifiedAuth` | login, guest-gate, idle-session, sign-out, dashboard-layout, trial-access-sync |
| **profile** | getProfile, updateProfile, ensureProfile, completeRegistrationGender, getAccessState | `profiles.*` | `/profile/*` | `useProfile`, `useEnsureProfile`, … | profile page |
| **preferences** | getPreferences, updatePreferences | `profiles.getPreferences` / updateProfile | `/preferences/me` | via profile hooks | profile page |
| **questionnaire** | updateQuestionnaire, autoSave, completeQuestionnaire, saveProfileEdits | `profiles.updateQuestionnaire` etc. | `/profile/questionnaire/*`, complete-questionnaire | yes | questionnaire page |
| **photos** | requestUploadUrl, confirmUpload, addAdditional, removeAdditional, uploadFile | generateUploadUrl + registerUpload | `/profile/photos/sign-upload` + confirm | `useUploadPhoto` | adapter ready; photo steps can adopt |
| **matching** | getMatches, getMyMatches, getMatchLists, getCompatibilityBreakdown, likeUser, markMatchSeen, archiveMatch | `matches.*` | `/matches/*` | yes | hooks ready; pages still mix direct Convex |
| **chat** | getConversations, getMessages, sendMessage, markAsRead, setTyping, getTypingStatus | `messages.*` | `/conversations/*` + socket | yes (socket in api) | hooks ready |
| **notifications** | list, unreadCount, markAsRead, markAllAsRead, markNotificationsRead, getMemberReminders | `notifications.*` | `/notifications/*` | yes | mark-read bridge |
| **payments** | createRegistrationCheckout, createPremiumUpgradeCheckout, verifySession, getStatus | `stripeActions.*` / `payments.*` | `/payments/stripe/*`, `/payments/status` | yes | payment-gate |
| **payments.evc** | myLatest, submitProof, signUpload | `evcPayments.*` | `/payments/evc/*` | yes | hooks ready |
| **support** | listMine, getMine, create, replyAsMember, sendPublicContact + admin.* | `supportContacts.*` / `contact.sendContactMessage` | `/support/*`, `/admin/support/*` | yes | contact-admin-card |
| **admin** | stats, analytics, activity, siteMetrics, rebuild, users.*, reports.*, payments.*, evc.*, announcements.*, auditLogs, staffInvites.* | `admin.*` / `staffInvites.*` / `evcPayments.*` | `/admin/*`, `/staff-invites/*` | yes | admin page + members / EVC / detail panels |
| **moderation** | blockUser, unblockUser, reportUser, listMyBlocks | `moderation.*` | `/moderation/*` | yes | hooks ready |

## Nest route map (API mode)

| Domain | Paths |
|--------|-------|
| Auth | `POST /auth/login`, `logout`, `logout-all`, `GET /auth/me`, `forgot-password`, `reset-password`, `change-password` |
| Profile | `GET/PATCH /profile/me`, `POST /profile/ensure`, `complete-registration-gender`, questionnaire routes, photos |
| Preferences | `GET/PUT/PATCH /preferences/me` |
| Matches | `GET /matches/discover`, `lists`, `mutual`, `POST :userId/action`, `:matchId/seen`, `archive` |
| Chat | `GET/POST /conversations…`, Socket events `message:new`, `conversation:updated`, `typing:update`, `unread:update`, `notification:new`, `session:revoked` |
| Notifications | `GET /notifications`, `unread-count`, `POST …/read` |
| Payments | Stripe checkout/verify, EVC proof routes |
| Support | `/support/me`, `/support`, admin `/admin/support` |
| Admin | `/admin/users`, reports, payments, evc, announcements, audit-logs, site-metrics, staff-invites |
| Moderation | `/moderation/block`, `report`, `blocks` |

## CSRF

Cookie `hel_csrf` (readable) → header `X-CSRF-Token` on mutating authenticated requests. Login/forgot/reset skip CSRF.

## Production posture

| Setting | Production today | Staging (API) |
|---------|------------------|---------------|
| `NEXT_PUBLIC_BACKEND_PROVIDER` | `convex` (or unset → convex) | `api` |
| Convex Auth | required | skipped |
| Nest cookies | unused | required |

## Remaining direct Convex deps

Run `npm run frontend:convex-deps` and read `migration-reports/phase10/direct-convex-deps.json`.
