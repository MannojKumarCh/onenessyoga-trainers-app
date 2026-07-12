const router = require('express').Router();
const bcrypt = require('bcryptjs');
const prisma = require('../db/db');
const { authenticate, requireRole } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

['get', 'post', 'put', 'patch', 'delete'].forEach(method => {
  const original = router[method].bind(router);
  router[method] = (path, ...handlers) => original(path, ...handlers.map(handler => asyncHandler(handler)));
});

// Admin: list all trainers
router.get('/', authenticate, requireRole('super_admin'), async (req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, zoom_link: true, is_active: true, created_at: true },
    orderBy: { name: 'asc' }
  });
  res.json(users);
});

// Admin: create user
router.post('/', authenticate, requireRole('super_admin'), async (req, res) => {
  const { name, email, password, role, zoom_link } = req.body;
  if (!name || !email || !password || !role) return res.status(400).json({ error: 'name, email, password, role required' });
  if (!['super_admin', 'sequence_creator', 'trainer'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const normalizedEmail = email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) return res.status(409).json({ error: 'Email already exists' });

  const hash = bcrypt.hashSync(password, 10);
  const user = await prisma.user.create({
    data: { name: name.trim(), email: normalizedEmail, password_hash: hash, role, zoom_link: zoom_link || null }
  });

  res.status(201).json({ id: user.id });
});

// Admin: update user
router.put('/:id', authenticate, requireRole('super_admin'), async (req, res) => {
  const { name, email, role, zoom_link, is_active } = req.body;
  const id = parseInt(req.params.id);
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  await prisma.user.update({
    where: { id },
    data: {
      name: name ?? user.name,
      email: email ?? user.email,
      role: role ?? user.role,
      zoom_link: zoom_link ?? user.zoom_link,
      is_active: is_active !== undefined ? Boolean(is_active) : user.is_active
    }
  });

  res.json({ success: true });
});

// Admin: reset password
router.put('/:id/reset-password', authenticate, requireRole('super_admin'), async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const hash = bcrypt.hashSync(password, 10);
  await prisma.user.update({ where: { id: parseInt(req.params.id) }, data: { password_hash: hash } });
  res.json({ success: true });
});

// Admin: delete user
router.delete('/:id', authenticate, requireRole('super_admin'), async (req, res) => {
  const id = parseInt(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  await prisma.user.delete({ where: { id } });
  res.json({ success: true });
});

// All roles: list trainers only (for dropdowns)
router.get('/trainers', authenticate, async (req, res) => {
  const trainers = await prisma.user.findMany({
    where: { role: 'trainer', is_active: true },
    select: { id: true, name: true, email: true, zoom_link: true },
    orderBy: { name: 'asc' }
  });
  res.json(trainers);
});

module.exports = router;
