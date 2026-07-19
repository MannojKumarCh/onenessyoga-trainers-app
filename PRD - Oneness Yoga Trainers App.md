# Product Requirements Document
## Oneness Yoga Trainers App

**Version:** 1.1
**Date:** 7 June 2026 (last updated 12 July 2026)
**Status:** Draft

**Changelog:**
- **v1.1 (12 July 2026):** Database migrated from SQLite (`node:sqlite`) to PostgreSQL + Prisma ORM. Added Section 6.1a (Data Model) documenting the Prisma schema. See Section 6.1 and 6.5 for updated stack/ops entries.

---

## 1. Product Overview

The Oneness Yoga Trainers App is an internal Progressive Web App (PWA) designed to manage day-to-day operations for yoga trainers at Oneness Yoga. It replaces the existing Glide-based app and is hosted on a self-managed Oracle Cloud VM. The app is accessible on mobile without requiring an app store listing.

---

## 2. Goals & Objectives

| Goal | Success Metric |
|---|---|
| Replace Glide with a cost-free, self-hosted solution | Zero recurring SaaS cost |
| Trainers can track and manage their sessions | 100% of sessions logged and marked complete digitally |
| Trainers apply for and track leave in-app | No leave requests over WhatsApp |
| Sequence assignments and uploads are managed in-app | Sequence Creator and Trainers complete the full workflow in-app |
| Push notifications replace WhatsApp for internal alerts | All sequence and leave notifications delivered via PWA push |
| Secure login with minimal friction | Google SSO as primary login method |

---

## 3. Users & Roles

### 3.1 Super Admin
- Full access to all features
- Manages all users (create, edit, deactivate)
- Approves/rejects leave requests
- Schedules and assigns sessions
- Manages resources library
- Can perform all Sequence Creator actions

### 3.2 Sequence Creator
- Creates weekly sequence topic assignments
- Assigns topics to specific trainers
- Notifies assigned trainers via push notification
- Views all sequences and their upload status

### 3.3 Trainer
- Views their assigned upcoming sessions
- Marks sessions as complete and adds session notes
- Views all completed sessions (all trainers)
- Applies for leave and tracks leave status
- Uploads Google Sheet link for their assigned sequence
- Notifies the entire team after uploading their sequence
- Accesses the Resources library

---

## 4. Authentication & Access

### 4.1 Google SSO (Primary)
- Trainers and staff sign in with their Google/Gmail account
- OAuth 2.0 via Google Identity Platform
- On first sign-in, the account is matched to a pre-created user record by email
- If the email does not exist in the system, login is denied with a clear message ("You are not registered. Contact your admin.")
- No self-registration — all accounts are created by the Super Admin

### 4.2 Email + Password (Fallback)
- Available for Super Admin accounts as a backup
- Minimum 8-character password
- Admin can reset any user's password
- Trainers can change their own password after login

### 4.3 Session Management
- JWT-based sessions, 7-day expiry
- Token stored in localStorage
- Auto-redirect to login on token expiry

### 4.4 Access Control

| Feature | Super Admin | Sequence Creator | Trainer |
|---|---|---|---|
| Manage users | ✓ | — | — |
| Create/assign sessions | ✓ | — | — |
| View all sessions | ✓ | — | — |
| View own sessions | ✓ | — | ✓ |
| Mark session complete | ✓ | — | ✓ (own only) |
| Approve/reject leaves | ✓ | — | — |
| Apply for leave | — | — | ✓ |
| Create sequence assignments | ✓ | ✓ | — |
| Upload sequence sheet link | — | — | ✓ (own only) |
| View all sequences | ✓ | ✓ | ✓ |
| Notify trainer of assignment | ✓ | ✓ | — |
| Notify team after upload | — | — | ✓ (own only) |
| Manage resources | ✓ | — | — |
| View resources | ✓ | ✓ | ✓ |

---

## 5. Feature Requirements

### 5.1 Sessions

#### Trainer — My Sessions
- Lists upcoming (incomplete) sessions assigned to the logged-in trainer
- Grouped by date
- Shows session title, time, session type (e.g. BKP)
- Tapping a session opens the Session Detail screen

#### Trainer — Session Detail
- Displays: date, time, session title, assigned trainer name, Zoom link (tappable)
- Text area for session notes (auto-saved on blur or explicit save)
- "Mark Complete" button with a confirmation dialog
- Once marked complete, the session is read-only
- Zoom link is pulled from the trainer's profile (set by admin) and can be overridden per session

