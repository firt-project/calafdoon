# Admin Members & Users — how it works

## Users tab modes

The **Members** admin tab has two modes (not stacked anymore):

| Mode | Purpose |
|------|---------|
| **All members** | Directory of everyone. Search by name/email. Newest signups first. |
| **Review queue** | Period activity stats + approve/reject pending profiles. |

Switch with the two buttons at the top of the Users tab.

---

## All members (directory)

**UI:** `src/components/admin/admin-members-panel.tsx`  
**Page wiring:** `src/app/(app)/admin/page.tsx`  
**API:** `GET /admin/users` → `AdminUsersService.listUsers`

### Search flow

1. Type in the big search box (name or email).
2. 300ms debounce → `debouncedSearch`.
3. While searching, **role / payment / review filters are ignored** so results are not hidden.
4. Request: `sortBy=registered&sortOrder=desc&search=…`
5. Backend matches (OR):
   - profile `name`, `city`, `country`, `phone`
   - user `email`, `emailNormalized`, `name`
   - profile / user id (exact or prefix)

### Default sort

Newest registrations first: `user.createdAt DESC`.

### Filters (only when search is empty)

- Status chips: All, Pending, Approved, Incomplete, Rejected, Banned, Women awaiting approval
- Role + payment dropdowns

**“Women awaiting approval”** (`needs_action`) is a special filter: paid basic women who still need photo/profile approval — not all pending users.

---

## Review queue

**UI:** `src/components/admin/admin-review-queue-panel.tsx`  
**Period stats:** `src/components/admin/admin-status-period-panel.tsx`

### Period activity numbers

Click a metric (Registrations, Approved, Pending now, …).  
The queue below filters to those users and scrolls into view.

- Period metrics use the selected date preset.
- **Pending now / >24h / >48h** are live snapshots (no date preset).

### Queue search

Search box always searches **all members** by name/email (filters cleared). Debounced 300ms.

### Queue tabs (when not searching)

Today / Yesterday / Older pending / Changes requested / Rejected / Recently approved.

---

## Other admin tabs (same page)

| Tab | What it shows |
|-----|----------------|
| Dashboard | Stats, needs-attention chips, money summary |
| Members | Modes above |
| Payments | Stripe + EVC proofs |
| Reports | User reports |
| Contacts | Support inbox |
| Messages | Admin chat oversight |
| Analytics | Charts |
| Audit | Staff action log |

Open a member with **View** → profile detail drawer (`AdminUserDetailPanel`).

---

## Key files

```
src/app/(app)/admin/page.tsx              # tabs + members/review mode
src/components/admin/admin-members-panel.tsx
src/components/admin/admin-review-queue-panel.tsx
src/components/admin/admin-status-period-panel.tsx
src/data/admin/api.ts                     # nestUserListQuery
src/data/admin/hooks.ts                   # useAdminUsers
apps/api/src/admin/admin-users.controller.ts
apps/api/src/admin/admin-users.service.ts # listUsers search + sort
apps/api/src/admin/admin-user-date-filter.ts
```
