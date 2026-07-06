const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db/db');
const { authenticate, requireRole } = require('../middleware/auth');

// Admin: list all trainers
router.get('/', authenticate, requireRole('super_admin'), (req, res) => {
  const users = db.prepare('SELECT id, name, email, role, zoom_link, is_active, created_at FROM users ORDER BY name').all();
  res.json(users);
});

// Admin: create user
router.post('/', authenticate, requireRole('super_admin'), (req, res) => {
  const { name, email, password, role, zoom_link } = req.body;
  if (!name || !email || !password || !role) return res.status(400).json({ error: 'name, email, password, role required' });
  if (!['super_admin', 'sequence_creator', 'trainer'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) return res.status(409).json({ error: 'Email already exists' });

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO users (name, email, password_hash, role, zoom_link) VALUES (?, ?, ?, ?, ?)'
  ).run(name.trim(), email.toLowerCase().trim(), hash, role, zoom_link || null);

  res.status(201).json({ id: result.lastInsertRowid });
});

// Admin: update user
router.put('/:id', authenticate, requireRole('super_admin'), (req, res) => {
  const { name, email, role, zoom_link, is_active } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  db.prepare(`UPDATE users SET name = ?, email = ?, role = ?, zoom_link = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(name ?? user.name, email ?? user.email, role ?? user.role, zoom_link ?? user.zoom_link, is_active ?? user.is_active, req.params.id);

  res.json({ success: true });
});

// Admin: reset password
router.put('/:id/reset-password', authenticate, requireRole('super_admin'), (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE id = ?').run(hash, req.params.id);
  res.json({ success: true });
});

// Admin: delete user
router.delete('/:id', authenticate, requireRole('super_admin'), (req, res) => {
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// All roles: list trainers only (for dropdowns)
router.get('/trainers', authenticate, (req, res) => {
  const trainers = db.prepare('SELECT id, name, email, zoom_link FROM users WHERE role = "trainer" AND is_active = 1 ORDER BY name').all();
  res.json(trainers);
});

module.exports = router;
