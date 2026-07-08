# UI Critique — Oneness Yoga Trainers App (Frontend)
**Date:** 2026-07-08

Reviewed all 20 files under `frontend/src` (pages, layouts, context, hooks, api client, CSS). No code changed. Findings grouped by cross-cutting patterns first, then per-area.

## A. Cross-cutting (repeated across most pages)

- Area: Data fetching (all list pages)
- Issue type: state
- Location: `Dashboard.jsx` (trainer+admin), `MySessions.jsx`, `CompletedSessions.jsx`, `AdminSessions.jsx`, `AdminLeaves.jsx`, `AdminSequences.jsx`, `sequence-creator/Sequences.jsx`, `trainer/Sequences.jsx`, `trainer/Resources.jsx`
- Explanation: Every fetch is `client.get(...).then(setX).finally(() => setLoading(false))` with **no `.catch()`**. A network/API failure silently resolves `loading=false` with state left at its initial empty array/object, rendering the "empty state" UI (e.g. "No upcoming sessions") indistinguishable from a real empty result. There is no error state anywhere in the app for a failed GET. In the `Promise.all` cases (Dashboard, AdminDashboard, AdminSessions, CreatorSequences), one failing request kills all sibling requests in that batch with the same silent-empty outcome.

- Area: Modals (Leaves, SessionDetail, AdminTrainers ×2, SequenceDetail, AdminSequences, CreatorSequences, AdminResources)
- Issue type: ui / state
- Location: 8 separate files, each with local `<div className="modal-overlay">` + boolean toggle
- Explanation: The exact same modal shell (overlay div, stopPropagation on inner click, close button, form footer with Cancel/Submit) is hand-copied into 8 files instead of one shared component. No shared abstraction means every modal has to be fixed individually for any future behavior change.

- Area: Modal accessibility
- Issue type: accessibility
- Location: same 8 modal usages
- Explanation: None use `role="dialog"`/`aria-modal`, none trap focus inside the modal, none close on Escape, and none return focus to the triggering button on close. Keyboard-only and screen-reader users have a degraded/broken experience with every modal in the app.

- Area: Clickable list rows
- Issue type: accessibility
- Location: `Dashboard.jsx` (sessions & sequences rows), `MySessions.jsx`, `trainer/Sequences.jsx`, `AdminDashboard.jsx` (stat cards + quick links)
- Explanation: Rows are plain `<div className="list-item" onClick={...}>` with no `role="button"`, `tabIndex`, or `onKeyDown` handler. These elements are not reachable or activatable via keyboard, and are not announced as interactive to screen readers.

- Area: Focus indication
- Issue type: accessibility
- Location: `index.css` — global `button { border: none; background: none }`, `.input:focus { border-color: var(--primary) }` with base `outline: none`
- Explanation: No button anywhere in the app defines a `:focus-visible` style, and inputs replace the browser's default focus ring with only a 1.5px border-color shift. Keyboard users get little to no visible indication of current focus across the entire UI — this is app-wide, not per-page.

- Area: Date grouping / day-label helpers
- Issue type: state (duplication)
- Location: `Dashboard.jsx`, `MySessions.jsx`, `CompletedSessions.jsx`, `AdminSessions.jsx`
- Explanation: The `sessions.reduce((acc,s) => {...})` group-by-date logic and the `dayLabel()` (isToday/isTomorrow/format) helper are duplicated verbatim across files rather than shared, so any date-format tweak (e.g. locale, week start) has to be made in 3-4 places and can silently drift out of sync.

- Area: Destructive/high-impact action confirmation
- Issue type: ux
- Location: `AdminSessions.jsx`, `AdminSequences.jsx`, `AdminResources.jsx` (delete via native `confirm()`) vs. `SessionDetail.jsx` (custom themed modal for "mark complete")
- Explanation: Confirmation UX is inconsistent — some destructive actions use the browser's native unstyled `confirm()` dialog, others use the app's styled modal. Additionally, `AdminTrainers.jsx`'s "Deactivate" and "Reset Password" actions have **no confirmation at all**, despite being at least as consequential as deleting a session.