#### All Roles — Completed Sessions
- Shows all completed sessions across all trainers
- Grouped by date, showing trainer name, time, and session notes
- Searchable and filterable by trainer

#### Admin — Session Management
- Create individual sessions (date, time, title, type, trainer, zoom link)
- Bulk create sessions for a week
- Delete sessions
- View all sessions with date range filter

### 5.2 Leaves

#### Trainer — Apply for Leave
- Form: From date, To date, Reason (required fields)
- Submitted leaves default to `Pending` status
- Trainer can cancel a `Pending` leave
- List view shows all the trainer's leaves with status badges (Pending / Approved / Rejected)
- Trainer receives a push notification when their leave is reviewed

#### Admin — Leave Management
- View all leave requests filtered by status (Pending / Approved / Rejected / All)
- Approve or Reject with an optional admin note
- Trainer is notified via push notification upon decision

### 5.3 Sequences

#### Sequence Creator / Admin — Assign Topics
- Select a date (week is derived automatically from the date)
- Enter topic (e.g. "Surya Namaskar + Yoga", "Pilates", "Meditation")
- Assign to a specific trainer
- Add optional instructions for the trainer
- Status is `Pending` on creation

#### Sequence Creator / Admin — Notify Trainer
- "Notify All Trainers" button for the whole week: sends push notification to each assigned trainer with their topic and date
- Individual notify button per sequence entry for re-notifications

**Notification content (Trainer assignment):**
> *"You have been assigned [Topic] on [Date]. Please prepare your Google Sheet and upload the link."*

#### Trainer — View Sequences
- Grouped by week, with week selector tabs
- Shows status (Pending / Uploaded), topic, date, assigned trainer name
- Tapping opens Sequence Detail

#### Trainer — Sequence Detail
- Displays: topic, date, assigned trainer, status, instructions from creator
- If the logged-in trainer is the assigned trainer and status is `Pending`:
  - "Upload Google Sheet Link" button → opens modal to paste the URL
  - Trainer must explicitly confirm ("Confirm Upload") — status does not change on paste, only on confirm
  - Status flips to `Uploaded` on confirm
- If status is `Uploaded` and team has not been notified yet:
  - "Notify Team" button becomes active
  - Sends push notification to all trainers

**Notification content (Team upload):**
> *"[Trainer Name] uploaded the sequence for [Date]: '[Topic]'. Tap to view."*

- Shows timestamp of when team was notified (if applicable)
- All trainers can view the Google Sheet link by tapping "Open Google Sheet"

### 5.4 Resources

#### Structure
- Folder-based library (infinitely nestable)
- Items are either `Folder` or `Link`
- Links open in a new browser tab
- Folders display a thumbnail image (optional) and name

#### Default Folders (to be populated by Admin)
- Books
- Asanas Instruction Audios
- Meditations & Pranayamas Audios
- Yoga Nidra & Relaxations Audios

#### Admin — Manage Resources
- Create folders and links at any level
- Optionally add a thumbnail URL to any item
- Delete items (cascades to children)
- Set sort order

### 5.5 Push Notifications

| Trigger | Sent by | Recipients |
|---|---|---|
| Sequence topic assigned (weekly) | Sequence Creator / Admin | Assigned trainer(s) only |
| Sequence re-notified (individual) | Sequence Creator / Admin | That specific trainer |
| Sequence uploaded by trainer | Trainer | All trainers |
| Leave approved or rejected | Admin | The applicant trainer |

- PWA Web Push (no third-party service, VAPID-based)
- Works on Android Chrome natively
- Works on iOS Safari 16.4+ (user must add app to home screen first)
- Trainers are prompted to allow notifications on first login
- Subscriptions are stored per device; a trainer can have multiple devices

### 5.6 Trainer Profile
- Each trainer has a stored Zoom link (set by Admin)
- Zoom link is pre-populated on session detail
- Trainer can view and update their own name and Zoom link
- Password change available (email/password accounts only)

---

## 6. Technical Requirements

### 6.1 Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite |
| PWA | vite-plugin-pwa (Workbox) |
| Backend | Node.js 22 + Express |
| Database | PostgreSQL (native install on the Oracle VM) via Prisma ORM 6.19.3 |
| Auth | JWT + Google OAuth 2.0 |
| Push | Web Push API (VAPID, `web-push` npm package) |
| Hosting | Oracle Cloud Always Free (4 OCPU, 24GB RAM, Ubuntu) |
| Reverse Proxy | Nginx |
| TLS | Let's Encrypt via Certbot (auto-renewal) |
| Process Manager | PM2 |

