# Development Log — Oneness Yoga Trainers App

A living record of features and fixes implemented via Claude Code sessions. Update this file as work continues; don't let it go stale.

Last updated: 2026-08-23

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

## 7. Code-health cleanup + major dependency upgrades (React 19, Express 5, Prisma 7)

Worked through the deferred findings from the original code-health review, plus the three major-version bumps that had been deliberately postponed to their own session:

**Small fixes (backend):**
- Fixed an N+1 query in `POST /sessions/bulk` (`sessions.js`) — previously called `ensureTrainerExists` (one `findUnique`) per row in the submitted array; now batches all distinct trainer IDs into a single `findMany` before building the `createMany` payload.
- Added `backend/src/middleware/validateIdParam.js`, wired via `router.param('id', validateIdParam)` into all 6 CRUD route files (`users.js`, `notifications.js`, `sequences.js`, `sessions.js`, `leaves.js`, `resources.js`) — a non-numeric `:id` now returns a clean 400 instead of an unhandled Prisma error.
- `backend/src/index.js` now fails fast at boot with a clear message if `DATABASE_URL`, `JWT_SECRET`, or `JWT_EXPIRES_IN` are missing, and warns (without blocking) on missing optional integrations (Resend, Google, VAPID).
- Added `connection_limit=10&pool_timeout=10&connect_timeout=10` to `DATABASE_URL` (both `.env` and `.env.example`) to bound the Postgres connection pool.
- Admin Dashboard's clickable stat cards were checked against the original UX review's "keyboard-inaccessible `<div onClick>`" finding — already resolved by the external UI overhaul (commit `4087e14`), which rebuilt them as real `<button>` elements. No change needed.

**React 18.3.1 → 19.2.8** (`frontend/package.json`): clean bump, no source changes required — the app already used `createRoot`/`StrictMode`, zero usage of `propTypes`/`defaultProps`/`forwardRef`/`findDOMNode`/string refs/legacy Context anywhere in `frontend/src`. `react-router-dom`, `@react-oauth/google`, `@heroicons/react`, `vite-plugin-pwa` all confirmed React-19-compatible via their own `peerDependencies`. Verified via `npm run build` (clean) and a full Playwright-driven browser regression pass (login, all 6 admin pages, the custom `Modal` focus-trap logic, mobile viewport) — zero React-19-specific console warnings, report at `Agent Reviews/ux-reviewer/ux-reviewer_2026-08-01_17-15-19.md`.

**Express 4.19 → 5.2.1** (`backend/package.json`): also a clean bump — audited every route across all 7 route files for the known Express 5 breaking changes (wildcard/regex paths, `req.query` mutation, `app.del()`, `res.redirect(status, url)`, legacy `app.param(fn)`) and found none. The shared `asyncHandler` monkeypatch (`backend/src/utils/asyncHandler.js`, identical in all 7 route files) becomes redundant under Express 5's native promise-rejection-to-`next(err)` forwarding, but is harmless left in place — not removed, to keep this change isolated to the version bump. Verified via a full boot + route exercise (login, `/users/trainers` ordering against `/:id`, session/leave/resource/notification round trips, and the `validateIdParam` 400 path).

**Prisma 6.19 → 7.9.1** (`backend/package.json`, `backend/prisma/schema.prisma`, `backend/prisma.config.cjs` (new), `backend/src/db/db.js`): the one upgrade with real required changes, beyond what the initial audit predicted. Prisma 7 **removes the `datasource.url` field from `schema.prisma` entirely** — a driver adapter is now mandatory even for a plain, directly-reachable Postgres database. Changes made:
  - Removed three dead dependencies that were pre-existing cruft (flagged by the original code-health review, never cleaned up): `@neondatabase/serverless`, `@prisma/adapter-neon` (a stray Prisma-7-line package that predated this upgrade and was never wired into any code — `db.js` always used a plain `new PrismaClient()` against a local Postgres `DATABASE_URL`, not Neon), and `ws`.
  - Added `@prisma/adapter-pg` (the correct adapter for standard Postgres, not Neon's serverless one).
  - `schema.prisma`'s `datasource` block now reads just `provider = "postgresql"` (no `url`). Generator block (`provider = "prisma-client-js"`) left untouched — this legacy provider name is still supported in Prisma 7 and keeps CommonJS `require()` imports working unchanged, avoiding the new `prisma-client` provider's mandatory custom `output` path and ESM-first defaults.
  - New `backend/prisma.config.cjs` supplies `DATABASE_URL` to the Prisma CLI (`generate`/`migrate`) — the CLI no longer reads the connection string from `schema.prisma` itself.
  - `backend/src/db/db.js` now constructs `new PrismaPg({ connectionString: process.env.DATABASE_URL })` and passes it as `new PrismaClient({ adapter })`.
  - No new migration was needed — this is a tooling/client change, not a schema change.
  - Verified via: `prisma generate` succeeding cleanly, a full backend boot + route exercise (same set as the Express step), and a standalone throwaway script exercising the app's one `$transaction` call site (`sequences.js`'s build endpoint — array-form batch transaction, delete-then-recreate `SequenceItem` rows) plus a cascade-delete check, confirming the new engine/adapter behaves identically.

All three upgrades were done as isolated, independently-verified steps per a written plan (each with its own regression pass) rather than one combined change, so a regression in one would never be masked by another.

---

## 8. Contabo VM deployment — both dev and prod live

Oracle Cloud was dropped (capacity errors on the free-tier instance). A Contabo VM (Ubuntu 26.04 LTS, 4 vCPU, 7.8GB RAM) replaced it, set up as **two fully isolated environments on one VM**: dev (`tdev.onenessyoga.in`) and prod (`trainers.onenessyoga.in`), each with its own Postgres database, its own backend process/port, and its own git checkout.

**Architecture:**
- `/opt/oneness-yoga/dev/` — git checkout on the `dev` branch; `/opt/oneness-yoga/prod/` — checkout on `main` (fast-forwarded to match `dev`'s latest commit before deploying)
- Backend processes via PM2: `oneness-yoga-dev-api` on port 4000, `oneness-yoga-prod-api` on port 3000, both internal-only, reverse-proxied by Nginx
- Postgres: one instance, two databases (`oneness_trainers_dev`, `oneness_trainers_prod`) with dedicated least-privilege users (`oneness_dev_user`/`oneness_prod_user`), passwords generated as URL-safe hex (avoids the percent-encoding pitfall a slash/`@` in a generated password would otherwise cause in `DATABASE_URL`)
- Firewall (ufw): only 22/80/443 open; DB and backend ports are never exposed externally
- Both subdomains have valid Let's Encrypt certs (expire mid-November, `certbot.timer` handles auto-renewal) and are reachable over real HTTPS from the public internet

**Per-environment secrets are NOT shared** (fresh `JWT_SECRET`, fresh VAPID keypair per environment — push subscriptions are origin-bound anyway since dev/prod are different domains). Google/Resend credentials (`GOOGLE_CLIENT_ID`, `GOOGLE_SERVICE_ACCOUNT_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`) are shared across both, since they're the same external accounts. **`GOOGLE_SEQUENCES_FOLDER_ID` is deliberately NOT shared** — dev has its own dedicated Google Drive folder (separate from prod's), to avoid a repeat of the accidental real-trainer-exposure incident from §5.

