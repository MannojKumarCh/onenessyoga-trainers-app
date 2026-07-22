# Development Log — Oneness Yoga Trainers App

A living record of features and fixes implemented via Claude Code sessions. Update this file as work continues; don't let it go stale.

Last updated: 2026-07-22

---

## 1. Code health & UX hardening (commit `15307c9`)

Triggered by running two review agents (`code-health-reviewer`, `ux-reviewer`) against the app and fixing the Critical/High/breaking-Medium findings. Full original reports live in `Agent Reviews/`.

### Backend
- **`backend/src/index.js`**: added `helmet()` security headers; CORS now fails closed (defaults to `http://localhost:5173`, throws at boot if `FRONTEND_URL` is unset in `NODE_ENV=production`) instead of reflecting any origin; added `process.on('unhandledRejection'/'uncaughtException')` crash handlers; graceful shutdown now captures the `http.Server` and calls `server.close()` before `prisma.$disconnect()`.
- **`backend/src/routes/auth.js`**: added `express-rate-limit` (10 attempts / 15 min) on `POST /login`; `bcrypt.compareSync`/`hashSync` converted to the async `bcrypt.compare`/`bcrypt.hash` API (was blocking Node's event loop).
- **`backend/src/routes/users.js`**: same async-bcrypt conversion for create-user and reset-password.
- **`backend/src/routes/sequences.js`**: removed a locally-duplicated `asyncHandler` implementation; now uses the same shared router-monkeypatch pattern (`require('../utils/asyncHandler')`) as every other route file, closing a drift risk.

### Frontend
- **`frontend/src/components/ErrorBoundary.jsx`** (new): catches render-time exceptions app-wide instead of white-screening; wrapped around `<App />` in `main.jsx`.
- **`frontend/src/components/TrainerLayout.jsx`**: added a persistent header + Logout button (previously only the trainer Dashboard page had one, so other trainer pages had no way to log out).
- **`frontend/src/pages/trainer/Dashboard.jsx`**: dashboard cards converted from `<div onClick>` to real `<button>` elements for keyboard accessibility; removed the now-redundant per-page Logout button.
- **Missing `try/catch` on mutation handlers** fixed across `admin/Sessions.jsx` (delete), `trainer/Leaves.jsx` (cancel), `admin/Trainers.jsx` (toggle-active, deactivate, reset-password), `admin/Resources.jsx` (delete), `trainer/SessionDetail.jsx` (mark-complete, save-notes) — all now use the shared `getApiErrorMessage` helper (`frontend/src/utils/apiError.js`) and correctly reset loading state on failure instead of leaving buttons stuck.
- **`frontend/src/hooks/usePush.js`**: fixed an `AbortError` on every login — `subscribe()` now always waits for `navigator.serviceWorker.ready` before calling `pushManager.subscribe()`.
- **`frontend/src/components/PushNotificationsPrompt.jsx`**: converted from an inline banner that shifted page layout into a floating toast anchored near the top, dismissible.
- **`frontend/src/index.css`**: `.modal-overlay` changed from a bottom-sheet (`align-items: flex-end`) to centered (`align-items: center`); `.page` fixed to use `height: 100%` instead of `flex: 1` so page content actually scrolls instead of being clipped by the fixed bottom nav.
- **PWA service worker fix** (`frontend/src/sw.js`, `frontend/vite.config.js` area): added the missing `self.__WB_MANIFEST` / `precacheAndRoute` call so `vite build`'s `injectManifest` step stops failing; added `workbox-precaching` as an explicit dependency.

---

## 2. Google Sign-In with admin approval (commit `15307c9`)

**Decisions locked in:**
- Existing-accounts-only — a super admin must already have created the user; Google sign-in never creates a new account or role.
- Password login stays available indefinitely — Google is additive, not a replacement.
- The Google account's email must exactly match the user's existing `email` in the DB (case-insensitive).
- One button serves both the first-time link request *and* subsequent logins — no separate "link my account" page needed, since Google's signed ID token already proves email ownership.

**Schema** (`backend/prisma/schema.prisma`): `User` gained `google_id String? @unique`, `google_link_status GoogleLinkStatus @default(none)` (enum: `none`/`pending`/`approved`/`rejected`), `google_linked_at DateTime?`. Migration: `20260719115913_add_google_login`.

**Backend**:
- `backend/src/routes/auth.js` — new `POST /google` (rate-limited like `/login`): verifies the ID token via `google-auth-library`'s `OAuth2Client.verifyIdToken`, looks up the user by verified email, and branches on state (no account → 404; first attempt → sets `pending`, notifies admins, returns 202; still pending → 202; rejected → 403; approved → issues the same JWT shape as password login).
- `backend/src/routes/users.js` — new `PUT /:id/google-link` (super-admin only): approve/reject a pending request, only from `pending` state. On approve/reject, also fires an in-app notification + decision email to the trainer (see §3), and on approve, dynamically shares the current month's sequence spreadsheet with the trainer if one already exists (see §5).

**Frontend**:
- `frontend/src/main.jsx` wraps the app in `<GoogleOAuthProvider>` (`@react-oauth/google`).
- `frontend/src/context/AuthContext.jsx` — new `loginWithGoogle(credential)`.
- `frontend/src/pages/LoginPage.jsx` — `<GoogleLogin>` button below the password form, showing pending/error messages inline.
- `frontend/src/pages/admin/Trainers.jsx` — per-user "Google: Pending/Linked/Rejected" badge with Approve/Reject buttons.

**Config required**: `GOOGLE_CLIENT_ID` in `backend/.env`, `VITE_GOOGLE_CLIENT_ID` in `frontend/.env` (same value, from a Google Cloud OAuth 2.0 Web Application Client ID, no client secret needed). **Status: configured and working**, tested end-to-end (pending → approve → login succeeds).

---

## 3. Transactional email via Resend (commit `15307c9`)

**Decisions locked in:** provider = Resend (HTTPS API, avoids Oracle VM's potential outbound-SMTP port blocking); welcome email contains a login link only, never the password (admin communicates that separately).

- **`backend/src/utils/mail.js`** (new): defensive lazy-init (`resend = RESEND_API_KEY ? new Resend(...) : null`) — a missing/invalid key logs a warning and no-ops rather than crashing the server. This exact bug (crashing at boot on a missing credential) was hit once during testing and fixed.
  - `sendWelcomeEmail(user)` — fired from `POST /users` (admin creates a user).
  - `sendGoogleLinkPendingEmail(admin, requestingUser)` — fired to all super admins when a trainer's first Google sign-in attempt lands in `pending`.
  - `sendGoogleLinkDecisionEmail(user, status)` — fired to the trainer when their Google link is approved or rejected.
- **Config**: `RESEND_API_KEY`, `RESEND_FROM_EMAIL` in `backend/.env`.
- **Status**: domain `onenessyoga.in` verified in Resend (SPF/DKIM/DMARC DNS records added by user). `RESEND_FROM_EMAIL` set to `namasthe@onenessyoga.in` (does not need to be a real mailbox — only the domain needs verifying, not the specific address). Confirmed working end-to-end: a real email was received.

---

## 4. In-app notification bell/inbox (commit `15307c9`)

Built because browser push notifications proved unreliable to test (permission-state fragility across browsers/OS). This channel doesn't depend on browser push permissions at all.

**Decisions locked in:** small dropdown on bell click (not a full-page navigation) showing unread items; clicking an item marks it read, removes it from the dropdown, and navigates to its linked page; a separate `/notifications` page shows the last 30 (read + unread) for full history; badge refreshes on page load/navigation only, no polling.

**Schema**: new `Notification` model (`user_id`, `title`, `body`, `url?`, `is_read`, `created_at`). Migration: `20260719140141_add_notifications`.

**Backend**:
- **`backend/src/utils/notify.js`** (new) — `notifyUser`/`notifyUsers`/`notifyAll`, each writing a `Notification` row *and* calling the existing `backend/src/utils/push.js` browser-push functions, so the DB record and the push attempt can never drift apart. All 5 existing push call sites (sequence assignment, weekly assignment, sequence upload, leave review, Google sign-in request) now go through this helper instead of calling `push.js` directly.
- **`backend/src/routes/notifications.js`** — added `GET /unread`, `GET /unread-count`, `GET /history`, `PATCH /:id/read`, `PATCH /read-all` alongside the existing push-subscription routes.

**Frontend**:
- **`frontend/src/components/NotificationBell.jsx`** (new) — bell icon + unread badge in all 3 layout headers; dropdown fetches on open, badge re-fetches on every route change via `useLocation().pathname`.
- **`frontend/src/pages/Notifications.jsx`** (new) — full history page, registered at `/notifications` for all 3 roles in `App.jsx`.

**Status**: fully working, verified end-to-end.

---

## 5. In-app sequence builder + Google Sheets sync (in progress, **not yet committed**)

The second major feature requested. Today a trainer manually builds their class sequence in an external Google Sheet and pastes the link (`PATCH /sequences/:id/upload`, unchanged, still works). This adds an in-app alternative.

**Decisions locked in:**
- One shared Google Spreadsheet **per calendar month**; one tab per day. Multiple trainers assigned the same date stack as separate sections within that day's single tab.
- Both submission paths stay available — manual paste-link and the new in-app builder.
- Spreadsheets are shared as editor with `mannoj@onenessyoga.in` (a Google Workspace account on the onenessyoga.in domain) and with every trainer whose `google_link_status === 'approved'` (using their existing `User.email`, no new field needed). Sharing is dynamic — approving a trainer after a month's spreadsheet already exists retroactively shares it with them too.

**Schema** (uncommitted): new `SequenceItem` (`sequence_id`, `sort_order`, `name`, `remarks?`, `reference_url?`) and `MonthlySheet` (`year_month` unique, `spreadsheet_id`) models. Migration: `20260722162832_add_sequence_items_and_monthly_sheets` (applied to the local DB, not yet committed to git).

**Backend (uncommitted)**:
- **`backend/src/utils/sheets.js`** (new) — same defensive lazy-init pattern as `mail.js`: `sheetsClient` is `null` when `GOOGLE_SERVICE_ACCOUNT_KEY` is unset, every function warns+no-ops instead of throwing. `upsertSequenceInSheet(sequence, items)` finds-or-creates the month's spreadsheet, finds-or-creates the day's tab (yellow header row, matching the target visual style), and appends this trainer's section below any others already in that tab. `shareSpreadsheetWithTrainer(spreadsheetId, email)` used both at spreadsheet-creation time and for the dynamic re-share.
- **`backend/src/routes/sequences.js`** — new `POST /:id/build` (trainer-only, same ownership check as `/upload`): replaces that sequence's `SequenceItem` rows (delete-then-recreate) and calls `upsertSequenceInSheet`. Extracted a shared `markUploaded(id, link)` helper so both `/upload` and `/build` use one status-transition code path instead of duplicating it.
- **`backend/src/routes/users.js`** — the Google-link approval handler now also shares the current month's spreadsheet (if one exists) with a newly-approved trainer.

**Frontend (uncommitted)**:
- **`frontend/src/pages/trainer/SequenceDetail.jsx`** — new "Build Sequence" button/modal next to the existing "Upload Google Sheet Link" button (both shown while `status === 'pending'`). The builder renders a spreadsheet-style grid (thin gridlines, header row: Exercise / Remarks / Reference) with a small "+" icon button top-right to add rows, and a "×" remove button per row. Submits to `POST /sequences/:id/build`.

**Status**:
- ✅ Database save confirmed working end-to-end (verified via direct DB query after a real UI submission).
- ⏳ Google Sheets sync **not yet testable** — requires `GOOGLE_SERVICE_ACCOUNT_KEY` in `backend/.env`, which needs a Google Cloud service account (enable Sheets API + Drive API, create a service account, generate a JSON key) — **not yet set up**. Until then, `POST /:id/build` responds with `{ success: true, sheetSynced: false }` and the sequence correctly stays in `pending` status rather than falsely marking itself `uploaded`.
- Not yet committed to git (schema, `sheets.js`, and the two route files are still local-only changes).

---

## Environment variables reference

**`backend/.env`**:
| Variable | Purpose | Status |
|---|---|---|
| `PORT`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `DATABASE_URL` | Core app config | ✅ set (pre-existing) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL` | Browser push | ✅ set (pre-existing) |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Transactional email | ✅ set, domain verified |
| `GOOGLE_CLIENT_ID` | Google Sign-In token verification | ✅ set |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Google Sheets/Drive API (service account, base64 JSON) | ❌ **not yet set** — blocks Sheets sync testing |
| `FRONTEND_URL` | CORS + email links | not set — defaults to `http://localhost:5173` |

**`frontend/.env`**:
| Variable | Purpose | Status |
|---|---|---|
| `VITE_GOOGLE_CLIENT_ID` | Google Sign-In button | ✅ set |

---

## Test accounts (local dev)

| Role | Email | Notes |
|---|---|---|
| Super Admin | `admin@oneness.yoga` | password `admin1234`; not a real mailbox |
| Trainer | `mannoj@onenessyoga.in` | real inbox, Google-linked & approved |
| Sequence Creator | `seqcre@guysmail.com` | not a real mailbox |

---

## Known gaps / not yet done

1. **Google Sheets service account** — needs to be created (see §5) before the sequence-builder-to-Sheets sync can be tested live.
2. **Uncommitted work** — all of §5 (sequence builder + Sheets integration) is local-only; not yet committed or pushed.
3. Minor pre-existing findings from the original agent reviews that were deliberately deferred (not breaking): dependency version bumps (React 18→19, Express 4→5, Prisma 6→7, etc.), `parseInt` NaN validation on route params, N+1 query in bulk session creation, no DB connect timeout, no startup env-var validation, a few low-severity UX polish items. Full detail in `Agent Reviews/`.
