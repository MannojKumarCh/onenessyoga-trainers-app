const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const prisma = require('../db/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { notifyUser, notifyAll } = require('../utils/notify');
const asyncHandler = require('../utils/asyncHandler');
const { upsertSequenceInSheet } = require('../utils/sheets');
const { generateWeeklySchedule } = require('../utils/aiScheduler');
const validateIdParam = require('../middleware/validateIdParam');

const aiScheduleLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI schedule requests, please try again later.' }
});

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

function parsePositiveInt(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw httpError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}

function parseOptionalPositiveInt(value, fieldName) {
  if (value === undefined || value === null || value === '') return undefined;
  return parsePositiveInt(value, fieldName);
}

async function ensureTrainerExists(trainerId) {
  const trainer = await prisma.user.findUnique({
    where: { id: trainerId },
    select: { id: true, role: true }
  });

  if (!trainer || trainer.role !== 'trainer') {
    throw httpError(400, 'assigned_trainer_id must reference an existing trainer');
  }
}

const withNames = {
  assigned_trainer: { select: { name: true } },
  creator: { select: { name: true } }
};

function serialize(seq) {
  const { assigned_trainer, creator, ...rest } = seq;
  return {
    ...rest,
    trainer_name: assigned_trainer?.name ?? null,
    created_by_name: creator?.name ?? null
  };
}

// All roles: view sequences (all can see)
router.get('/', authenticate, async (req, res) => {
  const { week, topic, trainer_id, from, to } = req.query;

  const where = {};
  if (week) where.week_start_date = week;
  if (topic) where.topic = { contains: topic, mode: 'insensitive' };
  const trainerId = parseOptionalPositiveInt(trainer_id, 'trainer_id');
  if (trainerId !== undefined) where.assigned_trainer_id = trainerId;
  if (from || to) {
    where.scheduled_date = {};
    if (from) where.scheduled_date.gte = from;
    if (to) where.scheduled_date.lte = to;
  }

  const sequences = await prisma.sequence.findMany({
    where,
    include: withNames,
    orderBy: { scheduled_date: 'asc' }
  });
  res.json(sequences.map(serialize));
});

// Get available weeks
router.get('/weeks', authenticate, async (req, res) => {
  const weeks = await prisma.sequence.findMany({
    distinct: ['week_start_date'],
    select: { week_start_date: true },
    orderBy: { week_start_date: 'desc' },
    take: 20
  });
  res.json(weeks.map(w => w.week_start_date));
});

// Get single sequence
router.get('/:id', authenticate, async (req, res) => {
  const seq = await prisma.sequence.findUnique({
    where: { id: parseInt(req.params.id) },
    include: { ...withNames, items: { orderBy: { sort_order: 'asc' } } }
  });
  if (!seq) return res.status(404).json({ error: 'Not found' });
  res.json(serialize(seq));
});

// Sequence creator / admin: create sequence assignment
router.post('/', authenticate, requireRole('super_admin', 'sequence_creator'), async (req, res) => {
  const { week_start_date, scheduled_date, topic, assigned_trainer_id, instructions } = req.body;
  if (!week_start_date || !scheduled_date || !topic) {
    throw httpError(400, 'week_start_date, scheduled_date, and topic are required');
  }

  const trainerId = parsePositiveInt(assigned_trainer_id, 'assigned_trainer_id');
  const trimmedTopic = String(topic).trim();
  if (!trimmedTopic) {
    throw httpError(400, 'topic is required');
  }

  await ensureTrainerExists(trainerId);

  const seq = await prisma.sequence.create({
    data: {
      week_start_date,
      scheduled_date,
      topic: trimmedTopic,
      assigned_trainer_id: trainerId,
      instructions: instructions ? String(instructions).trim() || null : null,
      created_by: req.user.id
    }
  });

  res.status(201).json({ id: seq.id });
});

// Sequence creator / admin: notify assigned trainer
router.post('/:id/notify-trainer', authenticate, requireRole('super_admin', 'sequence_creator'), async (req, res) => {
  const id = parseInt(req.params.id);
  const seq = await prisma.sequence.findUnique({ where: { id } });
  if (!seq) return res.status(404).json({ error: 'Not found' });

  await notifyUser(seq.assigned_trainer_id, {
    title: 'Sequence Assignment',
    body: `You have been assigned "${seq.topic}" on ${seq.scheduled_date}. Please prepare and upload your Google Sheet.`,
    url: `/sequences/${seq.id}`
  }).catch(() => {});

  await prisma.sequence.update({ where: { id }, data: { notified_trainer_at: new Date() } });
  res.json({ success: true });
});

// Sequence creator / admin: notify entire week's trainers at once
router.post('/notify-week', authenticate, requireRole('super_admin', 'sequence_creator'), async (req, res) => {
  const { week_start_date } = req.body;
  if (!week_start_date) return res.status(400).json({ error: 'week_start_date required' });

  const seqs = await prisma.sequence.findMany({ where: { week_start_date } });
  if (seqs.length === 0) return res.status(404).json({ error: 'No sequences for this week' });

  const trainerIds = [...new Set(seqs.map(s => s.assigned_trainer_id))];
  await Promise.allSettled(
    trainerIds.map(tid => {
      const assigned = seqs.filter(s => s.assigned_trainer_id === tid);
      const topics = assigned.map(s => `${s.scheduled_date}: ${s.topic}`).join('\n');
      return notifyUser(tid, {
        title: 'Weekly Sequence Assigned',
        body: `Your sequences for week of ${week_start_date}:\n${topics}`,
        url: '/sequences'
      });
    })
  );

  await prisma.sequence.updateMany({ where: { week_start_date }, data: { notified_trainer_at: new Date() } });
  res.json({ success: true });
});

