# Code Health Review — Oneness Yoga Trainers App

Agent: code-health-reviewer
Date/Time: 2026-07-19 16:37:46
Scope: `backend/` (Node/Express + Prisma/PostgreSQL) and `frontend/` (React + Vite). Read-only audit — no files were modified, no packages installed/upgraded, no migrations run.

---

## Backend

### Critical

1. **No global handlers for `uncaughtException` / `unhandledRejection` — a single bad async call outside a route handler can crash the whole process.**
   File: `backend/src/index.js` (whole file, esp. lines 32-49)
   Why it matters: `asyncHandler` only protects Express route callbacks. Anything that rejects/throws outside that wrapper (e.g. a stray promise in a `setTimeout`, a bug inside `utils/push.js` dispatch code not awaited, a bad third-party callback) becomes an unhandled rejection. In modern Node this either crashes the process outright or leaves it in a corrupted state, taking down the API for all users until PM2/systemd restarts it.
   Fix: Add `process.on('unhandledRejection', ...)` and `process.on('uncaughtException', ...)` handlers that log and (for uncaughtException) trigger a graceful shutdown. Low risk, purely additive.

2. **No rate limiting on `/api/auth/login` (or any endpoint) — unlimited brute-force attempts against user passwords.**
   File: `backend/src/routes/auth.js:13-35`
   Why it matters: `bcrypt.compareSync` runs synchronously per request with no throttling. An attacker (or a buggy client retry loop) can hammer `/api/auth/login` with credential-stuffing attempts; there is nothing in the stack (no helmet, no express-rate-limit) to slow this down. Given real trainer accounts with human-chosen passwords (min length 8, no complexity rule), this is a realistic account-takeover vector.
   Fix: Add `express-rate-limit` (or similar) scoped to `/api/auth/login` (e.g. 5-10 attempts / 15 min per IP+email). Small, additive change, does not alter existing successful-login behavior.

### High

3. **`bcrypt.compareSync` / `bcrypt.hashSync` used everywhere instead of async versions — blocks the Node event loop under load.**
   Files: `backend/src/routes/auth.js:22,60`, `backend/src/routes/users.js:32,64,66`
   Why it matters: bcrypt hashing (cost factor 10) takes tens of milliseconds of pure CPU time. The sync variants block the single Node event loop, so concurrent requests (session lookups, notification dispatch, etc.) all stall while one login/password-reset is being processed. With more than a handful of concurrent trainers logging in around the same class time, this degrades latency for everyone.
   Fix: Switch to `bcrypt.compare`/`bcrypt.hash` (promise-based) — drop-in API change, no behavior difference to callers since routes are already `async`.

