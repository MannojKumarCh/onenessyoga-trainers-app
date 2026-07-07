const router = require('express').Router();
const prisma = require('../db/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { sendToUser, sendToAll } = require('../utils/push');

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
  const { week } = req.query;
  const sequences = await prisma.sequence.findMany({
    where: week ? { week_start_date: week } : {},
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
    include: withNames
  });
  if (!seq) return res.status(404).json({ error: 'Not found' });
  res.json(serialize(seq));
});

// Sequence creator / admin: create sequence assignment
router.post('/', authenticate, requireRole('super_admin', 'sequence_creator'), async (req, res) => {
  const { week_start_date, scheduled_date, topic, assigned_trainer_id, instructions } = req.body;
  if (!week_start_date || !scheduled_date || !topic || !assigned_trainer_id) {
    return res.status(400).json({ error: 'week_start_date, scheduled_date, topic, assigned_trainer_id required' });
  }

  const seq = await prisma.sequence.create({
    data: {
      week_start_date,
      scheduled_date,
      topic: topic.trim(),
      assigned_trainer_id,
      instructions: instructions || null,
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

  await sendToUser(seq.assigned_trainer_id, {
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
      return sendToUser(tid, {
        title: 'Weekly Sequence Assigned',
        body: `Your sequences for week of ${week_start_date}:\n${topics}`,
        url: '/sequences'
      });
    })
  );

  await prisma.sequence.updateMany({ where: { week_start_date }, data: { notified_trainer_at: new Date() } });
  res.json({ success: true });
});

// Assigned trainer: upload Google Sheet link
router.patch('/:id/upload', authenticate, requireRole('trainer'), async (req, res) => {
  const { google_sheet_link } = req.body;
  if (!google_sheet_link) return res.status(400).json({ error: 'google_sheet_link required' });

  const id = parseInt(req.params.id);
  const seq = await prisma.sequence.findUnique({ where: { id } });
  if (!seq) return res.status(404).json({ error: 'Not found' });
  if (seq.assigned_trainer_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

  await prisma.sequence.update({
    where: { id },
    data: { google_sheet_link: google_sheet_link.trim(), status: 'uploaded', uploaded_at: new Date() }
  });

  res.json({ success: true });
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

  await sendToAll({
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

  await prisma.sequence.update({
    where: { id },
    data: {
      topic: topic ?? seq.topic,
      scheduled_date: scheduled_date ?? seq.scheduled_date,
      assigned_trainer_id: assigned_trainer_id ?? seq.assigned_trainer_id,
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
