# Development Log — Oneness Yoga Trainers App

A living record of features and fixes implemented via Claude Code sessions. Update this file as work continues; don't let it go stale.

Last updated: 2026-07-28

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

## 5. In-app sequence builder + Google Sheets sync (commit `683c5d4`, plus uncommitted domain-wide-delegation fix)

The second major feature requested. Today a trainer manually builds their class sequence in an external Google Sheet and pastes the link (`PATCH /sequences/:id/upload`, unchanged, still works). This adds an in-app alternative.

**Decisions locked in:**
- One shared Google Spreadsheet **per calendar month**; one tab per day. Multiple trainers assigned the same date stack as separate sections within that day's single tab.
- Both submission paths stay available — manual paste-link and the new in-app builder.
- Spreadsheets are shared as editor with `mannoj@onenessyoga.in` (a Google Workspace account on the onenessyoga.in domain) and with every trainer whose `google_link_status === 'approved'` (using their existing `User.email`, no new field needed). Sharing is dynamic — approving a trainer after a month's spreadsheet already exists retroactively shares it with them too.

**Schema**: new `SequenceItem` (`sequence_id`, `sort_order`, `name`, `remarks?`, `reference_url?`) and `MonthlySheet` (`year_month` unique, `spreadsheet_id`) models. Migration: `20260722162832_add_sequence_items_and_monthly_sheets`.

**Backend**:
- **`backend/src/utils/sheets.js`** (new) — same defensive lazy-init pattern as `mail.js`: `sheetsClient` is `null` when `GOOGLE_SERVICE_ACCOUNT_KEY` is unset, every function warns+no-ops instead of throwing. `upsertSequenceInSheet(sequence, items)` finds-or-creates the month's spreadsheet, finds-or-creates the day's tab (yellow header row, matching the target visual style), then calls `rewriteDayTabContent()`. `shareSpreadsheetWithTrainer(spreadsheetId, email)` used both at spreadsheet-creation time and for the dynamic re-share.
- **`rewriteDayTabContent(spreadsheetId, tabTitle, scheduled_date)`** — rebuilds that day's tab body from scratch every time, by re-querying every sequence scheduled that date (with its items) from the DB, clearing the tab's existing rows, and rewriting them all in one pass. Replaced an earlier "always append a new section" approach that left duplicate/stale sections behind whenever a trainer edited an already-built sequence (caught during testing — editing showed both the old and new version stacked in the sheet). The full-rewrite approach is idempotent and also correctly handles multiple trainers' sequences stacking within one day's tab, as separate sections, without any special-casing.
- **`backend/src/routes/sequences.js`** — new `POST /:id/build` (trainer-only, same ownership check as `/upload`): replaces that sequence's `SequenceItem` rows (delete-then-recreate) and calls `upsertSequenceInSheet`. Extracted a shared `markUploaded(id, link)` helper so both `/upload` and `/build` use one status-transition code path instead of duplicating it. `GET /:id` now also includes `items` (ordered by `sort_order`) so the frontend can render the actual content, not just a sheet link.
- **`backend/src/routes/users.js`** — the Google-link approval handler now also shares the current month's spreadsheet (if one exists) with a newly-approved trainer.

