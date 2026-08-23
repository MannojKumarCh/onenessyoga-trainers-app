# How to Start and Test the Oneness Yoga Trainers App (Local Dev)

## 1. Start the database

PostgreSQL runs as a Windows service (`postgresql-x64-18`) and is normally already running (auto-start).

Check status:
```powershell
Get-Service postgresql-x64-18
```

If it's stopped, start it (as admin):
```powershell
Start-Service postgresql-x64-18
```

Connection details are already configured in `backend/.env` (`DATABASE_URL`), pointing at the local `OnenessYogaTrainersApp` database on `localhost:5432`.

## 2. Start the backend API

```powershell
cd backend
npm install      # first time only, or after pulling dependency changes
npm run dev      # starts on http://localhost:3000 (nodemon, auto-restarts on file change)
```

Verify it's up:
```powershell
curl http://localhost:3000/api/health
```
Should return `{"status":"ok","ts":"..."}`.

## 3. Start the frontend

```powershell
cd frontend
npm install      # first time only, or after pulling dependency changes
npm run dev      # starts on http://localhost:5173
```

Open **http://localhost:5173/** in a browser.

## 4. Log in and verify

Use the credentials below to log in as each role and confirm the app loads correctly, navigation works, and each role sees only its own permitted pages/actions.

### Test login credentials

| Role | Email | Password |
|---|---|---|
| Super Admin | `admin@oneness.yoga` | `admin1234` |
| Trainer | `trainer1@clowmail.com` | `Test1234!` |
| Sequence Creator | `seqcre@guysmail.com` | `Test1234!` |

> The trainer and sequence-creator passwords above were reset to a known test value for local verification (2026-07-19) — they were previously set to unknown values via the admin UI. The super admin password is whatever value was passed to `npm run seed -- <email> <password>` when this local DB was first seeded (the script requires an explicit password argument — there's no built-in default).

## 5. Suggested smoke test per role

- **Super Admin**: log in → view dashboard → open Users, Sessions, Sequences, Trainers pages → create/edit/delete a test record → log out.
- **Sequence Creator**: log in → view assigned sequences → create/upload a sequence → confirm trainer assignment shows correctly.
- **Trainer**: log in → view assigned sessions/sequences → submit a leave request → confirm dashboard reflects it.

## 6. Stopping everything

- Stop frontend/backend dev servers with `Ctrl+C` in their respective terminals.
- PostgreSQL can be left running (it's a lightweight background Windows service) or stopped with `Stop-Service postgresql-x64-18` if needed.
