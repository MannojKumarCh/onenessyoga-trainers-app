const router = require('express').Router();
const prisma = require('../db/db');
const { authenticate, requireRole } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
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
      const trainer = await prisma.user.findUnique({ where: { id: parsed }, select: { id: true, roles: true } });
      if (!trainer || !trainer.roles.includes('trainer')) {
        throw httpError(400, 'dedicated_trainer_id must reference an existing trainer');
      }
      trainerId = parsed;
    }
  }

  await prisma.sessionTemplate.update({
    where: { id },
    data: {
      scheduled_time: scheduled_time ?? template.scheduled_time,
      session_type: session_type ?? template.session_type,
      title: title ?? template.title,
      is_active: is_active !== undefined ? Boolean(is_active) : template.is_active,
      dedicated_trainer_id: trainerId
    }
  });

  res.json({ success: true });
});

module.exports = router;