**How it actually happened**: dev was deployed and verified first (initially over plain HTTP, since DNS hadn't propagated yet). DNS propagation, Certbot cert issuance, and — unplanned — a **full independent prod deployment** were then carried out directly on the VM by the user's team while dev verification was still in progress, rather than sequentially after dev sign-off as originally planned. A full audit was done afterward to confirm nothing was at risk: firewall was still clean (22/80/443 only), prod's `DATABASE_URL`/`FRONTEND_URL` pointed at the right places, and **prod's database was completely empty** (0 users, 0 of anything) — so no real data was ever exposed by the parallel setup.

**One real bug found and fixed during that audit**: prod's `backend/.env` had `GOOGLE_SERVICE_ACCOUNT_KEY` split across ~29 physical lines (base64 value reflowed by whatever editor was used to paste it in), which broke `dotenv` parsing — confirmed via a live error in the PM2 log (`Failed to initialize Google Sheets client... Unterminated string in JSON`). Fixed by rewriting the value back onto a single line (verified by decoding it and checking `client_email` matched) and restarting the backend; a corrupted backup was kept as `.env.bak-corrupted-<timestamp>` (chmod 600) in case anything needed cross-referencing. A one-time stale error in the same log (a push-subscription foreign-key failure against a now-nonexistent user) was investigated and is historical/inconsequential — consistent with the DB being empty at audit time.

**Also completed:**
- Google Cloud Console: `https://trainers.onenessyoga.in` and `https://tdev.onenessyoga.in` added as Authorized JavaScript origins on the OAuth Client. **No redirect URIs were added** — despite guidance the user received suggesting a `/api/auth/google/callback` redirect URI, this app's Google Sign-In (`POST /api/auth/google`, `backend/src/routes/auth.js:52`) verifies a client-side ID token via Google Identity Services; there is no server-redirect flow and no such route exists, so a redirect URI would never be used.
- Dev's own Google Drive folder created (`GOOGLE_SEQUENCES_FOLDER_ID=11FQcgqjyxzxY1dIL4j_Fs1FYWwlG-79T`, distinct from prod's `1cWsiP2yOf2E-lHsL3CbYVvczrRm1DTBv`) and wired into dev's `.env`, backend restarted, confirmed initializing without error.
- Both `/api/health` endpoints confirmed returning `200 ok` over real HTTPS from an external machine.

**Still open:**
1. Neither environment has been verified in an actual browser yet (PWA install, push notification opt-in, Google Sign-In end-to-end) — only API-level checks (`curl`) have been done so far now that HTTPS is live on both.
2. No prod admin account exists yet (DB is empty) — needs seeding before anyone can log into prod through the UI.
3. Sheet→DB two-way sync remains out of scope (§5), and the Drive-folder-permissions cleanup from §5 item 1 is still the user's to do.

