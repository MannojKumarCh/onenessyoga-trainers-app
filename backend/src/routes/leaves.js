const router = require('express').Router();
const db = require('../db/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { sendToUser } = require('../utils/push');

// Trainer: my leaves
router.get('/my', authenticate, requireRole('trainer'), (req, res) => {
  const leaves = db.prepare(`
    SELECT l.*, u.name AS reviewed_by_name
    FROM leaves l LEFT JOIN users u ON l.reviewed_by = u.id
    WHERE l.trainer_id = ? ORDER BY l.created_at DESC
  `).all(req.user.id);
  res.json(leaves);
});

// Admin: all leaves
router.get('/', authenticate, requireRole('super_admin'), (req, res) => {
  const { status } = req.query;
  let query = `SELECT l.*, t.name AS trainer_name, u.name AS reviewed_by_name
    FROM leaves l
    LEFT JOIN users t ON l.trainer_id = t.id
    LEFT JOIN users u ON l.reviewed_by = u.id
    WHERE 1=1`;
  const params = [];
  if (status) { query += ' AND l.status = ?'; params.push(status); }
  query += ' ORDER BY l.created_at DESC';
  res.json(db.prepare(query).all(...params));
});

// Trainer: apply for leave
router.post('/', authenticate, requireRole('trainer'), (req, res) => {
  const { from_date, to_date, reason } = req.body;
  if (!from_date || !to_date || !reason) return res.status(400).json({ error: 'from_date, to_date, reason required' });
  if (from_date > to_date) return res.status(400).json({ error: 'from_date must be before to_date' });

  const result = db.prepare(
    'INSERT INTO leaves (trainer_id, from_date, to_date, reason) VALUES (?, ?, ?, ?)'
  ).run(req.user.id, from_date, to_date, reason.trim());

  res.status(201).json({ id: result.lastInsertRowid });
});

// Admin: approve or reject
router.patch('/:id/review', authenticate, requireRole('super_admin'), async (req, res) => {
  const { status, admin_note } = req.body;
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'status must be approved or rejected' });

  const leave = db.prepare('SELECT * FROM leaves WHERE id = ?').get(req.params.id);
  if (!leave) return res.status(404).json({ error: 'Leave not found' });

  db.prepare(`UPDATE leaves SET status=?, admin_note=?, reviewed_by=?, reviewed_at=datetime('now'), updated_at=datetime('now') WHERE id=?`)
    .run(status, admin_note || null, req.user.id, req.params.id);

  const trainer = db.prepare('SELECT name FROM users WHERE id = ?').get(leave.trainer_id);
  await sendToUser(leave.trainer_id, {
    title: `Leave ${status === 'approved' ? 'Approved' : 'Rejected'}`,
    body: `Your leave from ${leave.from_date} to ${leave.to_date} has been ${status}.${admin_note ? ' Note: ' + admin_note : ''}`,
    url: '/leaves'
  }).catch(() => {});

  res.json({ success: true });
});

// Trainer: cancel pending leave
router.delete('/:id', authenticate, requireRole('trainer'), (req, res) => {
  const leave = db.prepare('SELECT * FROM leaves WHERE id = ?').get(req.params.id);
  if (!leave) return res.status(404).json({ error: 'Not found' });
  if (leave.trainer_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  if (leave.status !== 'pending') return res.status(400).json({ error: 'Can only cancel pending leaves' });

  db.prepare('DELETE FROM leaves WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
