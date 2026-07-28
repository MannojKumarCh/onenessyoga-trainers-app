const router = require('express').Router();
const prisma = require('../db/db');
const { authenticate, requireRole } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { notifyUser } = require('../utils/notify');

['get', 'post', 'put', 'patch', 'delete'].forEach(method => {
  const original = router[method].bind(router);
  router[method] = (path, ...handlers) => original(path, ...handlers.map(handler => asyncHandler(handler)));
});

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function parseOptionalPositiveInt(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw httpError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}

async function ensureTrainerExists(trainerId) {
  if (trainerId === null) return null;

  const trainer = await prisma.user.findUnique({
    where: { id: trainerId },
    select: { id: true, role: true }
  });

  if (!trainer || trainer.role !== 'trainer') {
    throw httpError(400, 'assigned_trainer_id must reference an existing trainer');
  }

  return trainerId;
}

function serialize(session) {
  const { assigned_trainer, ...rest } = session;
  return { ...rest, trainer_name: assigned_trainer?.name ?? null };
}

function serializeWithZoom(session) {
  const { assigned_trainer, ...rest } = session;
  return {
    ...rest,
    trainer_name: assigned_trainer?.name ?? null,
    trainer_zoom_link: assigned_trainer?.zoom_link ?? null
  };
}

// Trainer: my upcoming sessions
router.get('/my', authenticate, requireRole('trainer'), async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const sessions = await prisma.session.findMany({
    where: { assigned_trainer_id: req.user.id, scheduled_date: { gte: today }, is_completed: false },
    include: { assigned_trainer: { select: { name: true } } },
    orderBy: [{ scheduled_date: 'asc' }, { scheduled_time: 'asc' }]
  });
  res.json(sessions.map(serialize));
});

// Trainer: completed sessions (all trainers visible)
router.get('/completed', authenticate, async (req, res) => {
  const sessions = await prisma.session.findMany({
    where: { is_completed: true },
    include: { assigned_trainer: { select: { name: true } } },
    orderBy: [{ scheduled_date: 'desc' }, { scheduled_time: 'desc' }],
    take: 100
  });
  res.json(sessions.map(serialize));
});

// Admin: all sessions
router.get('/', authenticate, requireRole('super_admin'), async (req, res) => {
  const { from, to, trainer_id } = req.query;
  const where = {};
  if (from || to) {
    where.scheduled_date = {};
    if (from) where.scheduled_date.gte = from;
    if (to) where.scheduled_date.lte = to;
  }
  if (trainer_id) where.assigned_trainer_id = parseInt(trainer_id);

  const sessions = await prisma.session.findMany({
    where,
    include: { assigned_trainer: { select: { name: true } } },
    orderBy: [{ scheduled_date: 'desc' }, { scheduled_time: 'asc' }]
  });
  res.json(sessions.map(serialize));
});

