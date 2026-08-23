require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cron = require('node-cron');
const prisma = require('./db/db');
const { generateUpcomingSessions } = require('./utils/sessionGenerator');

const app = express();
const PORT = process.env.PORT || 3000;

// Behind nginx (proxy_pass to 127.0.0.1) - without this, every request looks
// like it comes from 127.0.0.1 to Express, so the IP-keyed rate limiters
// (login, forgot-password, AI schedule) treat the entire user base as one
// shared bucket instead of limiting per real client. 'loopback' trusts only
// the immediate hop (nginx on the same box), and reads the real client IP
// from X-Forwarded-For, which nginx must be configured to set.
app.set('trust proxy', 'loopback');

const FRONTEND_URL = process.env.FRONTEND_URL;
if (!FRONTEND_URL && process.env.NODE_ENV === 'production') {
  throw new Error('FRONTEND_URL must be set in production');
}

const REQUIRED_ENV_VARS = ['DATABASE_URL', 'JWT_SECRET', 'JWT_EXPIRES_IN'];
const missingEnvVars = REQUIRED_ENV_VARS.filter(name => !process.env[name]);
if (missingEnvVars.length > 0) {
  console.error(`Missing required environment variable(s): ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

const OPTIONAL_ENV_VARS = ['RESEND_API_KEY', 'GOOGLE_SERVICE_ACCOUNT_KEY', 'GOOGLE_CLIENT_ID', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_EMAIL', 'OPENROUTER_API_KEY'];
for (const name of OPTIONAL_ENV_VARS) {
  if (!process.env[name]) {
    console.warn(`Optional environment variable ${name} not set — related features will be disabled.`);
  }
}

app.use(helmet());
app.use(cors({ origin: FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/session-templates', require('./routes/sessionTemplates'));
app.use('/api/leaves', require('./routes/leaves'));
app.use('/api/sequences', require('./routes/sequences'));
app.use('/api/resources', require('./routes/resources'));
app.use('/api/notifications', require('./routes/notifications'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);

  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'Internal Server Error'
  });
});

let server;

async function start() {
  try {
    await prisma.$connect(); // fail early if DB unreachable
    server = app.listen(PORT, () => console.log(`Oneness Yoga API running on port ${PORT}`));

    // Keep the next 14 days of sessions populated from the weekly schedule
    // template - once on boot (so a restart never leaves a gap until the next
    // scheduled tick), then daily just after midnight IST.
    generateUpcomingSessions()
      .then(r => console.log(`[sessionGenerator] startup run: created ${r.created} session(s)`))
      .catch(err => console.error('[sessionGenerator] startup run failed:', err));

    cron.schedule('15 0 * * *', () => {
      generateUpcomingSessions()
        .then(r => console.log(`[sessionGenerator] daily run: created ${r.created} session(s)`))
        .catch(err => console.error('[sessionGenerator] daily run failed:', err));
    }, { timezone: 'Asia/Kolkata' });
  } catch (err) {
    console.error('Failed to connect to DB:', err);
    process.exit(1);
  }
}

start();

async function shutdown() {
  const forceExit = setTimeout(() => process.exit(1), 10000).unref();
  if (server) {
    await new Promise(resolve => server.close(resolve));
  }
  await prisma.$disconnect();
  clearTimeout(forceExit);
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});
