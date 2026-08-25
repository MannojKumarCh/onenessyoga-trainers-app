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

function parseWeekdays(weekdays) {
  if (!Array.isArray(weekdays) || weekdays.length === 0) {
    throw httpError(400, 'weekdays must be a non-empty array of 0-6');
  }
  const parsed = weekdays.map(Number);
  if (parsed.some(d => !Number.isInteger(d) || d < 0 || d > 6)) {
    throw httpError(400, 'weekdays must each be an integer 0 (Sun) - 6 (Sat)');
  }
  return [...new Set(parsed)];
}

// Super Admin: list the weekly-schedule slots
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

function formatSlotLabel(scheduled_time, weekdays) {
  const [h, m] = scheduled_time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const timeStr = `${h12}:${String(m).padStart(2, '0')} ${period}`;
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const sorted = [...weekdays].sort();
  const isMonToFri = sorted.length === 5 && [1, 2, 3, 4, 5].every(d => sorted.includes(d));
  if (isMonToFri) return timeStr;
  return `${sorted.map(d => dayNames[d]).join('/')} ${timeStr}`;
}

// Super Admin: add a new weekly-schedule slot
router.post('/', authenticate, requireRole('super_admin'), async (req, res) => {
  const { scheduled_time, weekdays, session_type, dedicated_trainer_id, zoom_link, title } = req.body;
  if (!scheduled_time || !/^\d{2}:\d{2}$/.test(scheduled_time)) {
    throw httpError(400, 'scheduled_time must be in HH:mm format');
  }
  const parsedWeekdays = parseWeekdays(weekdays);
  const trainerId = await ensureTrainerExists(parseOptionalPositiveIntLocal(dedicated_trainer_id), 'dedicated_trainer_id');

  const template = await prisma.sessionTemplate.create({
    data: {
      label: formatSlotLabel(scheduled_time, parsedWeekdays),
      scheduled_time,
      weekdays: parsedWeekdays,
      session_type: session_type || 'BKP',
      dedicated_trainer_id: trainerId,
      zoom_link: zoom_link || null,
      title: title || 'Daily Session'
    }
  });

  res.status(201).json({ id: template.id });
});

// Super Admin: permanently remove a slot. Only stops future generation for
// it - sessions already created from it (past or future) are left alone,
// same as switching is_active off; delete those individually from the
// Sessions tab if they should go too.
router.delete('/:id', authenticate, requireRole('super_admin'), async (req, res) => {
  const id = parseInt(req.params.id);
  const template = await prisma.sessionTemplate.findUnique({ where: { id } });
  if (!template) return res.status(404).json({ error: 'Not found' });

  await prisma.sessionTemplate.delete({ where: { id } });
  res.json({ success: true });
});

function parseOptionalPositiveIntLocal(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw httpError(400, 'dedicated_trainer_id must be a positive integer');
  }
  return parsed;
}

// Super Admin: edit a slot's time, weekdays, type, dedicated trainer, zoom
// link, or active state.
router.put('/:id', authenticate, requireRole('super_admin'), async (req, res) => {
  const id = parseInt(req.params.id);
  const template = await prisma.sessionTemplate.findUnique({ where: { id } });
  if (!template) return res.status(404).json({ error: 'Not found' });

  const { scheduled_time, session_type, dedicated_trainer_id, title, is_active, zoom_link, weekdays } = req.body;
  const nextWeekdays = weekdays !== undefined ? parseWeekdays(weekdays) : template.weekdays;

  const trainerId = dedicated_trainer_id !== undefined
    ? await ensureTrainerExists(parseOptionalPositiveIntLocal(dedicated_trainer_id), 'dedicated_trainer_id')
    : template.dedicated_trainer_id;

  const effectiveTime = scheduled_time ?? template.scheduled_time;
  const nextZoomLink = zoom_link !== undefined ? (zoom_link || null) : template.zoom_link;
  const zoomLinkChanged = nextZoomLink !== template.zoom_link;
  const trainerChanged = trainerId !== template.dedicated_trainer_id;

  await prisma.sessionTemplate.update({
    where: { id },
    data: {
      scheduled_time: effectiveTime,
      weekdays: nextWeekdays,
      session_type: session_type ?? template.session_type,
      title: title ?? template.title,
      is_active: is_active !== undefined ? Boolean(is_active) : template.is_active,
      dedicated_trainer_id: trainerId,
      zoom_link: nextZoomLink
    }
  });

  // Backfill: a changed default trainer repropagates to every current-day-or-
  // later session for this slot that hasn't had its trainer individually
  // overridden (assigned_trainer_is_override) - a session whose trainer was
  // set via the Sessions tab's Assign action is never touched here. A session
  // that's still on its inherited-from-template trainer (the common case) is
  // always updated, matching the same override-flag pattern used for Zoom Link.
  if (trainerChanged) {
    const todayIst = new Date(Date.now() + IST_OFFSET_MS).toISOString().split('T')[0];
    const candidates = await prisma.session.findMany({
      where: { scheduled_time: effectiveTime, assigned_trainer_is_override: false, scheduled_date: { gte: todayIst } },
      select: { id: true, scheduled_date: true }
    });
    const matchIds = candidates
      .filter(s => template.weekdays.includes(new Date(`${s.scheduled_date}T00:00:00Z`).getUTCDay()))
      .map(s => s.id);

    if (matchIds.length > 0) {
      await prisma.session.updateMany({ where: { id: { in: matchIds } }, data: { assigned_trainer_id: trainerId } });
      if (trainerId) {
        notifyUser(trainerId, {
          title: 'Default Sessions Assigned',
          body: `You're now the default trainer for ${matchIds.length} upcoming "${template.label}" session(s)`,
          url: '/sessions'
        }).catch(() => {});
      }
    }
  }

  // Backfill: a changed default Zoom Link repropagates to every future
  // session for this slot that hasn't had its Zoom Link explicitly
  // overridden for that one session (zoom_link_is_override). A session an
  // admin has manually set a link for is never touched here.
  if (zoomLinkChanged) {
    const todayIst = new Date(Date.now() + IST_OFFSET_MS).toISOString().split('T')[0];
    const candidates = await prisma.session.findMany({
      where: { scheduled_time: effectiveTime, zoom_link_is_override: false, scheduled_date: { gte: todayIst } },
      select: { id: true, scheduled_date: true }
    });
    const zoomMatchIds = candidates
      .filter(s => template.weekdays.includes(new Date(`${s.scheduled_date}T00:00:00Z`).getUTCDay()))
      .map(s => s.id);

    if (zoomMatchIds.length > 0) {
      await prisma.session.updateMany({ where: { id: { in: zoomMatchIds } }, data: { zoom_link: nextZoomLink } });
    }
  }

  res.json({ success: true });
});

module.exports = router;
