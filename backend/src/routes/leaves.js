const router = require('express').Router();
const prisma = require('../db/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { notifyUser, notifyUsers } = require('../utils/notify');
const asyncHandler = require('../utils/asyncHandler');
const validateIdParam = require('../middleware/validateIdParam');

['get', 'post', 'put', 'patch', 'delete'].forEach(method => {
  const original = router[method].bind(router);
  router[method] = (path, ...handlers) => original(path, ...handlers.map(handler => asyncHandler(handler)));
});

router.param('id', validateIdParam);

// Trainer: my leaves
router.get('/my', authenticate, requireRole('trainer'), async (req, res) => {
  const leaves = await prisma.leave.findMany({
    where: { trainer_id: req.user.id },
    include: { reviewer: { select: { name: true } } },
    orderBy: { created_at: 'desc' }
  });
  res.json(leaves.map(({ reviewer, ...l }) => ({ ...l, reviewed_by_name: reviewer?.name ?? null })));
});

// Admin: all leaves
router.get('/', authenticate, requireRole('super_admin'), async (req, res) => {
  const { status } = req.query;
  const leaves = await prisma.leave.findMany({
    where: status ? { status } : {},
    include: { trainer: { select: { name: true } }, reviewer: { select: { name: true } } },
    orderBy: { created_at: 'desc' }
  });
  res.json(leaves.map(({ trainer, reviewer, ...l }) => ({
    ...l,
    trainer_name: trainer?.name ?? null,
    reviewed_by_name: reviewer?.name ?? null
  })));
});

// Trainer: apply for leave
router.post('/', authenticate, requireRole('trainer'), async (req, res) => {
  const { from_date, to_date, reason } = req.body;
  if (!from_date || !to_date || !reason) return res.status(400).json({ error: 'from_date, to_date, reason required' });
  if (from_date > to_date) return res.status(400).json({ error: 'from_date must be before to_date' });

  const leave = await prisma.leave.create({
    data: { trainer_id: req.user.id, from_date, to_date, reason: reason.trim() }
  });

  const admins = await prisma.user.findMany({ where: { roles: { has: 'super_admin' }, is_active: true }, select: { id: true } });
  if (admins.length > 0) {
    notifyUsers(admins.map(a => a.id), {
      title: 'New Leave Application',
      body: `${req.user.name} applied for leave (${from_date} to ${to_date}): "${reason.trim()}"`,
      url: '/leaves'
    }).catch(() => {});
  }

  res.status(201).json({ id: leave.id });
});

// Admin: approve or reject
router.patch('/:id/review', authenticate, requireRole('super_admin'), async (req, res) => {
  const { status, admin_note } = req.body;
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'status must be approved or rejected' });

  const id = parseInt(req.params.id);
  const leave = await prisma.leave.findUnique({ where: { id } });
  if (!leave) return res.status(404).json({ error: 'Leave not found' });

  await prisma.leave.update({
    where: { id },
    data: { status, admin_note: admin_note || null, reviewed_by: req.user.id, reviewed_at: new Date() }
  });

  await notifyUser(leave.trainer_id, {
    title: `Leave ${status === 'approved' ? 'Approved' : 'Rejected'}`,
    body: `Your leave from ${leave.from_date} to ${leave.to_date} has been ${status}.${admin_note ? ' Note: ' + admin_note : ''}`,
    url: '/leaves'
  }).catch(() => {});

  res.json({ success: true });
});

// Trainer: cancel pending leave
router.delete('/:id', authenticate, requireRole('trainer'), async (req, res) => {
  const id = parseInt(req.params.id);
  const leave = await prisma.leave.findUnique({ where: { id } });
  if (!leave) return res.status(404).json({ error: 'Not found' });
  if (leave.trainer_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  if (leave.status !== 'pending') return res.status(400).json({ error: 'Can only cancel pending leaves' });

  await prisma.leave.delete({ where: { id } });
  res.json({ success: true });
});

module.exports = router;
