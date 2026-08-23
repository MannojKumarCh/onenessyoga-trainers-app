const router = require('express').Router();
const prisma = require('../db/db');
const { authenticate, requireRole } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const validateIdParam = require('../middleware/validateIdParam');
const { notifyUser } = require('../utils/notify');
const { ensureTrainerExists } = require('../utils/trainers');

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

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

// Super Admin: list the 8 fixed weekly-schedule slots
router.get('/', authenticate, requireRole('super_admin'), async (req, res) => {
  const templates = await prisma.sessionTemplate.findMany({
    include: { dedicated_trainer: { select: { name: true } } },
    orderBy: { scheduled_time: 'asc' }
  });
  res.json(templates.map(({ dedicated_trainer, ...rest }) => ({
    ...rest,
    dedicated_trainer_name: dedicated_trainer?.name ?? null
  })));
});

// Super Admin: edit a slot's time, type, dedicated trainer, or active state.
// weekdays is intentionally not editable here - the 8 slots are fixed.
router.put('/:id', authenticate, requireRole('super_admin'), async (req, res) => {
  const id = parseInt(req.params.id);
  const template = await prisma.sessionTemplate.findUnique({ where: { id } });
  if (!template) return res.status(404).json({ error: 'Not found' });

  const { scheduled_time, session_type, dedicated_trainer_id, title, is_active } = req.body;

  let trainerId = template.dedicated_trainer_id;
  if (dedicated_trainer_id !== undefined) {
    if (dedicated_trainer_id === null || dedicated_trainer_id === '') {
      trainerId = null;
    } else {
      const parsed = Number(dedicated_trainer_id);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw httpError(400, 'dedicated_trainer_id must be a positive integer');
      }
      trainerId = await ensureTrainerExists(parsed, 'dedicated_trainer_id');
    }
  }

  const effectiveTime = scheduled_time ?? template.scheduled_time;

  await prisma.sessionTemplate.update({
    where: { id },
    data: {
      scheduled_time: effectiveTime,
      session_type: session_type ?? template.session_type,
      title: title ?? template.title,
      is_active: is_active !== undefined ? Boolean(is_active) : template.is_active,
      dedicated_trainer_id: trainerId
    }
  });

  // Backfill: a newly-set default trainer fills in currently-Unassigned upcoming
  // sessions for this slot. Never touches sessions that already have a trainer
  // (assigned via an earlier default or a manual override) - template edits
  // must never retroactively override an explicit assignment.
  if (trainerId && trainerId !== template.dedicated_trainer_id) {
    const todayIst = new Date(Date.now() + IST_OFFSET_MS).toISOString().split('T')[0];
    const candidates = await prisma.session.findMany({
      where: { scheduled_time: effectiveTime, assigned_trainer_id: null, scheduled_date: { gte: todayIst } },
      select: { id: true, scheduled_date: true }
    });
    const matchIds = candidates
      .filter(s => template.weekdays.includes(new Date(`${s.scheduled_date}T00:00:00Z`).getUTCDay()))
      .map(s => s.id);

    if (matchIds.length > 0) {
      await prisma.session.updateMany({ where: { id: { in: matchIds } }, data: { assigned_trainer_id: trainerId } });
      notifyUser(trainerId, {
        title: 'Default Sessions Assigned',
        body: `You're now the default trainer for ${matchIds.length} upcoming "${template.label}" session(s)`,
        url: '/sessions'
      }).catch(() => {});
    }
  }

  res.json({ success: true });
});

module.exports = router;
