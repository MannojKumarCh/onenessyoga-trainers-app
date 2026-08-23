const router = require('express').Router();
const prisma = require('../db/db');
const { authenticate, requireRole, getUserRoles } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { notifyUser, notifyUsers } = require('../utils/notify');
const { sendBackupAssignedEmail } = require('../utils/mail');
const { ensureTrainerExists } = require('../utils/trainers');
const validateIdParam = require('../middleware/validateIdParam');

['get', 'post', 'put', 'patch', 'delete'].forEach(method => {
  const original = router[method].bind(router);
  router[method] = (path, ...handlers) => original(path, ...handlers.map(handler => asyncHandler(handler)));
});

router.param('id', validateIdParam);

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

// A day with a Sequence assigned (to any trainer) shows that sequence's
// topic as the session title, in place of the generic "Daily Session" -
// irrespective of which trainer the sequence belongs to. If more than one
// sequence somehow lands on the same date, the earliest-created one wins.
async function getSequenceTopicByDate(dates) {
  const uniqueDates = [...new Set(dates)];
  if (uniqueDates.length === 0) return new Map();

  const sequences = await prisma.sequence.findMany({
    where: { scheduled_date: { in: uniqueDates } },
    select: { scheduled_date: true, topic: true },
    orderBy: { id: 'asc' }
  });

  const topicByDate = new Map();
  for (const seq of sequences) {
    if (!topicByDate.has(seq.scheduled_date)) topicByDate.set(seq.scheduled_date, seq.topic);
  }
  return topicByDate;
}

// Full sequence content (instructions, items, sheet link) for a single
// session's date - only used on the single-session detail route, since list
// routes only need the lightweight topic string above. Same date-only,
// irrespective-of-trainer matching as getSequenceTopicByDate.
async function getSequenceForDate(date) {
  const seq = await prisma.sequence.findFirst({
    where: { scheduled_date: date },
    orderBy: { id: 'asc' },
    include: { items: { orderBy: { sort_order: 'asc' } } }
  });
  if (!seq) return null;
  return {
    id: seq.id,
    topic: seq.topic,
    instructions: seq.instructions,
    google_sheet_link: seq.google_sheet_link,
    status: seq.status,
    items: seq.items
  };
}

function serialize(session, topicByDate = new Map()) {
  const { assigned_trainer, backup_trainer, ...rest } = session;
  return {
    ...rest,
    title: topicByDate.get(session.scheduled_date) ?? rest.title,
    trainer_name: assigned_trainer?.name ?? null,
    backup_trainer_name: backup_trainer?.name ?? null
  };
}

function serializeWithZoom(session, topicByDate = new Map()) {
  const { assigned_trainer, backup_trainer, ...rest } = session;
  return {
    ...rest,
    title: topicByDate.get(session.scheduled_date) ?? rest.title,
    trainer_name: assigned_trainer?.name ?? null,
    trainer_zoom_link: assigned_trainer?.zoom_link ?? null,
    backup_trainer_name: backup_trainer?.name ?? null,
    backup_trainer_zoom_link: backup_trainer?.zoom_link ?? null
  };
}

// Trainer: my upcoming sessions (as dedicated trainer or as backup)
router.get('/my', authenticate, requireRole('trainer'), async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const sessions = await prisma.session.findMany({
    where: {
      OR: [{ assigned_trainer_id: req.user.id }, { backup_trainer_id: req.user.id }],
      scheduled_date: { gte: today },
      is_completed: false
    },
    include: { assigned_trainer: { select: { name: true } }, backup_trainer: { select: { name: true } } },
    orderBy: [{ scheduled_date: 'asc' }, { scheduled_time: 'asc' }]
  });
  const topicByDate = await getSequenceTopicByDate(sessions.map(s => s.scheduled_date));
  res.json(sessions.map(s => ({
    ...serialize(s, topicByDate),
    viewer_role: s.backup_trainer_id === req.user.id && s.assigned_trainer_id !== req.user.id ? 'backup' : 'assigned'
  })));
});

// Trainer: completed sessions (all trainers visible)
router.get('/completed', authenticate, async (req, res) => {
  const sessions = await prisma.session.findMany({
    where: { is_completed: true },
    include: { assigned_trainer: { select: { name: true } }, backup_trainer: { select: { name: true } } },
    orderBy: [{ scheduled_date: 'desc' }, { scheduled_time: 'desc' }],
    take: 100
  });
  const topicByDate = await getSequenceTopicByDate(sessions.map(s => s.scheduled_date));
  res.json(sessions.map(s => serialize(s, topicByDate)));
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
    include: { assigned_trainer: { select: { name: true } }, backup_trainer: { select: { name: true } } },
    orderBy: [{ scheduled_date: 'desc' }, { scheduled_time: 'asc' }]
  });
  const topicByDate = await getSequenceTopicByDate(sessions.map(s => s.scheduled_date));
  res.json(sessions.map(s => serialize(s, topicByDate)));
});

