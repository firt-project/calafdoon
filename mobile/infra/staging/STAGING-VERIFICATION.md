# Staging verification checklist (API mode)

Use after every Render + Vercel deploy. Health must show `phase: 13` and `photoDelivery: "signed-url"` before testing photos.

## 0) Deploy health
- [ ] `curl -s https://tel-calafkaaga-1.onrender.com/health` → `phase: 14`, `photoDelivery: "signed-url"`, `viewModal: "hardened"`
- [ ] Vercel redeploy finished for frontend on latest `main`

## 1) Auth
- [ ] Member login works (cookie / session persists refresh)
- [ ] Admin login works
- [ ] Logout works

## 2) Photos (member)
- [ ] Matches browse/swipe: profile photos visible
- [ ] Own Profile page: main photo visible
- [ ] Chat list: partner avatars visible when allowed
- [ ] Admin members list: avatars still visible

## 3) View profile (the current bug area)
- [ ] Matches → **View** opens modal (does NOT show global error / Back to home)
- [ ] Modal shows name, score, photo, details
- [ ] Close (X) returns to matches
- [ ] Like / Pass / Shortlist from modal works
- [ ] Same View flow from Likes tabs

## 4) Matching actions
- [ ] Like from card/swipe
- [ ] Pass from card/swipe
- [ ] Shortlist
- [ ] Mutual match toast when reciprocal

## 5) Chat / messages
- [ ] Conversations list loads
- [ ] Open thread, send text
- [ ] Image messages still load

## 6) Admin
- [ ] Open member detail (no infinite spinner)
- [ ] Approve / ban still works if you test carefully on staging only

## If View still errors
1. Open browser DevTools → Console, copy the red stack
2. Note whether it happens on swipe View, browse View, or Likes View
3. Confirm health is still phase 13 (Render did not roll back)