// Sequence creator: AI-generated reference plan for next week (does not create any Sequence rows)
router.post('/ai-schedule', authenticate, requireRole('sequence_creator'), aiScheduleLimiter, async (req, res) => {
  const result = await generateWeeklySchedule();
  if (!result.configured) {
    return res.status(503).json({ error: 'AI scheduling is not configured yet' });
  }
  res.json(result);
});

// Shared transition: mark a sequence as uploaded with its Google Sheet link.
async function markUploaded(id, link) {
  return prisma.sequence.update({
    where: { id },
    data: { google_sheet_link: link, status: 'uploaded', uploaded_at: new Date() }
  });
}

// Assigned trainer: upload Google Sheet link
router.patch('/:id/upload', authenticate, requireRole('trainer'), async (req, res) => {
  const { google_sheet_link } = req.body;
  if (!google_sheet_link) return res.status(400).json({ error: 'google_sheet_link required' });

  const id = parseInt(req.params.id);
  const seq = await prisma.sequence.findUnique({ where: { id } });
  if (!seq) return res.status(404).json({ error: 'Not found' });
  if (seq.assigned_trainer_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

  await markUploaded(id, google_sheet_link.trim());

  res.json({ success: true });
});

// Assigned trainer: build sequence content in-app and auto-generate/update the Google Sheet
router.post('/:id/build', authenticate, requireRole('trainer'), async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items must be a non-empty array' });
  }
  for (const it of items) {
    if (!it || typeof it.name !== 'string' || !it.name.trim()) {
      return res.status(400).json({ error: 'Every item requires a non-empty name' });
    }
  }

  const id = parseInt(req.params.id);
  const seq = await prisma.sequence.findUnique({
    where: { id },
    include: { assigned_trainer: { select: { name: true } } }
  });
  if (!seq) return res.status(404).json({ error: 'Not found' });
  if (seq.assigned_trainer_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

  await prisma.$transaction([
    prisma.sequenceItem.deleteMany({ where: { sequence_id: id } }),
    prisma.sequenceItem.createMany({
      data: items.map((it, i) => ({
        sequence_id: id,
        sort_order: i,
        name: it.name.trim(),
        remarks: it.remarks || null,
        reference_url: it.reference_url || null
      }))
    })
  ]);

  const link = await upsertSequenceInSheet(seq, items);

  if (link) {
    await markUploaded(id, link);
    return res.json({ success: true, sheetSynced: true, google_sheet_link: link });
  }

  res.json({ success: true, sheetSynced: false });
});

// Assigned trainer: notify entire team about their uploaded sequence
router.post('/:id/notify-team', authenticate, requireRole('trainer'), async (req, res) => {
  const id = parseInt(req.params.id);
  const seq = await prisma.sequence.findUnique({
    where: { id },
    include: { assigned_trainer: { select: { name: true } } }
  });

  if (!seq) return res.status(404).json({ error: 'Not found' });
  if (seq.assigned_trainer_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  if (seq.status !== 'uploaded') return res.status(400).json({ error: 'Sequence must be uploaded first' });

  await notifyAll({
    title: 'Sequence Uploaded',
    body: `${seq.assigned_trainer.name} uploaded the sequence for ${seq.scheduled_date}: "${seq.topic}"`,
    url: `/sequences/${seq.id}`
  }).catch(() => {});

  await prisma.sequence.update({ where: { id }, data: { notified_team_at: new Date() } });
  res.json({ success: true });
});

// Sequence creator / admin: update sequence
router.put('/:id', authenticate, requireRole('super_admin', 'sequence_creator'), async (req, res) => {
  const { topic, scheduled_date, assigned_trainer_id, instructions } = req.body;
  const id = parseInt(req.params.id);
  const seq = await prisma.sequence.findUnique({ where: { id } });
  if (!seq) return res.status(404).json({ error: 'Not found' });

  const nextTrainerId = parseOptionalPositiveInt(assigned_trainer_id, 'assigned_trainer_id');
  if (nextTrainerId !== undefined) {
    await ensureTrainerExists(nextTrainerId);
  }

  await prisma.sequence.update({
    where: { id },
    data: {
      topic: topic ?? seq.topic,
      scheduled_date: scheduled_date ?? seq.scheduled_date,
      assigned_trainer_id: nextTrainerId ?? seq.assigned_trainer_id,
      instructions: instructions ?? seq.instructions
    }
  });

  res.json({ success: true });
});

// Sequence creator / admin: delete
router.delete('/:id', authenticate, requireRole('super_admin', 'sequence_creator'), async (req, res) => {
  await prisma.sequence.delete({ where: { id: parseInt(req.params.id) } });
  res.json({ success: true });
});

module.exports = router;