4. **CORS defaults to reflecting any origin when `FRONTEND_URL` is unset.**
   File: `backend/src/index.js:9` — `app.use(cors({ origin: process.env.FRONTEND_URL || true }))`
   Why it matters: `origin: true` tells the `cors` package to reflect whatever `Origin` header the browser sends, i.e. allow-all. If `FRONTEND_URL` is ever missing in a deployment (easy to forget, `.env.example` doesn't flag it as required), the API becomes callable cross-origin from any site holding a trainer's JWT (e.g. via XSS on an unrelated page using `localStorage` tokens — see frontend finding). This is a silent fallback, not a loud failure.
   Fix: Fail closed instead of open — if `FRONTEND_URL` is not set, restrict to `http://localhost:5173` (dev) explicitly rather than `true`, or throw at startup in production (`NODE_ENV=production`) if unset.

5. **No security headers (no `helmet`).**
   File: `backend/src/index.js` (missing middleware)
   Why it matters: Missing `X-Content-Type-Options`, `Strict-Transport-Security`, `X-Frame-Options`, etc. leaves the API more exposed to MIME-sniffing and clickjacking-adjacent issues, and is a low-effort hardening gap for a production Express app handling auth tokens.
   Fix: `app.use(helmet())` near the top of `index.js`. Additive, no behavior change to JSON API responses.

6. **Duplicated `asyncHandler` implementation diverges between route files — inconsistent error-handling guarantee.**
   Files: `backend/src/routes/sequences.js:6-8` (defines its own local `asyncHandler` and wraps handlers manually) vs. `backend/src/routes/{auth,users,sessions,leaves,resources,notifications}.js` (monkey-patch `router[method]` at the top of the file using the shared `backend/src/utils/asyncHandler.js`).
   Why it matters: Two different mechanisms achieve the same goal today, but they're easy to get out of sync — a future route added to `sequences.js` that forgets `asyncHandler(...)` around it, or a route added to another file that isn't covered by the monkey-patch pattern (e.g. added via `router.route(...).get(...)` which bypasses the patched methods), will silently lose crash protection for async errors. This is exactly the kind of inconsistency that causes an unhandled rejection like Critical finding #1.
   Fix: Have `sequences.js` `require('../utils/asyncHandler')` and use the same router-monkey-patch snippet as the other five route files (it's already identical in `auth.js`, `users.js`, `sessions.js`, `leaves.js`, `resources.js`, `notifications.js` — just copy it in and drop the local `asyncHandler` + explicit wraps). Zero behavior change, pure de-duplication.

### Medium

7. **`parseInt(req.params.id)` used without `NaN` / validity checks throughout, relying on Prisma to reject bad input.**
   Files: e.g. `backend/src/routes/sessions.js:99,156,180,196,207`, `backend/src/routes/leaves.js:55,75`, `backend/src/routes/resources.js:67,86`, `backend/src/routes/sequences.js:79,161,177,199,222`
   Why it matters: `GET /api/sessions/abc` → `parseInt('abc')` → `NaN` → `prisma.session.findUnique({ where: { id: NaN } })`. Prisma will throw a validation error, which is caught by `asyncHandler`/global error middleware and returns a 500 (not a clean 400), and logs a stack trace for what is really just a malformed request. Not a security hole, but pollutes error logs and gives worse API ergonomics than a validated 400.
   Fix: Add a tiny shared helper (already have `parsePositiveInt`/`parseOptionalPositiveInt` patterns in `sessions.js`/`sequences.js`) and apply it to `req.params.id` parsing too, returning 400 on non-numeric IDs. Low risk, purely improves error UX; could be done incrementally per-route.

8. **`ensureTrainerExists` + role checks are all extra round-trips; several routes do an N+1-ish pattern in `POST /sessions/bulk`.**
   File: `backend/src/routes/sessions.js:132-151`
   Why it matters: `Promise.all(sessions.map(async s => ... await ensureTrainerExists(...)))` issues one `SELECT` per session in the bulk payload (e.g. 7 for a week). Not dangerous at current scale, but if bulk scheduling grows (multiple trainers/sessions per day), this is a linear number of round-trips to Postgres per bulk request instead of one batched lookup.
   Fix (low-risk, optional): Pre-fetch the distinct set of trainer IDs referenced in the payload with a single `prisma.user.findMany({ where: { id: { in: [...] }, role: 'trainer' } })` and validate against that set in memory, instead of one query per row. Only worth doing if bulk payload sizes are expected to grow; flagging for awareness rather than urgent action.

9. **No DB connection pool tuning / no `$connect` timeout — a slow/unreachable DB at startup blocks indefinitely before failing.**
   File: `backend/src/index.js:32-40`
   Why it matters: `await prisma.$connect()` has no timeout wrapper; if the Postgres host is reachable but slow to respond (e.g. cold-starting a hosted instance, or a firewall silently dropping packets rather than refusing), `start()` can hang indefinitely with no log output beyond process start, making a stuck deploy hard to diagnose.
   Fix: Wrap the connect call with a timeout (`Promise.race` against a `setTimeout` that logs "still trying to connect..." and eventually exits) so operators get a clear signal rather than a silent hang. Optional/low priority given the app currently runs against a single known Postgres instance.

10. **Graceful shutdown doesn't stop accepting new connections or drain in-flight requests.**
    File: `backend/src/index.js:32-49`
    Why it matters: `app.listen(...)` return value (the `http.Server`) isn't captured, so `shutdown()` only calls `prisma.$disconnect()` and `process.exit(0)` — it never calls `server.close()`. On SIGTERM (e.g. a redeploy), in-flight requests can be aborted mid-DB-call rather than allowed to finish, and the process exits before Prisma's disconnect necessarily completes cleanly for those requests.
    Fix: Capture `const server = app.listen(...)` and in `shutdown()` call `server.close(() => ...)` before/along with `prisma.$disconnect()`. Small, safe change.

### Low

11. **No startup validation of required env vars (`JWT_SECRET`, `DATABASE_URL`, VAPID keys).**
    Files: `backend/src/index.js`, `backend/src/utils/push.js:4-8`
    Why it matters: If `JWT_SECRET` is unset, every login/auth call will fail at `jwt.sign`/`jwt.verify` with a generic error, but only when hit — not at boot, so the failure surfaces confusingly in production instead of at deploy time. Separately, `webpush.setVapidDetails(...)` in `push.js` is called unconditionally at module load; if `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_EMAIL` are ever missing or malformed, this throws synchronously during `require()`, which — because `sequences.js` and `leaves.js` `require('../utils/push')` at the top of the file — would crash the entire server at startup (not just disable notifications). Currently the `.env` has these values set, so this is latent, not active.
    Fix: Add a small startup check in `index.js` that validates required env vars and either logs a clear warning (VAPID, optional feature) or exits with a clear message (JWT_SECRET, DATABASE_URL — required). For `push.js` specifically, guard the `setVapidDetails` call so a missing/invalid VAPID config disables push gracefully instead of crashing the whole app.

12. **Unused/uninstalled dependencies declared in `package.json` (`@neondatabase/serverless`, `@prisma/adapter-neon`, `ws`).**
    File: `backend/package.json:14,15,20` (verified via `npm outdated`, which reports them `MISSING` from `node_modules`, and a grep confirms nothing in `backend/src` or `backend/scripts` imports them)
    Why it matters: Dead dependency declarations are confusing (suggest the app uses a Neon-specific driver adapter when `backend/src/db/db.js` actually just uses plain `PrismaClient`), and being `MISSING` from `node_modules` means a fresh `npm ci`/`npm install` will pull them down for no purpose, or worse, mask a real "missing dependency" signal in `npm outdated` output.
    Fix: Remove the three unused entries from `package.json` `dependencies` if the Neon adapter migration was abandoned, or wire up `db.js` to actually use them if it was intended. Either way, no functional change to current behavior since they're unused today.

13. **Console-only logging, no structured/leveled logger.**
    Files: `backend/src/index.js:23,37`, `backend/src/db/seed.js` (multiple)
    Why it matters: `console.error(err)` in the global error handler dumps a raw stack trace with no request context (method, path, user id) attached, making it harder to correlate errors with specific requests in production logs, especially once multiple concurrent users are involved.
    Fix (optional/low priority given app size): Include `req.method`, `req.originalUrl`, and `req.user?.id` in the error log line. Doesn't require adopting a full logging library.

14. **`seed.js` prints the generated admin password to stdout.**
    File: `backend/src/db/seed.js:22`
    Why it matters: If seed logs are captured by a CI system, hosting platform's log aggregator, or shell history, the initial super_admin password is exposed in plaintext logs indefinitely. Low risk since it's a one-time bootstrap script and the comment already tells the operator to change it, but worth flagging since log retention is often longer than people expect.
    Fix: Keep the console output (useful for local dev) but note in a comment that this should not be run against a shared/prod log-captured environment, or accept the password via env var/prompt instead of always printing a default.

---

## Frontend

### High

1. **Many "action" handlers (delete/toggle/complete) call the API with `await` and no `try/catch`, leaving the UI stuck or silently stale on failure.**
   Files (representative, not exhaustive):
   - `frontend/src/pages/admin/Sessions.jsx:60-64` (`deleteSession`)
   - `frontend/src/pages/trainer/Leaves.jsx:36-39` (`cancel`)
   - `frontend/src/pages/admin/Trainers.jsx:55-67` (`toggleActive`, `confirmDeactivate`) and `:69-73` (`resetPassword`)
   - `frontend/src/pages/admin/Resources.jsx:42-46` (`deleteItem`)
   - `frontend/src/pages/trainer/SessionDetail.jsx:30-34` (`markComplete`)
   Why it matters: If the request fails (network blip, 403 from a stale/expired token, 404 because another admin already deleted the row, 500 from the server), the `await` throws inside an `async` function invoked from an `onClick`/`onConfirm` handler with nothing catching it. Concretely for `markComplete` in `SessionDetail.jsx`: `setCompleting(true)` runs, the PATCH throws, `navigate(-1)` never runs, and — because there's no `finally`/`catch` — `completing` is never reset to `false`. The "Confirm" button stays permanently disabled/showing "Saving…" until the user manually reloads the page, with zero error message. For the delete/toggle handlers, the same failure produces an unhandled promise rejection in the console and a UI that looks like nothing happened (list doesn't refresh, item doesn't visually change), with no feedback to the user that the action failed.
   Fix: Wrap each of these bodies in `try { ... } catch (err) { /* set a local error/notice state, as several other handlers in the same files already do */ } finally { /* reset loading flags */ }`. The codebase already has the right pattern in `submit()` handlers in the very same files (e.g. `Sessions.jsx:37-58` uses `try/catch/finally` with `getApiErrorMessage`) — this is applying an existing, proven pattern to the handlers that currently lack it, not introducing a new one.

### Medium

2. **No React Error Boundary anywhere in the tree — any render-time exception blanks the whole app to a white screen.**
   Files: `frontend/src/main.jsx`, `frontend/src/App.jsx`
   Why it matters: If any page component throws during render (e.g. a `null`/`undefined` access from an unexpected API shape, or a bad `date-fns` `format(new Date(badString), ...)` call — several pages do `format(new Date(session.scheduled_date), ...)` without validating the date string first, e.g. `SessionDetail.jsx:47`, `Sequences.jsx` files), React unmounts the entire component tree and the user sees a blank white page with no way to recover except a manual browser refresh. There is currently no boundary catching this anywhere between `main.jsx` and the leaf page components.
   Fix: Add a single top-level `ErrorBoundary` class component wrapping `<AppRoutes />` (or `<App />`'s children) in `main.jsx`/`App.jsx` that renders a simple "Something went wrong, please reload" fallback with a reload button. This is additive and doesn't change any existing successful-render behavior.

3. **`localStorage` (not memory or httpOnly cookie) used for JWT storage, readable by any injected script.**
   File: `frontend/src/api/client.js:5-9`, `frontend/src/context/AuthContext.jsx:13-14`
   Why it matters: Combined with backend finding #4 (CORS can fall back to allow-all if `FRONTEND_URL` is unset), a JWT sitting in `localStorage` is directly readable by any script that manages to execute on the page (e.g. via a future dependency compromise or a reflected-XSS bug introduced later, since resource `url`/`thumbnail_url` and zoom links are rendered as plain `href`s sourced from admin-entered data — see `Resources.jsx`, `SessionDetail.jsx:60-62`). This is a standard SPA trade-off, not unique to this app, but worth naming explicitly since it compounds with the CORS gap.
   Fix: Out of scope for a low-risk fine-tuning pass (moving to httpOnly cookies is an architecture change with CSRF implications). No action recommended beyond closing backend finding #4 (CORS fail-closed), which meaningfully reduces the blast radius of a leaked token.

4. **`usePush` hook's `useEffect` auto-subscribes on every mount where `Notification.permission === 'granted'`, re-registering with the backend on every full app load without checking if a subscription already exists server-side first.**
   File: `frontend/src/hooks/usePush.js:97-107`
   Why it matters: Not a leak or crash, but on every page load (including client-side route transitions that remount the layout, or a browser refresh) with permission already granted, this fires `subscribe()` again, which calls `GET /notifications/vapid-public-key` and (if `pushManager.getSubscription()` returns an existing sub) `POST /notifications/subscribe` again. The backend already `upsert`s on `endpoint` (`backend/src/routes/notifications.js:16-20`) so it's idempotent and not harmful, but it's an avoidable network round-trip on every load for users who already have push enabled.
   Fix: Low priority / optional — could track a "already synced this session" flag in `sessionStorage` to skip the redundant subscribe call. Not a stability risk as-is; noting for awareness only, no fix strictly required.

5. **Date parsing assumes well-formed date strings from the API with no guard, risking `Invalid Date` render or thrown errors.**
   Files: `frontend/src/pages/trainer/SessionDetail.jsx:47`, `frontend/src/pages/admin/Sequences.jsx:109,117,147`, `frontend/src/pages/trainer/SequenceDetail.jsx:73`, and other `format(new Date(x), ...)` call sites across `pages/`
   Why it matters: `date-fns`'s `format()` throws `RangeError: Invalid time value` for an invalid `Date` object rather than silently rendering "Invalid Date". Combined with finding #2 (no error boundary), a single malformed `scheduled_date`/`week_start_date` value from the database (e.g. from manual DB edits, or a future migration bug) would white-screen the page instead of degrading gracefully.
   Fix: Once an error boundary exists (finding #2), this becomes non-fatal (contained to one page). Optionally, could add a small `safeFormat(dateStr, fmt, fallback)` wrapper in `frontend/src/utils/date.js` (which already exists and is used for `groupByDate`) for extra defense, but this is optional given the error boundary already contains the blast radius.

### Low

6. **Dependency versions are moderately behind on major versions (not security-critical, but worth planning for).**
   File: `frontend/package.json` (via `npm outdated`)
   Details: `react`/`react-dom` 18.3.1 → 19.2.7 available, `react-router-dom` 6.30.4 → 7.x available, `vite` 5.4.21 → 8.x available, `date-fns` 3.6.0 → 4.x available, `axios` 1.17.0 installed vs 1.18.1 wanted (patch-level, should update via normal `npm install` respecting the `^1.7.2` range).
   Why it matters: None of these are urgent (no known vulnerabilities surfaced by the dependency check), but React 18→19 and React Router 6→7 are breaking-change major bumps that get harder to absorb the longer they're deferred. Flagging for roadmap awareness, not immediate action — explicitly out of scope for this "no upgrades" pass.
   Fix: No action now. When there's headroom, upgrade one major version at a time (Vite 5→6→7→8, then React Router, then React 19) each with its own test pass, rather than jumping directly to latest.

7. **Backend dependency versions similarly behind on majors (`@prisma/client`/`prisma` 6.19.3 → 7.8.0, `express` 4.x → 5.x, `bcryptjs` 2.x → 3.x, `dotenv` 16.x → 17.x).**
   File: `backend/package.json` (via `npm outdated`)
   Why it matters: Same as above — no active vulnerabilities (`npm audit` reports 0), but Prisma 7 and Express 5 are both breaking-change majors. The app was very recently migrated from SQLite to Postgres/Prisma (per commit `4d70101`), so this is likely intentionally deferred until that migration has stabilized in production — reasonable to leave alone for now.
   Fix: No action now; revisit after the Postgres migration has been running stably for a while.

8. **Minor duplicated fetch/loading/error boilerplate repeated near-identically across every admin/trainer list page (`load()` + `loading`/`loadError` state + `.then/.catch/.finally`).**
   Files: `frontend/src/pages/admin/{Sessions,Trainers,Leaves,Sequences,Resources}.jsx`, `frontend/src/pages/trainer/{Leaves,MySessions,...}.jsx`
   Why it matters: Not a bug — each instance is correct on its own — but the same 4-6 lines of `useState`/`useEffect`/`.then().catch().finally()` are copy-pasted in roughly a dozen files. This isn't causing failures today, but it's why finding #1 (missing try/catch on mutations) is spread across so many files: there's no shared hook enforcing the pattern, so it's easy for a new page to omit it.
   Fix: Optional, larger-than-"fine-tuning" scope — a shared `useApiResource()`/`useAsyncAction()` hook could consolidate this, but that's a refactor, not a low-risk patch, so it is not recommended as part of this pass. Noting only as context for why finding #1 recurs so often.

---

## Summary of severity counts

- Backend: 2 Critical, 4 High, 4 Medium, 4 Low (14 total)
- Frontend: 0 Critical, 1 High, 4 Medium, 3 Low (8 total)
