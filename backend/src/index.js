require('dotenv').config();
const express = require('express');
const cors = require('cors');
const prisma = require('./db/db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: process.env.FRONTEND_URL || true }));
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/sessions', require('./routes/sessions'));
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

async function start() {
  try {
    await prisma.$connect(); // fail early if DB unreachable
    app.listen(PORT, () => console.log(`Oneness Yoga API running on port ${PORT}`));
  } catch (err) {
    console.error('Failed to connect to DB:', err);
    process.exit(1);
  }
}

start();
async function shutdown() {
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