- Area: Form validation feedback
- Issue type: ux
- Location: All forms (Leaves, AdminTrainers, AdminSessions, AdminSequences, CreatorSequences, AdminResources, SequenceDetail upload)
- Explanation: Validation relies entirely on native HTML5 `required`/`type`/`minLength` plus one generic server-error string dumped into `.error-text`. There is no field-level inline validation or highlighting. Note `index.css` defines `.input.error { border-color: var(--danger) }` but it is never applied anywhere in any page — dead CSS that suggests a field-error UI was planned but never wired up.

## B. Auth / session flow

- Area: 401 handling
- Issue type: ux / performance
- Location: `api/client.js:14-18`
- Explanation: On any 401 the client does a hard `window.location.href = '/login'`, discarding all SPA state and forcing a full document reload/re-download of the bundle, with zero messaging (no "session expired, please sign in again"). If this fires while a user is mid-form (e.g. applying for leave), their input is lost with no warning.

- Area: Post-login redirect
- Issue type: ux
- Location: `AuthContext.jsx`, `App.jsx`
- Explanation: There's no concept of "return to intended page" — a user who gets logged out while on `/sequences/12` always lands back on their role's default home after re-authenticating, never back on the page they were viewing.

- Area: Push notification opt-in
- Issue type: ux
- Location: `hooks/usePush.js:32-36`
- Explanation: The native browser permission prompt fires immediately once `user` is set (right after login), with no priming UI explaining why notifications are being requested. Failures are swallowed to `console.warn` only — there is no UI anywhere indicating whether push is enabled, failed, or denied, and no way to retry/re-subscribe from the UI.

## C. Trainer area

- Area: Session/Sequence detail — assignment check
- Issue type: state
- Location: `SequenceDetail.jsx:56` — `seq?.assigned_trainer_id === user?.id`
- Explanation: Strict equality between an ID from the JWT/user object and an ID from the API payload risks a type mismatch (number vs. string) depending on how Prisma/Postgres serializes IDs vs. how the auth payload stores them. If they mismatch types, `isAssigned` silently evaluates false and the actual assigned trainer never sees the Upload/Notify buttons — a correctness gap that manifests purely as a missing UI control with no error shown.

- Area: SequenceDetail — status message reuse
- Issue type: state
- Location: `SequenceDetail.jsx` — single `msg` state used for both upload errors and "Team notified!" success text
- Explanation: One variable carries two different semantic meanings (success vs. error) rendered through two different code paths/styles. Reopening the upload modal (`setShowUpload(true)`) does not clear `msg`, so a stale "Team notified!" success line can remain visible while the modal is open for an unrelated action.

- Area: SessionDetail — unsaved notes
- Issue type: ux
- Location: `SessionDetail.jsx`
- Explanation: Notes are only persisted via an explicit "Save Notes" click. Navigating back (`navigate(-1)`) after typing but not saving loses the input silently — no dirty-state warning, no autosave.

- Area: Resources navigation (trainer + admin)
- Issue type: ux
- Location: `trainer/Resources.jsx`, `admin/Resources.jsx`
- Explanation: Folder drill-down is tracked purely in local `folderId` state with no URL/history sync. The in-app breadcrumb lets you step up a folder, but the hardware/browser back gesture (primary nav pattern on a mobile PWA) exits the page entirely instead of going up one folder level — two different, contradictory "back" behaviors on the same screen.

- Area: Resources grid layout
- Issue type: ui
- Location: `trainer/Resources.jsx:49`, `admin/Resources.jsx` (implied similar)
- Explanation: Grid is hardcoded to `gridTemplateColumns: '1fr 1fr'` with no responsive breakpoints — on any viewport wider than a phone, two oversized tiles per row waste horizontal space.