// Get single session
router.get('/:id', authenticate, async (req, res) => {
  const session = await prisma.session.findUnique({
    where: { id: parseInt(req.params.id) },
    include: { assigned_trainer: { select: { name: true, zoom_link: true } } }
  });
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (req.user.role === 'trainer' && session.assigned_trainer_id !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.json(serializeWithZoom(session));
});

// Admin: create session
router.post('/', authenticate, requireRole('super_admin'), async (req, res) => {
  const { title, scheduled_date, scheduled_time, session_type, assigned_trainer_id, zoom_link } = req.body;
  if (!scheduled_date || !scheduled_time) return res.status(400).json({ error: 'Date and time required' });

  const trainerId = await ensureTrainerExists(parseOptionalPositiveInt(assigned_trainer_id, 'assigned_trainer_id'));

  const session = await prisma.session.create({
    data: {
      title: title || 'Daily Session',
      scheduled_date,
      scheduled_time,
      session_type: session_type || 'BKP',
      assigned_trainer_id: trainerId,
      zoom_link: zoom_link || null,
      created_by: req.user.id
    }
  });

  if (trainerId) {
    notifyUser(trainerId, {
      title: 'New Session Assigned',
      body: `${title || 'Daily Session'} scheduled for ${scheduled_date} at ${scheduled_time}`,
      url: '/sessions'
    }).catch(() => {});
  }

  res.status(201).json({ id: session.id });
});

// Admin: bulk create sessions (for week scheduling)
router.post('/bulk', authenticate, requireRole('super_admin'), async (req, res) => {
  const { sessions } = req.body;
  if (!Array.isArray(sessions) || sessions.length === 0) return res.status(400).json({ error: 'sessions array required' });

  const data = await Promise.all(sessions.map(async s => ({
    title: s.title || 'Daily Session',
    scheduled_date: s.scheduled_date,
    scheduled_time: s.scheduled_time,
    session_type: s.session_type || 'BKP',
    assigned_trainer_id: await ensureTrainerExists(parseOptionalPositiveInt(s.assigned_trainer_id, 'assigned_trainer_id')),
    zoom_link: s.zoom_link || null,
    created_by: req.user.id
  })));

  await prisma.session.createMany({
    data
  });

  res.status(201).json({ success: true, count: sessions.length });
});

// Admin: update session
router.put('/:id', authenticate, requireRole('super_admin'), async (req, res) => {
  const { title, scheduled_date, scheduled_time, session_type, assigned_trainer_id, zoom_link } = req.body;
  const id = parseInt(req.params.id);
  const session = await prisma.session.findUnique({ where: { id } });
  if (!session) return res.status(404).json({ error: 'Not found' });

  const nextTrainerId = await ensureTrainerExists(parseOptionalPositiveInt(assigned_trainer_id, 'assigned_trainer_id'));

  await prisma.session.update({
    where: { id },
    data: {
      title: title ?? session.title,
      scheduled_date: scheduled_date ?? session.scheduled_date,
      scheduled_time: scheduled_time ?? session.scheduled_time,
      session_type: session_type ?? session.session_type,
      assigned_trainer_id: nextTrainerId ?? session.assigned_trainer_id,
      zoom_link: zoom_link ?? session.zoom_link
    }
  });

  const targetTrainerId = nextTrainerId ?? session.assigned_trainer_id;
  if (targetTrainerId) {
    notifyUser(targetTrainerId, {
      title: 'Session Updated',
      body: `Session "${title ?? session.title}" updated for ${scheduled_date ?? session.scheduled_date} at ${scheduled_time ?? session.scheduled_time}`,
      url: '/sessions'
    }).catch(() => {});
  }

  res.json({ success: true });
});

// Trainer: mark session complete / add notes
router.patch('/:id/complete', authenticate, requireRole('trainer'), async (req, res) => {
  const { notes } = req.body;
  const id = parseInt(req.params.id);
  const session = await prisma.session.findUnique({ where: { id } });
  if (!session) return res.status(404).json({ error: 'Not found' });
  if (session.assigned_trainer_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

  await prisma.session.update({
    where: { id },
    data: { is_completed: true, completed_at: new Date(), notes: notes ?? session.notes }
  });

  res.json({ success: true });
});

// Trainer: save notes without completing
router.patch('/:id/notes', authenticate, requireRole('trainer'), async (req, res) => {
  const { notes } = req.body;
  const id = parseInt(req.params.id);
  const session = await prisma.session.findUnique({ where: { id } });
  if (!session) return res.status(404).json({ error: 'Not found' });
  if (session.assigned_trainer_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

  await prisma.session.update({ where: { id }, data: { notes } });
  res.json({ success: true });
});

// Admin: delete session
router.delete('/:id', authenticate, requireRole('super_admin'), async (req, res) => {
  const id = parseInt(req.params.id);
  const session = await prisma.session.findUnique({ where: { id } });
  if (session && session.assigned_trainer_id) {
    notifyUser(session.assigned_trainer_id, {
      title: 'Session Cancelled',
      body: `Session "${session.title}" on ${session.scheduled_date} at ${session.scheduled_time} was cancelled`,
      url: '/sessions'
    }).catch(() => {});
  }

  await prisma.session.delete({ where: { id } });
  res.json({ success: true });
});

module.exports = router;