*(Originally SQLite via `node:sqlite` — migrated to PostgreSQL + Prisma on 7 July 2026 for a production-grade DB. Prisma's query engine is a prebuilt binary, so no C++ build tools are needed on Windows dev machines.)*

### 6.1a Data Model

Schema defined in `backend/prisma/schema.prisma`. Field names stay snake_case (e.g. `zoom_link`, `is_active`) matching the original SQLite columns, so route handlers and the frontend needed no changes.

| Table | Purpose | Key relations |
|---|---|---|
| `users` | All accounts across the 3 roles (`super_admin`, `sequence_creator`, `trainer`) | — |
| `sessions` | Scheduled daily classes | `assigned_trainer_id` → users, `created_by` → users |
| `leaves` | Leave requests and approval status | `trainer_id` → users, `reviewed_by` → users |
| `sequences` | Weekly topic assignments and uploaded sheet links | `assigned_trainer_id` → users, `created_by` → users |
| `resources` | Nestable folder/link library | self-referencing `parent_id` |
| `push_subscriptions` | Per-device VAPID push endpoints | `user_id` → users |

Enums: `Role` (`super_admin`/`sequence_creator`/`trainer`), `LeaveStatus` (`pending`/`approved`/`rejected`), `SequenceStatus` (`pending`/`uploaded`), `ResourceType` (`folder`/`link`) — values match the original CHECK-constraint strings exactly.

Full ER diagram: [`DB Schema Diagram - Oneness Yoga Trainers App.md`](./DB%20Schema%20Diagram%20-%20Oneness%20Yoga%20Trainers%20App.md)

### 6.2 PWA Requirements
- Installable on Android and iOS (Add to Home Screen)
- Offline shell: app loads without network, shows cached data
- Service worker via Workbox (auto-update)
- `display: standalone` — no browser chrome when installed
- `theme_color: #e85d4a` (Oneness red)
- App icons: 192x192 and 512x512

### 6.3 Google SSO Requirements
- OAuth 2.0 Authorization Code flow
- Scopes: `openid`, `email`, `profile`
- Backend validates the Google ID token
- Email matched against `users` table — no new accounts created via SSO
- If no matching account found, login is rejected with a user-friendly message
- Google OAuth client credentials stored in backend `.env`

### 6.4 Security
- All API routes require authentication (JWT)
- Role-based access enforced server-side on every endpoint
- Passwords hashed with bcrypt (cost factor 10)
- HTTPS enforced (HTTP redirects to HTTPS)
- JWT secret and VAPID keys in `.env`, never committed to source control
- CORS locked to the app's own domain in production

### 6.5 Oracle VM — Operational
- Backend runs via PM2 (auto-restart on crash, starts on reboot)
- PostgreSQL DB backed up daily to Oracle Object Storage (free 20GB)
- Keep-alive cron job runs every 30 min to prevent idle CPU reclamation
- Admin logs in to Oracle Cloud Console at least once a month to prevent account suspension

---

## 7. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Max users | 25 concurrent (internal only) |
| Page load (first load, cached) | < 1 second |
| API response time | < 200ms for standard queries |
| Uptime target | Best-effort (~99.9% on Oracle free tier) |
| Mobile-first design | All screens optimized for 375px+ portrait |
| Browser support | Chrome (Android), Safari (iOS 16.4+), Chrome (Desktop) |

---

## 8. Out of Scope (v1.0)

- Student-facing app or booking system
- Payment processing
- Video streaming or audio hosting (links to external sources only)
- WhatsApp integration (replaced by PWA push)
- Native iOS / Android apps (App Store / Play Store)
- Multi-studio / multi-tenant support
- Attendance tracking beyond session completion toggle
- Trainer performance reports or analytics

---

## 9. Open Items

| # | Item | Owner |
|---|---|---|
| 1 | Google OAuth client ID/secret to be created in Google Cloud Console | Mannoj |
| 2 | Domain name for the VM (required for HTTPS and OAuth redirect URI) | Mannoj |
| 3 | Confirm if Sequence Creator needs a mobile-style tab nav or just a simple web view | Mannoj |
| 4 | Confirm if admins need a calendar/week view for session scheduling | Mannoj |
| 5 | App icon / logo asset for PWA manifest | Mannoj |