**Frontend**:
- **`frontend/src/pages/trainer/SequenceDetail.jsx`** — "Build Sequence" button/modal next to the existing "Upload Google Sheet Link" button. The builder renders a true spreadsheet-style grid (thin gridlines between cells, header row: Exercise / Remarks / Reference) with a small "+" icon button top-right to add rows, and a "×" remove button per row. Submits to `POST /sequences/:id/build`.
- **Edit-after-upload**: both buttons now show for the assigned trainer regardless of `status` (previously hidden once `uploaded`), relabeled "Edit Google Sheet Link" / "Edit Sequence" once already submitted — editable at any time, including after "Notify Team" has already fired, per explicit decision (simplicity over locking, since the team just sees whatever's currently saved when they look). Re-opening the builder pre-fills the existing saved items instead of resetting to a blank row.
- **Read-only "Sequence Content" card** — renders the saved exercise list (name/remarks/reference) directly in the app, visible to *any* trainer viewing the sequence (not just the assigned one — matches how the sequence list already shows everyone's sequences for the week). The Google Sheet link stays visible as a secondary "Open Google Sheet" convenience link, no longer the only way to see the content.

**Sheet access lockdown (in progress)**: the sequence-creator originally shared each spreadsheet as **editor** with every Google-approved trainer. Changed to **owner = `mannoj@onenessyoga.in` only editor, all trainers read-only** (`findOrCreateMonthlySheet` and `shareSpreadsheetWithTrainer` now grant `role: 'reader'` to trainers). **Important finding while testing this**: the fix alone isn't sufficient — the shared Drive folder (`GOOGLE_SEQUENCES_FOLDER_ID`) itself already had all real trainer accounts shared as **Editor at the folder level** (pre-dating this project), and Drive permission inheritance means a file can never be *more* restrictive than its parent folder — per-file `reader` grants are silently overridden by broader folder-level access. **Action needed from the user**: manually open that folder in Drive and downgrade each trainer listed there from Editor to Viewer (or remove them), so our per-file restriction actually takes effect. Caught this live during testing (a throwaway test spreadsheet was briefly shared with 10 real, already-approved trainer accounts as editors) — the mistaken file was deleted immediately.

**Sheet→DB two-way sync — explicitly out of scope for now**: considered adding a mechanism so manual edits made directly in the Google Sheet flow back into the database, but this would require a new subsystem (either a Google Apps Script webhook trigger or a polling job — neither exists in this app), a new hidden-ID row-mapping scheme in the sheet layout, and real conflict-resolution logic against the app's own writes (which currently fully regenerate the tab on every in-app edit). Decided to keep the app as the single source of truth and the Sheet as a one-way, read-only mirror rather than take on that scope.

**Getting Sheets sync actually working — real gotchas hit and fixed (uncommitted as of this writing):**
1. **Service account key creation was org-blocked** (`iam.disableServiceAccountKeyCreation` constraint, part of Google's newer "Secure by Default" policy). Fixed by overriding the org policy for just the `oneness-yoga-app` project (Organization Policies → "Disable service account key creation (Legacy)" → Override parent's policy → Off), requiring the `Organization Policy Administrator` IAM role.
2. **Bare service accounts have no Drive storage quota** — a plain `spreadsheets.create` call fails with a generic 403 "The caller does not have permission." First attempted fix (share a specific Drive folder with the service account as Editor, create files into it) got further but still failed with "The user's Drive storage quota has been exceeded" — because a service account creating a file inside someone else's regular ("My Drive") folder still becomes that file's *owner* by default, and service accounts always have zero quota.
3. **Real fix: Domain-Wide Delegation.** The service account now impersonates `mannoj@onenessyoga.in` (via `google.auth.JWT`'s `subject` option) when creating/editing sheets, so every file is genuinely owned by that real Workspace account. Setup required: (a) note the service account's numeric Client ID from its JSON key, (b) authorize that Client ID for the `spreadsheets`+`drive` scopes in Google Workspace Admin Console → Security → API Controls → Domain-wide Delegation. New files are still created inside the shared Drive folder (`GOOGLE_SEQUENCES_FOLDER_ID`) for organization, but ownership now correctly resolves to a real account.
4. The downloaded service account JSON key lives in `Google Key/` at the project root — added to `.gitignore` immediately (`Google Key/`, `*.json.key`) since it was briefly untracked-but-present; never committed.

**Status**: ✅ core builder + Sheets sync fully working, verified end-to-end (build → real spreadsheet created, correct day-tab formatting, correct trainer/topic section, status transition). ✅ edit-after-upload verified (re-submitting cleanly replaces both the DB rows and the sheet section, no duplication). ⏳ Sheet access lockdown coded but **blocked on manual folder-level permission cleanup** (see above) before it's actually effective.

---

## 6. External UI/UX overhaul merged (commit `4087e14`, pulled from origin)

A large concurrent contribution from another collaborator (`saivenkat420`) was pulled in via `git pull` — 40 files, ~1500 lines. Overhauled the visual design system (Inter typography, new color palette, shadows/animations), replaced emoji icons with Heroicons throughout, standardized Title Case copy, redesigned the login page and admin dashboard, added a `usePolling` hook (30s auto-refresh + visibility listener) used across most list pages, added a Toast notification system (`ToastContext`/`Toast.jsx`), and wired push notifications into the session create/update/cancel routes (reusing our `notify.js` helper).

Touched several files this session had just built (`NotificationBell.jsx`, `SequenceDetail.jsx`, `push.js`, `auth.js`) — verified after pulling that all of this session's functionality survived intact (the sequence builder's core logic, the bell's dropdown behavior, etc.), just restyled around it. One thing intentionally left as-is: `auth.js`'s login error messages now distinguish "no account found" vs "incorrect password" vs "account deactivated" (previously a single generic "Invalid credentials"), which is a minor user-enumeration weakness — flagged to the user, decision was to leave it (small internal team tool, low risk accepted for the better UX).

---

## Environment variables reference

**`backend/.env`**:
| Variable | Purpose | Status |
|---|---|---|
| `PORT`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `DATABASE_URL` | Core app config | ✅ set (pre-existing) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL` | Browser push | ✅ set (pre-existing) |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Transactional email | ✅ set, domain verified |
| `GOOGLE_CLIENT_ID` | Google Sign-In token verification | ✅ set |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Google Sheets/Drive API (service account, base64 JSON) | ✅ set, domain-wide delegation configured, tested working |
| `GOOGLE_SEQUENCES_FOLDER_ID` | Drive folder new monthly spreadsheets are created into | ✅ set (`1cWsiP2yOf2E-lHsL3CbYVvczrRm1DTBv`) |
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

1. **Action needed from user**: downgrade the trainer accounts currently shared as Editor on the `GOOGLE_SEQUENCES_FOLDER_ID` Drive folder to Viewer (or remove them) — our code-level read-only restriction can't take effect until the folder-level permissions stop overriding it (see §5).
2. **Not yet tested**: the dynamic re-share firing correctly when a trainer's Google link is approved after a month's spreadsheet already exists (code exists, live end-to-end test still pending).
3. **Not built (by decision)**: Sheet→DB two-way sync — see §5's explanation of why this was scoped out.
4. Minor pre-existing findings from the original agent reviews that were deliberately deferred (not breaking): dependency version bumps (React 18→19, Express 4→5, Prisma 6→7, etc.), `parseInt` NaN validation on route params, N+1 query in bulk session creation, no DB connect timeout, no startup env-var validation, a few low-severity UX polish items. Full detail in `Agent Reviews/`.