**New deploy scripts** (in `deploy/`, superseding the old Oracle-specific `setup.sh`/`deploy.sh`/`nginx.conf`, left in place unused as reference): `contabo-vm-setup.sh` (one-time baseline), `contabo-deploy.sh dev|prod` (repeatable redeploy), `nginx-dev.conf`/`nginx-prod.conf` (HTTPS configs — note the live Nginx configs on the VM were ultimately produced by `certbot --nginx` modifying the initial HTTP-only configs in place, rather than these committed files being installed directly; they remain a correct reference for rebuilding from scratch). `deploy/keepalive.sh` (Oracle's idle-reclaim workaround) isn't needed on Contabo.

---

## 9. AI weekly schedule generator — Phase 1 (commit `623a180`)

First AI feature in the app, and explicitly Phase 1 of a larger planned "AI agent" roadmap: a single button, not a chat interface. Lives on the Sequence Creator's Sequences page only (`frontend/src/pages/sequence-creator/Sequences.jsx`) — "Generate AI Schedule" next to the existing "Assign Sequence" button.

**What it does**: on click, `POST /sequences/ai-schedule` computes next Monday–Saturday, pulls the real last-3-weeks of `Sequence` history from the DB, and asks an LLM (via OpenRouter) to propose a session-type for each of the 6 days, following a fixed 13-rule ruleset (1 mandatory Pilates/week, day-after-Pilates must be Restorative, exactly 1 Intense-tier session/week, a Surya/Chandra Namaskar mandate, spacing rules for "Yoga + Face Yoga" and "Yoga with property" sessions, no repeats within the week or into the next week, Pilates not on the same weekday in consecutive weeks, etc.). Logic lives in new `backend/src/utils/aiScheduler.js`.

**Deliberately a pure reference plan — no DB writes.** The result is just displayed in a read-only modal (day / date / session type). This was a direct decision, not an oversight: the `Sequence` model requires a mandatory `assigned_trainer_id`, and the rules imply multiple trainers can share one day's topic — decisions this tool doesn't make. The Sequence Creator still uses the existing "Assign Sequence" modal to create each real sequence, using the AI's plan as a guide. A "week-level default trainer with per-day override" idea was raised during planning but explicitly deferred as a separate future enhancement to the manual flow, unrelated to this button.

**Topic list**: cross-checked against `TopicSelect.jsx`'s existing 44-item dropdown — every session name in the rules' 3-tier list (Regular/Restorative/Intense) already exists there verbatim (it just groups by yoga-style there, not intensity), so no new topics needed adding anywhere. The intensity-tier categorization is new and lives only inside `aiScheduler.js`.

**LLM**: OpenRouter (OpenAI-compatible REST, plain `fetch` — no new SDK dependency), free-tier model, configurable via `OPENROUTER_MODEL`. **`OPENROUTER_API_KEY` is intentionally not set yet** — the user will add it separately. Until then, wired into the same defensive lazy-init pattern as every other optional integration (`mail.js`, `sheets.js`, `push.js`): the endpoint returns a clean `503 "AI scheduling is not configured yet"` instead of crashing. Rate-limited like login (`express-rate-limit`, 10 requests/15 min).

**Festivals (original rule 12, "flag festivals in a separate column")**: skipped entirely for Phase 1, by decision — no festival/holiday data source exists in this codebase, and building one was out of scope for this pass.

**Verified (initial pass)**: role-gating (`sequence_creator` only, 403 for others), the not-configured 503 path, and the full generate pipeline end-to-end via a mocked API response — confirmed the prompt correctly embeds the rules and real sequence history, markdown-fence stripping and JSON parsing work, and three deliberate failure cases (invalid topic name, malformed JSON, wrong entry count) are all correctly rejected.

**Daily 5-use-per-user limit added** (commit `ed428e3`): new `ai_schedule_logs` table logs each *successful* generation per user; `GET /sequences/ai-schedule/usage` reports `{used, remaining, limit}`, and `POST /sequences/ai-schedule` checks the count before calling the AI at all — short-circuits with `429` once hit, so a maxed-out user never wastes an API call. Day boundary resets at midnight IST via fixed UTC+5:30 offset math (no library needed, IST has no DST). Only successful generations count — a `503` or a thrown error never consumes quota. Certified by an independent fresh-context `ux-reviewer` pass (remaining-count display, failed-attempt-doesn't-consume-quota, role-gating via raw `curl`, no regression to the rest of the page) before being deployed to the dev VM.

**Real key added and first live generation** (`OPENROUTER_API_KEY` + `OPENROUTER_MODEL` set directly on the dev VM, not committed): first real end-to-end generation succeeded using `nvidia/nemotron-3-ultra-550b-a55b:free` — manually checked the 6-day output against all 13 rules and it was fully compliant (exactly 1 Pilates, the following day correctly Restorative, exactly 1 Intense-tier session, the Namaskar mandate present, zero repeats).

**Reliability bugs found via real production testing, fixed in commit `7b9b925`**: two real issues surfaced once actual OpenRouter calls were flowing:
1. Nemotron Ultra is a *reasoning* model — it occasionally spent its whole token budget on internal chain-of-thought and returned an empty final `content` field. Fixed with an automatic single retry when content comes back empty.
2. A slow response exceeded nginx's default 60s `proxy_read_timeout`, so the client saw a `504` — but our backend kept running server-side and finished successfully *after* the user had already given up, silently consuming one of their 5 daily uses for a result they never saw. Fixed by (a) bounding each OpenRouter attempt with a 60s `AbortController` timeout instead of waiting indefinitely, and (b) raising nginx's `proxy_read_timeout`/`proxy_send_timeout` to 150s for `/api/` — comfortably above the ~120s worst case (two bounded 60s attempts) — applied to the live dev VM config and the committed `deploy/nginx-prod.conf` template. The wasted quota slot was manually restored for the affected test account.
3. Switched the default/dev model to `google/gemma-4-31b-it:free` — a plain instruction-tuned model rather than a reasoning model, since Nemotron Ultra's original default (`meta-llama/llama-3.3-70b-instruct:free`) is no longer even in OpenRouter's live free-tier catalog, and a non-reasoning model avoids the empty-content failure mode for this bounded, rule-following, JSON-output task entirely. Real-output validation for the new model is still pending (blocked by the rate limit below at time of writing) — `openai/gpt-oss-20b:free` is the documented fallback if it underperforms.

**OpenRouter's own free-tier rate limit**: confirmed 50 requests/day for a non-funded (zero credit balance) OpenRouter account — this is a hard cap **on the whole API key, account-wide**, not per-app-user. It's separate from and in addition to this app's own 5/day-per-user limit above. During the reliability-testing session above, this cap was hit and correctly surfaced as a distinct, fast `502` (`OpenRouterRateLimitError`, added in the same `7b9b925` fix) rather than a hang or a confusing generic error — quota was correctly not consumed by this case either. In practice, the app's own per-user limit keeps normal usage well under 50/day even with a few active sequence creators; the day this was hit was driven by diagnostic testing calls made directly against the API, not real app usage. Adding a small credit balance to the OpenRouter account raises this ceiling substantially, per their docs, if more headroom is ever needed.

**Better error messages, found via more live testing** (commits `94ed3a0`, `7664028`): the 429 handler was showing a generic static string regardless of the actual reason — now parses the response body and surfaces OpenRouter's real upstream message (e.g. distinguishing a transient, model-specific "temporarily rate-limited upstream, retry shortly" shared-pool throttle from the account's own daily cap). Separately, OpenRouter sometimes proxies an upstream provider failure (e.g. "Nvidia: Service temporarily overloaded") as an HTTP 200 response with an `error` field instead of `choices` — this fell through silently to the generic "no content" path before; now detected and surfaced directly regardless of HTTP status. **Model in dev is currently set to `nvidia/nemotron-3-ultra-550b-a55b:free`** (switched back from Gemma after user request) — both this and Gemma have been observed hitting transient free-tier provider issues during testing (Nvidia overload, Google AI Studio shared-pool throttle), which is expected/normal for free-tier capacity, not a bug; the improved error messages make it clear when this is happening.

**Phase 1.5 — AI plan can now be turned into real sequences** (commit `b3994de`): the "pure reference plan, no DB writes" decision from Phase 1 has been superseded now that a real generation was validated end-to-end. New `POST /sequences/bulk` (`sequence_creator` only), mirroring the established `sessions.js` bulk-create pattern (batch-validates all referenced trainers in one `findMany` to avoid N+1, then a single `prisma.sequence.createMany` — one atomic INSERT, naturally all-or-nothing with no explicit transaction needed). The AI Schedule Suggestion modal is no longer a read-only table — it's now an editable form: a "Default Trainer For The Week" selector fans a chosen trainer out to all 6 rows, each row independently overridable (topic via the existing `TopicSelect`, trainer via its own dropdown) before confirming with "Create All Sequences". The earlier "week-level default trainer with per-day override" idea (raised and explicitly deferred during Phase 1 planning) is exactly what got built here.

Verified directly against the real backend (happy path, atomic rejection on an invalid trainer id with nothing partially created, `super_admin` correctly 403'd), independently re-verified by a second pass with a different mixed-trainer payload, and code-reviewed line-by-line against the spec. **Still not yet verified**: an actual live browser/DOM click-through of the editable modal itself (Playwright automation was unavailable in-session across every attempt this work), and real-output validation specifically for `google/gemma-4-31b-it:free` (both blocked by transient free-tier provider issues at time of writing).

**Backdating guard** (commit `6514392`): Sequence Creator can no longer create a sequence dated more than 7 days in the past, enforced server-side (authoritative) via `assertNotBackdated()` in both `POST /` and `POST /bulk`. Super Admin is exempt on the shared single-create endpoint (may need to backfill/correct older entries) — the check only runs when `req.user.role === 'sequence_creator'` there, and unconditionally on `/bulk` since that endpoint is already sequence-creator-only. Also added a `min` attribute to the Sequence Creator's own date picker for immediate browser-native feedback; Admin's form is untouched. Verified directly: exactly 7 days back allowed (boundary), 8+ days back rejected, Super Admin can still backdate 30 days, and the bulk endpoint rejects the whole batch if any single day violates the rule.

---

## 10. Multi-role support — a user can hold any combination of the 3 roles

Previously `User.role` was a single scalar (`super_admin` | `sequence_creator` | `trainer`), so a person who was e.g. both a Trainer and a Sequence Creator needed two separate accounts and could only ever see one set of screens per login. This replaces the single scalar with `User.roles Role[]` and merges routing/nav so one login shows the union of every role's screens.

**Migration** (`20260820111315_add_multi_role_support`, non-destructive): added `roles` column, backfilled each row from its old `role` value (`ARRAY["role"]::"Role"[]`), then dropped `role`. Verified locally that every existing user's `roles` array matched their prior single role exactly before/after.

**Backend**: JWT payload and all API responses now carry `roles: [...]` instead of `role`. `requireRole(...allowed)` in `backend/src/middleware/auth.js` now checks whether the user's role set intersects the route's allow-list, via a new shared `getUserRoles()` helper. Every `where: { role: 'trainer' }`-style filter (trainer dropdowns, admin-notify lists, Google Sheet trainer-share list) became `where: { roles: { has: 'trainer' } }`. Inline role-conditional business logic was re-derived carefully rather than blindly swapped to `.includes()` — notably: the sequence-creator backdating guard (§9) still exempts anyone who *also* holds `super_admin`, and the trainer-only session-detail ownership restriction only applies when trainer is a user's *sole* relevant role (someone who's also `sequence_creator` or `super_admin` isn't newly locked out of sessions they could already see).

**Rollout safety**: real users had live 7-day JWTs in the old `{ role: '...' }` shape at deploy time. `getUserRoles()` falls back to treating a singular `role` claim as a 1-element array, so already-issued tokens keep working without forcing anyone to re-login. This fallback is temporary — `// TODO(remove after 2026-08-27)` markers are in `middleware/auth.js`, safe to delete once every pre-migration token has expired.

**Frontend**: the three separate layouts (`AdminLayout`, `TrainerLayout`, `SequenceCreatorLayout`) were replaced with one `AppLayout`. `App.jsx` builds its route tree by merging each active role's routes in a fixed precedence (`trainer` → `sequence_creator` → `super_admin`, later wins on a path collision — e.g. Admin's full-CRUD `/sequences` wins over Trainer's read-only version for any admin combination); `AppLayout`'s bottom nav is merged the same way via `frontend/src/config/nav.js`, and the header shows all active role labels joined with " + ". Admin's user create/edit form (`Trainers.jsx`) now uses checkboxes instead of a single role `<select>`.

Verified directly against the local backend: a user promoted to `roles: ['trainer', 'sequence_creator']` passed both a trainer-gated and a sequence_creator-gated endpoint on the same token, appeared in the trainer dropdown, and was still correctly rejected for backdating; a `super_admin` + `sequence_creator` combo user was correctly exempted from the backdating guard; a manually-signed old-shape token (`role: 'trainer'`, no `roles`) still authenticated successfully via the fallback. Frontend `npm run build` is clean with zero remaining `.role` references. **Not yet verified**: live browser/DOM click-through of the merged nav for a multi-role account (Playwright unavailable in-session, consistent with prior attempts — see §9's known gaps).

---

## 11. Session-type images in the topic picker and sequence detail

The user supplied 45 AI-generated poster images (one per session/topic, dropped into a local `Sequences Images/` folder — not committed, listed in `.gitignore` since originals average ~2.6MB each at 2048×2048). Each was visually inspected, matched against the real topic list in `frontend/src/components/TopicSelect.jsx` (not the narrower 32-item catalog used by the AI scheduler in §9 — that was an initial false start, corrected after discovering `TopicSelect.jsx`'s ~60-entry `TOPIC_GROUPS` is what's actually used app-wide), and renamed to match. One image's baked-in text was wrong ("Yoga - Stretching" on what was actually meant to be the Strengthening poster) — fixed in-place with a Python/Pillow script that repaints the text region using the surrounding gradient color (sampled per-row, since the background is a vertical-only gradient) and redraws the correct text. `Holiday.png` (generic, no specific holiday) is duplicated for both "Festival Holiday" and "National Holiday".

All 45 were resized (max 480px) and re-encoded as JPEG (~10-25KB each, down from ~2.6MB) into `frontend/public/session-images/<slug>.jpg` — using `.jpg` deliberately, since the service worker's precache glob (`vite.config.js`) only matches `png`, keeping these out of the PWA's install-time precache (loaded on-demand instead, appropriate since a user rarely views more than a few topics per session). `frontend/src/config/sessionImages.js` maps each exact topic string to its slug; `getSessionImageUrl(topic)` returns `null` for topics without an image (not every topic in `TOPIC_GROUPS` has one).

Wired into two places: `TopicSelect.jsx` shows a 28px thumbnail next to each dropdown option and a 24px thumbnail in the trigger once a topic is selected; the shared `SequenceDetail.jsx` (used by all three roles) shows a full-width hero image above the topic heading when one exists.

Verified: `npm run build` clean, all 45 manifest slugs cross-checked 1:1 against files on disk, `vite preview` HTTP-served a sample of the images successfully.

**Follow-up** (commit `8f99129`): thumbnails extended to every place a sequence/session is listed, not just the picker/detail page — a new shared `SessionThumb` component (wraps `getSessionImageUrl`, renders nothing if unmapped) was added to all three Sequences list pages, all three Sessions views (admin list, trainer's My Sessions, Completed Sessions' table), both roles' dashboard "today's sessions" cards, and the session detail hero image. Also switched Admin's "Session Type" field from a free-text `<input>` (defaulting to the untracked string `"BKP"`) to the same `TopicSelect` dropdown sequences use, so newly-created sessions actually store a topic the thumbnail map recognizes — existing/`"BKP"` sessions simply show no thumbnail, same graceful fallback as any unmapped topic.

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

## 12. Install-to-home-screen button

Added a custom "Install App" control since the browser's own install UI (Chrome's address-bar icon, the mini-infobar) is easy to miss. `frontend/src/hooks/useInstallPrompt.js` captures the `beforeinstallprompt` event once (`e.preventDefault()`) and replays it on demand via `promptInstall()`; it exposes `installed` (checked via `matchMedia('(display-mode: standalone)')` plus the legacy `navigator.standalone` for iOS) so already-installed users never see the button, and listens for `appinstalled` to hide it immediately post-install without a page reload.

iOS Safari never fires `beforeinstallprompt` - there is no programmatic install API there, only Share -> "Add to Home Screen". `InstallAppButton.jsx` detects this case (`needsManualIosSteps`) and shows a small instructions modal instead of a broken button. Wired in two places: a header icon button (`AppLayout.jsx`, next to the notification bell) for logged-in users, and a text button under the login card (`LoginPage.jsx`) so first-time visitors can install before ever signing in.

**Known limitation, by design of the web platform (not a gap to fix here):** there is no way for a website to force an already-installed PWA to open instead of a browser tab when its URL is visited. That behavior is entirely OS/browser-controlled - on Android it requires wrapping the PWA as a Trusted Web Activity, publishing it to the Play Store, and hosting a Digital Asset Links file for verification (a materially bigger project than the web app itself); iOS Safari has no equivalent mechanism at all for PWAs; desktop has none either. Flagged to the user as a real platform constraint rather than attempted.

**Bug fix** (commit `dd034f6`): the button didn't appear at all on first live testing, even in a normal (non-incognito) window. Root cause: `beforeinstallprompt` fires at most once per page load, but the event was captured into that one component's local React state - since this is a single-page app, logging in unmounts the login page (which may have captured it) and mounts the dashboard fresh, with no new page load to re-fire the event, silently losing it. Fixed by moving the capture to module scope in `useInstallPrompt.js`, shared across every component that calls the hook regardless of which screen is mounted when the event actually fires.

---

## 13. Responsive width for content-heavy modals (commit `f0662a6`)

The shared `Modal` component hard-capped every modal at `max-width: 480px`, which is right for simple single-field forms but squeezed the Build Sequence table (Exercise/Remarks/Reference columns) and the AI Schedule Suggestion review (per-day topic/trainer table) into the same cramped width even on a laptop. Added an opt-in `size="lg"` prop (`.modal--lg`, 800px max-width) used only by those two table-shaped modals; every other modal (Add Trainer, Add Session, leave forms, etc.) keeps the compact default. Mobile is unaffected either way, since `width: 100%` on `.modal` already caps it to the viewport regardless of the max-width ceiling.

---

## 14. Recurring session schedule + backup trainer assignment

Super Admin no longer has to create every session by hand. A new `SessionTemplate` model (`backend/prisma/schema.prisma`) holds 8 fixed slots — Monday–Friday's 6 sessions (5:15 AM, 6:15 AM, 9:30 AM, 10:30 AM, 11:30 AM, 5:00 PM) and Saturday's 2 (6:00 AM, 11:30 AM) — each with a `weekdays Int[]` column (`Date.getDay()` convention) saying which days it applies to, rather than one row per day (8 rows total, not 42). A new `backend/src/utils/sessionGenerator.js` keeps the next 14 days of real `Session` rows populated from the active templates, run once on server boot (`backend/src/index.js`, so a restart never leaves a gap) and daily at 00:15 IST via a new `node-cron` dependency. It's idempotent by construction — matches on the existing `(scheduled_date, scheduled_time)` pair and never touches a row that already exists — which is also what makes editing a template's dedicated trainer apply only to sessions generated after the edit, never retroactively (verified directly: changing a slot's trainer and re-running left already-generated sessions with their original trainer untouched, while newly-generated dates picked up the change). Super Admin manages the 8 slots from a new "Weekly Schedule" tab on the Sessions page (`frontend/src/components/WeeklySchedule.jsx`, backed by a new `backend/src/routes/sessionTemplates.js` - `GET`/`PUT` only, no create/delete since the 8 slots are fixed).

Separately, Super Admin can now assign a **backup trainer** to any individual session (`PATCH /sessions/:id/backup`) without removing the original assignment — both stay linked to the session. The backup trainer can act on it exactly like the dedicated trainer (see it in their own session list, add notes, mark it complete - `GET /sessions/my`'s filter widened to an `OR` on `assigned_trainer_id`/`backup_trainer_id`, plus the three ownership checks on `GET /:id`, `PATCH /:id/complete`, `PATCH /:id/notes`), while the dedicated trainer still sees the session, now showing "Covered by X". Assigning a backup (not clearing one) sends both people an in-app notification and an email (`sendBackupAssignedEmail`, new in `backend/src/utils/mail.js`) - each recipient's email is independently sent and caught rather than batched, so one failure can't silently swallow the other's (the `Promise.all` pattern already used elsewhere in this codebase for admin-notify lists doesn't have that property, which is why a plain `Promise.all` was deliberately avoided here).

`GET /sessions/my` also now returns a computed `viewer_role: 'assigned' | 'backup'` per row so the frontend doesn't have to re-derive it - shown as a "Backup" badge in `MySessions.jsx`, `trainer/Dashboard.jsx`, and a "you're covering this session as backup" banner in `SessionDetail.jsx`; the dedicated trainer's own view shows "Covered by {name}" instead. Admin's session list and dashboard show the backup trainer's name inline once assigned.

**Caught and fixed in passing**: `sessions.js`'s `PATCH /:id/complete` and `PATCH /:id/notes` handlers called `notifyUsers(...)` without it ever being imported (only `notifyUser` was) - a pre-existing `ReferenceError` that would have thrown every time a trainer completed a session or added notes, silently swallowed by the route's existing `asyncHandler` wrapper turning it into a 500. Fixed as part of this pass since both handlers were already being touched for the backup-trainer ownership check.

Verified end-to-end against the local dev DB: migration applied cleanly, all 8 template rows seeded and returned correctly split into Mon–Fri/Saturday groups, generator produces exactly the right slots per weekday (Sundays skipped, Saturday gets only its 2) and is a true no-op on a second run, `is_active: false` correctly excludes a slot from future generation, `PATCH /:id/backup` rejects `backup_trainer_id === assigned_trainer_id`, notification rows created for both parties, and access-control checks (`GET /:id`, notes, complete) pass for the backup trainer and correctly 403 for an unrelated third trainer. `npm run build` clean. **One live-testing note**: `RESEND_API_KEY` was configured in the local `.env` used for this verification, and the two test trainer accounts happened to have real inboxes (per earlier notes in this log) - so two real "Backup Trainer Assignment" emails went out about a fake test session during verification. Caught immediately and no further email-triggering tests were run locally; flagged to the user at the time.

---

## 15. Default trainer assignment + per-session Assign action (2026-08-23)

Two gaps surfaced once §14's recurring schedule was actually used: newly-generated sessions had no trainer at all until someone manually set one, and there was no way to change the trainer on an already-generated session (only at creation time, and templates only affect future generation, not existing rows).

- **Per-session override**: a new "Assign" button on the admin Sessions list (`frontend/src/pages/admin/Sessions.jsx`), using the existing `PUT /sessions/:id`, for one-off corrections to an already-generated session.
- **Default trainer assignment**: each trainer's edit/add form on the Trainers screen (`frontend/src/pages/admin/Trainers.jsx`) now lists the 8 schedule slots as a "Default Sessions" checklist, writing straight to `SessionTemplate.dedicated_trainer_id` (the same field the Weekly Schedule tab edits). Setting a slot's default trainer (from either screen) now **automatically backfills** any already-generated sessions for that slot that are still Unassigned (`backend/src/routes/sessionTemplates.js`'s `PUT /:id`) — it only fills genuine gaps (`assigned_trainer_id: null`), never touches a session that already has someone assigned, so the "template edits don't retroactively change existing sessions" rule from §14 still holds for anything that was ever explicitly assigned.
- Both the Weekly Schedule tab and the Trainers screen's checklist now show a `window.confirm()` before reassigning a slot's default away from whoever currently holds it, and the per-session Assign modal now states explicitly it only affects that one session — added after initial confusion about why a default-trainer change "didn't seem to do anything" (traced to a missing confirmation, not a persistence bug — verified directly against the live dev DB that the reassignment itself was always working).

Verified locally and against the live dev DB: backfill correctly fills only null `assigned_trainer_id` rows and leaves already-assigned ones untouched across a simulated two-step reassignment.

---

## 16. Real app icon and logo (2026-08-23)

Replaced the placeholder lotus-emoji favicon/PWA icon with the real Oneness Yoga logo. The uploaded logo (coral background, "ONENESS YOGA" wordmark, lotus/meditating-figure mark) is a single square image, so different crops were used for different display sizes:

- **Favicon / PWA install icon / apple-touch-icon**: cropped to just the lotus/figure mark (no text) — generated with `sharp` (new frontend devDependency) at 64×64, 180×180, 192×192, and 512×512 from the source image, replacing the old hand-written SVGs in `frontend/public/` and the `manifest.icons` entries in `vite.config.js`.
- **Login page and app header**: use the full logo (with wordmark), per explicit request, since it reads fine at the login page's 72px size. The header icon had to be enlarged from the emoji's original 26px to 44px (the largest that fits the 52px header) since the full logo's text was illegible at 26px — checked by literally rendering the image at both candidate sizes before picking one, not by guessing.

The full-resolution source logo lives at `frontend/public/oneness-yoga-logo.png`, downscaled to 300×300 (it's never displayed larger than 72px) to keep it light.

---

## 17. Code-health review and fixes (2026-08-23)

Ran the `code-health-reviewer` agent for a full (not diff) codebase audit — report at `Agent Reviews/Code-Health-Reviewer/code-health-reviewer_2026-08-23_10-17-29.md` (19 findings: 4 High, 9 Medium, 6 Low). Fixed the real bugs, dead code, and safe/contained refactors; deliberately left the larger structural duplication (see below) untouched.

**Fixed:**
- Removed dead `POST /api/sessions/bulk` (no caller anywhere — superseded by §14's generator).
- Extracted duplicated trainer-existence validation (`sessions.js`, `sequences.js`, `sessionTemplates.js`) into `backend/src/utils/trainers.js`.
- Collapsed `mail.js`'s four repeated "resend not configured" guard + send blocks into one `sendEmail()` helper.
- Fixed `PUT /users/:id`: unlike `POST /users`, it never lowercased/trimmed the email or checked for an existing duplicate — an admin could create a case-variant duplicate account that becomes permanently unreachable at login (since `auth.js` always lowercases on sign-in), or hit a raw unhandled Prisma unique-constraint error instead of a friendly 409.
- Dropped 2 unused exports from `aiScheduler.js`; documented that its topic list is a deliberate subset of `TopicSelect.jsx`'s full list (tied to the AI's sequencing rules), not an oversight to "fix" by duplicating it.
- `admin/Leaves.jsx`'s `review()` had no try/catch, unlike every sibling mutation handler — a failed review request left the modal stuck open with no feedback.
- `Notifications.jsx`'s `markAllRead()` showed a success toast unconditionally, even when the request failed.
- `NotificationBell.jsx` now uses the existing `usePolling` hook instead of its own hand-rolled interval + visibilitychange listener.
- Bumped `axios` 1.17.0 → 1.19.0 via `npm audit fix` (in-range, no breaking change) — fixes 10 high-severity advisories.

**Deliberately not touched** (real findings, but bigger refactors or the removal date hasn't arrived — not urgent bugs): duplicated `AdminSequences.jsx`/`sequence-creator/Sequences.jsx` page components (~85% shared code), duplicated Assign/Backup modal logic in `admin/Sessions.jsx`, duplicated breadcrumb/folder-browsing logic between `admin/Resources.jsx` and `trainer/Resources.jsx`, a generic relation-flattening serialization helper, the `resources.js` breadcrumb N+1 query pattern, the legacy singular-role JWT fallback in `auth.js` (self-documented removal date of 2026-08-27 hadn't passed yet), and major dependency version bumps (`bcryptjs`, `dotenv`, `google-auth-library`, and the `vite`/`react-router` bumps `npm audit fix --force` would require).

Verified locally before deploying: all trainer-validation call sites still 400 on an invalid trainer id and succeed on a valid one, the dead route 404s, the email-uniqueness fix correctly rejects exact and case-variant duplicates while a same-email or unrelated-field update still succeeds, both frontend and backend builds clean.

---

## 18. Prod deployment: `main` caught up to `dev` (2026-08-23)

`main` had been frozen at `209726c` (the initial Contabo deployment) since 2026-07-19 while all of §9 through §17 shipped to dev-only — 31 commits, 118 files. Merged `dev` into `main` (clean fast-forward, no divergent commits) and deployed the whole span to prod in one pass, at the user's explicit request:

1. `pg_dump` backup of the prod DB taken first (`oneness_trainers_prod_pre_main_merge_<timestamp>.sql` on the VM).
2. `git checkout main && git pull` on `/opt/oneness-yoga/prod`.
3. `npx prisma migrate deploy` applied the 3 migrations prod was missing (`add_ai_schedule_logs`, `add_multi_role_support`, `add_session_templates_and_backup_trainer`) cleanly.
4. Seeded the 8 fixed weekly-schedule slots (same seed used for dev in §14) — prod's `session_templates` table was empty since the feature had never run there.
5. Backend + frontend `npm install`, `npx prisma generate`, `npm run build`, `pm2 restart oneness-yoga-prod-api`.

Verified against the live prod domain (`trainers.onenessyoga.in`) after restart: frontend serving the correct new bundle (checked for the "Default Sessions" string), `GET /api/session-templates` reachable and correctly 401s without auth, `POST /api/sessions/bulk` now 404s (dead route removed, confirmed on both dev and prod), and the session generator's startup run populated 64 real `Session` rows for the rolling 14-day window on the first boot (confirmed via `psql` row count) - matching dev's behavior exactly.

**Known gap carried over to prod**: `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` are not set in prod's `.env` (dev has them), so the AI weekly-schedule generator (§9) is live in code but returns `503 AI scheduling is not configured yet` on prod until those are added - it fails gracefully, not a crash. Every other feature shipped since `main`'s last update (multi-role support, AI scheduler *infrastructure*, sequence-builder + Sheets sync improvements, session-type thumbnails, install-to-home-screen button, responsive modals, recurring schedule + backup trainer, default trainer assignment, the real app icon, and the code-health fixes in §15-17) is now live on prod using the same production `RESEND_API_KEY`/Google credentials/DB already configured there — meaning email sends (welcome, Google-link, backup-assignment) now go to real prod users, as intended for a production environment.

---

## 19. Self-service Forgot/Reset Password (2026-08-23)

The only password-reset path that existed was admin-triggered (`PUT /users/:id/reset-password`) - a trainer locked out of their own account had no way to recover without asking a super_admin. Added the standard email-link flow:

- New `PasswordReset` model (`user_id`, unique `token`, `expires_at`, `used_at`) - a separate table rather than fields on `User`, so a user can have reset history and multiple outstanding tokens without overloading the user row.
- `POST /auth/forgot-password` (public, rate-limited to 5/15min like the existing login limiter): looks up the email, and **if and only if** a matching active user exists, creates a token (`crypto.randomBytes(32)`, 1 hour expiry) and emails a reset link via a new `sendPasswordResetEmail` (`backend/src/utils/mail.js`, using the shared `sendEmail` helper from §17). Returns the exact same `{ success: true }` response whether or not the email matched an account, so the endpoint can't be used to check which emails have registered accounts.
- `POST /auth/reset-password` (public): validates the token exists, is unused, and hasn't expired, then updates the password and marks the token used in a single `$transaction` (so a crash between the two can't leave the token burned with the password unchanged, or vice versa).
- Frontend: a "Forgot password?" link on `LoginPage.jsx`, plus two new pages - `ForgotPasswordPage.jsx` (email in, generic "check your email" out) and `ResetPasswordPage.jsx` (reads `?token=` from the URL, new password + confirm, calls the reset endpoint) - both public routes added to `App.jsx`'s logged-out route branch (previously a bare wildcard straight to `LoginPage`).

Verified locally end-to-end without triggering any real email (started the backend with `RESEND_API_KEY` blanked so the send call takes its "not configured" branch instead, per the standing caution around real trainer inboxes in local `.env` - see §14): forgot-password returns the identical response for a real vs. nonexistent email and only creates a token row for the real one; reset-password 400s on a bogus token, 400s on a too-short password, 200s on the valid token, then 400s again if that same token is replayed; and the account's old password stopped working and the new one logged in successfully immediately after.

---

## 20. Must-change-password on first login / after an admin reset (2026-08-23)

Scoping this out surfaced a real gap: `PUT /me/password` (self-service password change) already existed on the backend, but no frontend page had ever called it - a logged-in trainer had no in-app way to change their own password at all (only the just-built forgot-password email flow, or asking an admin to reset it for them).

- New `User.must_change_password` boolean (default `false`). Set to `true` whenever an admin creates an account (`POST /users`) or resets someone's password (`PUT /users/:id/reset-password`); cleared back to `false` by any of the three ways a user can set their own password afterward - `PUT /auth/me/password` (the new in-app change-password page), `POST /auth/reset-password` (§19's forgot-password flow), or naturally never set in the first place for a normal self-driven signup path (there isn't one - all accounts are admin-created, so this only ever starts `true`).
- `POST /auth/login` and `POST /auth/google` now return `must_change_password` on the `user` object (there's no separate `/auth/me` re-fetch on app boot - `AuthContext` reads the login response once into `localStorage` - so the flag has to travel in that response to be visible to the frontend gate).
- `App.jsx`: when `user.must_change_password` is true, every route is replaced with a new `ChangePasswordPage` (current + new + confirm password, calls `PUT /auth/me/password`, then `updateUser({ must_change_password: false })` to unblock immediately without a re-login) until they set their own password. This is the first real caller of `AuthContext`'s existing `updateUser` helper, which had been dead code since it was added.

This is a frontend-enforced gate, not a backend-enforced one - the API itself doesn't reject other requests while the flag is true (matching how role-based page access already works in this app: `requireRole` protects the actual data per-route, but "which pages you can navigate to" is a frontend concern). Worth revisiting as a stricter backend-side block later if that matters more than the added complexity of an allowlist middleware.

Verified locally end-to-end: a freshly admin-created account logs in with `must_change_password: true`; changing the password via the new endpoint flips it to `false` and a fresh login confirms it; a super_admin resetting that same user's password flips it back to `true`, proving the flag correctly re-arms on every admin-initiated credential handout, not just at account creation.

**Bug found in user testing, fixed same day**: entering the wrong current password on the new `ChangePasswordPage` didn't show an error - it silently kicked the user back to the login screen instead (password correctly left unchanged, but with no explanation why). Root cause: `PUT /auth/me/password` returned `401` for "current password is incorrect," but `frontend/src/api/client.js`'s global axios interceptor treats *any* `401` as "the session/token is invalid" and force-logs-out to `/login` - it has no way to distinguish that from a plain wrong-value-in-a-field error, since by definition the request was already authenticated (the JWT itself was fine). Changed the status to `400`, consistent with every other validation failure in that same handler ("Both passwords required", "Password must be at least 8 characters"). Verified: wrong current password now returns 400, the password is left unchanged, and the account's real password still logs in correctly - the interceptor never fires, so the user now sees the actual error message and stays on the page to retry.

---

## 21. Header logo now links home; login always lands on the dashboard (2026-08-23)

Two small navigation fixes:

- The top-left logo/app name in `AppLayout.jsx` was static text - clicking it did nothing. Wrapped it in a `Link to="/"`, matching the standard "logo goes home" convention used across virtually every app.
- A reported regression of the earlier "redirect to home on fresh boot" fix (`df05799`): that fix only handles a genuine fresh page load (new tab, PWA relaunch) via a `sessionStorage` flag that's set once per JS load and never fires again. It does **not** cover logging out and logging back in **within the same tab/session** (no reload) - the browser URL doesn't reset on logout, so if you log out from, say, `/sequences` and log back in, the router just re-renders whatever page matches that still-stale `/sequences` URL, since nothing had ever explicitly navigated to `/` on a successful login. Fixed by calling `navigate('/', { replace: true })` right after a successful `login()` or Google sign-in in `LoginPage.jsx`. This also incidentally fixes the same stale-URL problem for the §20 must-change-password gate (which renders under a wildcard route regardless of path, so once the flag clears the URL is now correctly `/` rather than wherever it happened to be at login time).

---

## 22. Session titles reflect the day's assigned sequence topic (2026-08-23)

`Session` and `Sequence` were (and still are) unrelated models - a Session is a recurring generated time-slot, a Sequence is the day's assigned practice topic. Sessions always displayed the generic "Daily Session" title regardless of whether a Sequence existed for that date. Per explicit instruction, the match is by **date alone, irrespective of trainer** - if any Sequence exists for a given `scheduled_date` (regardless of which trainer it's assigned to), every Session on that date shows that Sequence's `topic` as its title instead of "Daily Session"; dates with no Sequence are unaffected.

Implementation is entirely in `backend/src/routes/sessions.js`'s serialization layer - a new `getSequenceTopicByDate(dates)` batch-queries `Sequence` for the distinct dates being returned (one extra indexed query per request, not N+1) and builds a `date -> topic` map; `serialize()`/`serializeWithZoom()` now overlay that onto the session's own `title` field before it's ever sent to the frontend. This covers `GET /`, `GET /my`, `GET /completed`, and `GET /:id` in one change - no frontend edits needed, since every page already just renders whatever `title` the API returns. If two Sequences somehow land on the same date, the earliest-created one wins (arbitrary but deterministic - this is expected to be rare/non-existent in practice, one topic per day).

Verified locally: a session on a date with no sequence still shows "Daily Session"; creating a sequence on that date for a *different* trainer than the session's own trainer immediately flips the session's title to the sequence's topic, confirmed via both the list endpoint and the single-session endpoint; deleting the sequence and session cleaned up.

---

## 23. Phase 1 complete — prod deployment (2026-08-23)

`main` caught up to `dev` again (§16-22: real app icon/logo, default-trainer assignment + backfill, code-health fixes, Forgot/Reset Password, must-change-password on admin-created/reset accounts, the login-redirect and clickable-logo fixes, and sessions reflecting the day's sequence topic) and deployed to prod in one pass, marking Phase 1 complete.

1. `pg_dump` backup of the prod DB first (`oneness_trainers_prod_pre_phase1_final_<timestamp>.sql`).
2. `git checkout main && git pull` on `/opt/oneness-yoga/prod`.
3. `npx prisma migrate deploy` applied the 2 pending migrations (`add_password_resets`, `add_must_change_password`) cleanly.
4. Backend + frontend `npm install`, `npx prisma generate`, `npm run build`, `pm2 restart oneness-yoga-prod-api`.

Verified live against `trainers.onenessyoga.in`: correct new bundle serving (checked for "Forgot password" and "Set a New Password" strings), `POST /api/auth/forgot-password` reachable and giving the no-enumeration response, `GET /api/session-templates` still correctly 401s without auth, `POST /api/sessions/bulk` still 404s. No errors in PM2 logs after restart.

---

## 24. My Profile page - view/edit name, Zoom link, email, and password (2026-08-23)

Auditing Phase 1 surfaced a real gap: there was no "My Profile"/"My Account" page anywhere in the app, for any role. `PUT /auth/me` (name/zoom_link) and `PUT /auth/me/password` already existed on the backend, but no frontend page ever called either one outside the forced must-change-password flow (§20) - a trainer or sequence_creator had no way to see or edit their own account at all, and nobody could change their own email under any circumstances.

- New `ProfilePage.jsx`, reachable by every role via a new profile icon in the app header (`AppLayout.jsx`, next to the notification bell and logout button) and routed at `/profile` in `App.jsx` (outside the per-role route tables, since it applies to everyone regardless of role).
- Three sections: **Profile** (name + Zoom link, `PUT /auth/me`), **Change Email** (`current_password` + `new_email`, new `PUT /auth/me/email`), **Change Password** (`PUT /auth/me/password`, the same endpoint the forced first-login flow uses, now also available voluntarily at any time).
- Email change requires the current password, same as the password-change endpoint - since email is both the login identifier and the forgot-password recovery target, a merely-authenticated session shouldn't be able to silently redirect account recovery to an attacker's inbox. Reuses the same normalize/409-on-duplicate pattern already used in `POST /users` and admin's `PUT /users/:id`.

**Bug found and fixed while building this**: `PUT /auth/me` computed its zoom_link fallback from `req.user.zoom_link` (the JWT payload) - but the JWT has never carried `zoom_link` at all, so that fallback was always `undefined`, meaning *every* call to this endpoint silently wiped zoom_link to `null` whenever the caller didn't resend it (which nothing ever did, since nothing called this endpoint before now). Fixed by fetching the user's current values from the DB instead of trusting the JWT payload for anything beyond `id`.

Verified locally: updating just the name via `PUT /auth/me` leaves an existing zoom_link untouched (confirmed via `GET /auth/me`); email change 400s on a wrong password, 409s on an email already in use, and 200s + immediately works for login on a fresh unique email (normalized/lowercased) while the old email correctly stops working.

---

## 25. WhatsApp number field, for future WhatsApp integration (2026-08-23)

New `User.whatsapp_number` (nullable string), required to be in E.164 format (`+` + country code + number, e.g. `+919876543210`) - validated by a shared `backend/src/utils/phone.js` (`isValidWhatsappNumber`), enforced on every write path: self-service `PUT /auth/me`, and admin's `POST /users` / `PUT /users/:id`. Stored in E.164 specifically so it can be used as-is by a WhatsApp Business API integration later, without a reformatting step.

- `ProfilePage.jsx`'s Profile section now has a WhatsApp Number field (view + edit), alongside name and Zoom link.
- Admin's Add/Edit Trainer form (`Trainers.jsx`) also has it, mirroring how Zoom Link is already admin-manageable there.
- Included in the `GET /auth/me` response and the `user` object returned by login/Google sign-in, so `AuthContext` has it available immediately without an extra fetch.

Verified locally: `PUT /auth/me` and admin's `POST /users` both reject a number without a country code (e.g. `9876543210`, `12345`) with a 400, accept a valid E.164 number, and a follow-up `PUT /auth/me` sending only `name` leaves the WhatsApp number untouched (same DB-read-before-write fix from §24, now applied to this field too).

---

## Dev environment data reset (2026-08-20)

Ahead of a fresh testing pass on multi-role support and the topic-image work, the dev VM's `Sequence`, `SequenceItem` (cascaded), `Session`, `Notification`, and `AiScheduleLog` tables were wiped clean (`Users`, `Leaves`, and `Resources` were left untouched, then `Leaves` was cleared separately on request). A `pg_dump` backup was taken immediately before (`oneness_trainers_dev_pre_data_wipe_20260820181722.sql` on the VM, under `/home/onenessdev/db_backups/`).

All 4 dev accounts (`admin@oneness.yoga` / super_admin, `devseqcre@guysmail.com` / sequence_creator+trainer, `devtrainer1@clowmail.com` / trainer, `saieleuri@gmail.com` / trainer) had their passwords rotated to a shared known value so the user could log in and test each role — the actual password was shared directly with the user, not recorded here.

---

## Known gaps / not yet done

1. **Action needed from user**: downgrade the trainer accounts currently shared as Editor on the `GOOGLE_SEQUENCES_FOLDER_ID` Drive folder to Viewer (or remove them) — our code-level read-only restriction can't take effect until the folder-level permissions stop overriding it (see §5).
2. **Not yet tested**: the dynamic re-share firing correctly when a trainer's Google link is approved after a month's spreadsheet already exists (code exists, live end-to-end test still pending).
3. **Not built (by decision)**: Sheet→DB two-way sync — see §5's explanation of why this was scoped out.
4. ~~Minor pre-existing findings from the original agent reviews~~ — **done** (see §7): dependency version bumps (React 18→19, Express 4→5, Prisma 6→7), `parseInt` NaN validation on route params, N+1 query in bulk session creation, no DB connect timeout, no startup env-var validation. Remaining low-severity UX polish items not yet revisited — full detail in `Agent Reviews/`.
5. ~~DNS, dev Google Drive folder, OAuth Console origins~~ — **done** (see §8). Both `trainers.onenessyoga.in` and `tdev.onenessyoga.in` are live over HTTPS. Still open: no browser-level verification yet (PWA/push/Google Sign-In), no prod admin account seeded.
6. ~~Add `OPENROUTER_API_KEY`~~ — **done**, key is live on dev, real generations working (see §9). Sequence Creator can now also turn a generated plan directly into real sequences (`POST /sequences/bulk`). Still open: a live browser/DOM click-through of the editable AI-plan modal (Playwright unavailable in-session throughout), and validating `google/gemma-4-31b-it:free`'s real output quality specifically (blocked by transient free-tier provider throttling at time of writing — `nvidia/nemotron-3-ultra-550b-a55b:free` is currently configured instead, already validated).
7. ~~Not started: prod deployment of everything in §9 (AI scheduler + bulk-create)~~ — **done** (see §18). AI scheduler *code* is live on prod, but `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` still need to be added to prod's `.env` before it's actually usable there (fails gracefully with a 503 until then).
8. ~~Not started: prod deployment of multi-role support (§10)~~ — **done** (see §18), live on prod. **Still not yet verified**: live browser/DOM check of the merged nav for a multi-role account (Playwright unavailable in-session).
9. **Action needed from user**: add `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` to prod's `.env` and restart `oneness-yoga-prod-api` to activate the AI weekly-schedule generator there (see §18).