- Area: Week selector (trainer/admin/creator Sequences)
- Issue type: ui / accessibility
- Location: `trainer/Sequences.jsx`, `admin/Sequences.jsx`, `sequence-creator/Sequences.jsx`
- Explanation: Week pills scroll horizontally (`overflowX: 'auto'`) with no visual affordance (no arrows, no edge fade) indicating more content is scrollable — easy to miss additional weeks, especially on desktop where scroll-by-drag isn't obvious.

## D. Admin area

- Area: Sequences vs. Sequence-Creator Sequences page
- Issue type: state (duplication)
- Location: `admin/Sequences.jsx`, `sequence-creator/Sequences.jsx`
- Explanation: These two files are ~90% identical (same state shape, same load/submit/notify functions, nearly the same JSX) forked into two components instead of one parametrized by role. They've already started drifting: the creator version has a per-row "Notify" button and lacks the delete action the admin version has entirely — meaning a sequence creator can never remove a sequence they mis-assigned and must go through an admin.

- Area: Week auto-select guard
- Issue type: state
- Location: `admin/Sequences.jsx:38`, `sequence-creator/Sequences.jsx:36` — `useEffect(() => { if (selectedWeek !== undefined) load(); }, [selectedWeek])`
- Explanation: `selectedWeek` is initialized to `''`, never `undefined`, so this guard never actually blocks anything — it always calls `load()`, including on first render before weeks have loaded, and again with an empty `week` query param if there are zero sequences ever created (fetches all sequences unfiltered instead of skipping the call). Contrast with the trainer-side `Sequences.jsx:21` which correctly guards with `if (!selectedWeek) return;` — same intent, two different implementations, only one of which works as apparently intended.

- Area: AdminSessions status indicator
- Issue type: ui
- Location: `admin/Sessions.jsx:79` — `{s.title} {s.is_completed ? '✓' : ''}`
- Explanation: Completion state is appended as a raw checkmark glyph directly into the title text, while every other status indicator in the app (Leaves, Sequences) uses the `.badge` pill component. Inconsistent visual language for "status" across pages of the same app.

- Area: AdminSessions date filter
- Issue type: performance
- Location: `admin/Sessions.jsx:15,66-69`
- Explanation: Only a "from date" lower bound exists, no upper bound, no pagination, and no list virtualization. As session history grows, this list has no built-in limit and will keep rendering every row inline in the DOM.

- Area: AdminTrainers state shape
- Issue type: state
- Location: `admin/Trainers.jsx:14` — `resetPw = { show, id, password }` alongside separate `editing`/`form` state
- Explanation: A second, differently-shaped piece of state is introduced for what is conceptually the same "modal + form" pattern already handled by `editing`/`form`, rather than reusing that shape — inconsistent local state modeling within a single file.

## E. Visual/design-system consistency

- Area: Layout via inline styles
- Issue type: ui
- Location: virtually every page file
- Explanation: Nearly all spacing/flex layout (`display:flex, justifyContent:'space-between'` etc.) is repeated as inline `style={{...}}` objects rather than using a shared utility class, even though `index.css` already establishes a small design system (`.card`, `.list-item`, `.badge`). A global spacing/alignment tweak requires touching every page individually.

- Area: Small secondary text sizing/contrast
- Issue type: accessibility
- Location: `index.css` — `.list-item-sub`, `.section-title`, `.badge` all render `var(--text-secondary)` (#6b7280) at 11-13px
- Explanation: `#6b7280` on white/`--bg` is borderline for WCAG AA at small sizes; worth a contrast-ratio check given how much of the app's secondary information (dates, sub-labels, status words) is rendered this small and this light.

---

**Summary of the most consequential gaps:** (1) no error state anywhere — every fetch failure masquerades as "no data"; (2) list rows and cards used as click targets are not keyboard/screen-reader accessible; (3) admin and sequence-creator "Sequences" pages are a near-duplicate fork already diverging in capability; (4) modals have no focus management or Escape handling; (5) global focus-visible styling is effectively absent.