// Get single session
router.get('/:id', authenticate, async (req, res) => {
  const session = await prisma.session.findUnique({
    where: { id: parseInt(req.params.id) },
    include: {
      assigned_trainer: { select: { name: true, zoom_link: true } },
      backup_trainer: { select: { name: true, zoom_link: true } }
    }
  });
  if (!session) return res.status(404).json({ error: 'Session not found' });
  // Trainer-only viewers are restricted to sessions where they're the dedicated
  // or backup trainer; anyone who also holds a broader role (admin/creator) can
  // already see every session, so the restriction only applies when trainer is
  // their sole relevant role.
  const roles = getUserRoles(req.user);
  const isTrainerOnly = roles.includes('trainer') && !roles.includes('super_admin') && !roles.includes('sequence_creator');
  const isParty = session.assigned_trainer_id === req.user.id || session.backup_trainer_id === req.user.id;
  if (isTrainerOnly && !isParty) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const [topicByDate, sequence] = await Promise.all([
    getSequenceTopicByDate([session.scheduled_date]),
    getSequenceForDate(session.scheduled_date)
  ]);
  res.json({ ...serializeWithZoom(session, topicByDate), sequence });
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
  if (session.assigned_trainer_id !== req.user.id && session.backup_trainer_id !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await prisma.session.update({
    where: { id },
    data: { is_completed: true, completed_at: new Date(), notes: notes ?? session.notes }
  });

  const admins = await prisma.user.findMany({ where: { roles: { has: 'super_admin' }, is_active: true }, select: { id: true } });
  if (admins.length > 0) {
    notifyUsers(admins.map(a => a.id), {
      title: 'Session Completed',
      body: `${req.user.name} marked session "${session.title}" as completed`,
      url: '/sessions'
    }).catch(() => {});
  }

  res.json({ success: true });
});

// Trainer: save notes without completing
router.patch('/:id/notes', authenticate, requireRole('trainer'), async (req, res) => {
  const { notes } = req.body;
  const id = parseInt(req.params.id);
  const session = await prisma.session.findUnique({ where: { id } });
  if (!session) return res.status(404).json({ error: 'Not found' });
  if (session.assigned_trainer_id !== req.user.id && session.backup_trainer_id !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await prisma.session.update({ where: { id }, data: { notes } });

  const admins = await prisma.user.findMany({ where: { roles: { has: 'super_admin' }, is_active: true }, select: { id: true } });
  if (admins.length > 0) {
    notifyUsers(admins.map(a => a.id), {
      title: 'Session Notes Added',
      body: `${req.user.name} added notes to "${session.title}"`,
      url: '/sessions'
    }).catch(() => {});
  }

  res.json({ success: true });
});

// Admin: assign or clear a backup trainer for a session. Does not touch
// assigned_trainer_id - both the dedicated and backup trainer stay linked to
// the session; the backup can act on it (notes/complete) exactly like the
// dedicated trainer can (see the ownership checks above and on GET /:id).
router.patch('/:id/backup', authenticate, requireRole('super_admin'), async (req, res) => {
  const id = parseInt(req.params.id);
  const session = await prisma.session.findUnique({ where: { id } });
  if (!session) return res.status(404).json({ error: 'Not found' });

  const backupId = await ensureTrainerExists(parseOptionalPositiveInt(req.body.backup_trainer_id, 'backup_trainer_id'), 'backup_trainer_id');

  if (backupId !== null && backupId === session.assigned_trainer_id) {
    throw httpError(400, 'Backup trainer must be different from the assigned trainer');
  }

  await prisma.session.update({ where: { id }, data: { backup_trainer_id: backupId } });

  // Notifications/email only fire on an actual assignment, not on clearing.
  if (backupId) {
    const [backupTrainer, assignedTrainer] = await Promise.all([
      prisma.user.findUnique({ where: { id: backupId }, select: { id: true, name: true, email: true } }),
      session.assigned_trainer_id
        ? prisma.user.findUnique({ where: { id: session.assigned_trainer_id }, select: { id: true, name: true, email: true } })
        : null
    ]);

    notifyUser(backupTrainer.id, {
      title: 'Backup Trainer Assignment',
      body: `You've been assigned as backup for "${session.title}" on ${session.scheduled_date} at ${session.scheduled_time}`,
      url: `/sessions/${id}`
    }).catch(() => {});
    sendBackupAssignedEmail(backupTrainer, session, { role: 'backup', otherTrainerName: assignedTrainer?.name ?? null })
      .catch(err => console.error('Failed to send backup-assignment email to backup trainer:', err));

    if (assignedTrainer) {
      notifyUser(assignedTrainer.id, {
        title: 'Backup Trainer Assigned',
        body: `${backupTrainer.name} will back you up on "${session.title}" on ${session.scheduled_date} at ${session.scheduled_time}`,
        url: `/sessions/${id}`
      }).catch(() => {});
      sendBackupAssignedEmail(assignedTrainer, session, { role: 'assigned', otherTrainerName: backupTrainer.name })
        .catch(err => console.error('Failed to send backup-assignment email to assigned trainer:', err));
    }
  }

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
