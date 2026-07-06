const router = require('express').Router();
const db = require('../db/db');
const { authenticate, requireRole } = require('../middleware/auth');

// Trainer: my upcoming sessions
router.get('/my', authenticate, requireRole('trainer'), (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const sessions = db.prepare(`
    SELECT s.*, u.name AS trainer_name
    FROM sessions s
    LEFT JOIN users u ON s.assigned_trainer_id = u.id
    WHERE s.assigned_trainer_id = ? AND s.scheduled_date >= ? AND s.is_completed = 0
    ORDER BY s.scheduled_date ASC, s.scheduled_time ASC
  `).all(req.user.id, today);
  res.json(sessions);
});

// Trainer: completed sessions (all trainers visible)
router.get('/completed', authenticate, (req, res) => {
  const sessions = db.prepare(`
    SELECT s.*, u.name AS trainer_name
    FROM sessions s
    LEFT JOIN users u ON s.assigned_trainer_id = u.id
    WHERE s.is_completed = 1
    ORDER BY s.scheduled_date DESC, s.scheduled_time DESC
    LIMIT 100
  `).all();
  res.json(sessions);
});

// Admin: all sessions
router.get('/', authenticate, requireRole('super_admin'), (req, res) => {
  const { from, to, trainer_id } = req.query;
  let query = `SELECT s.*, u.name AS trainer_name FROM sessions s LEFT JOIN users u ON s.assigned_trainer_id = u.id WHERE 1=1`;
  const params = [];
  if (from) { query += ' AND s.scheduled_date >= ?'; params.push(from); }
  if (to) { query += ' AND s.scheduled_date <= ?'; params.push(to); }
  if (trainer_id) { query += ' AND s.assigned_trainer_id = ?'; params.push(trainer_id); }
  query += ' ORDER BY s.scheduled_date DESC, s.scheduled_time ASC';
  res.json(db.prepare(query).all(...params));
});

// Get single session
router.get('/:id', authenticate, (req, res) => {
  const session = db.prepare(`
    SELECT s.*, u.name AS trainer_name, u.zoom_link AS trainer_zoom_link
    FROM sessions s LEFT JOIN users u ON s.assigned_trainer_id = u.id
    WHERE s.id = ?
  `).get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (req.user.role === 'trainer' && session.assigned_trainer_id !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.json(session);
});

// Admin: create session
router.post('/', authenticate, requireRole('super_admin'), (req, res) => {
  const { title, scheduled_date, scheduled_time, session_type, assigned_trainer_id, zoom_link } = req.body;
  if (!scheduled_date || !scheduled_time) return res.status(400).json({ error: 'Date and time required' });

  const result = db.prepare(`
    INSERT INTO sessions (title, scheduled_date, scheduled_time, session_type, assigned_trainer_id, zoom_link, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(title || 'Daily Session', scheduled_date, scheduled_time, session_type || 'BKP', assigned_trainer_id || null, zoom_link || null, req.user.id);

  res.status(201).json({ id: result.lastInsertRowid });
});

// Admin: bulk create sessions (for week scheduling)
router.post('/bulk', authenticate, requireRole('super_admin'), (req, res) => {
  const { sessions } = req.body;
  if (!Array.isArray(sessions) || sessions.length === 0) return res.status(400).json({ error: 'sessions array required' });

  const insert = db.prepare(`
    INSERT INTO sessions (title, scheduled_date, scheduled_time, session_type, assigned_trainer_id, zoom_link, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec('BEGIN');
  try {
    for (const s of sessions) {
      insert.run(s.title || 'Daily Session', s.scheduled_date, s.scheduled_time, s.session_type || 'BKP', s.assigned_trainer_id || null, s.zoom_link || null, req.user.id);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  res.status(201).json({ success: true, count: sessions.length });
});

// Admin: update session
router.put('/:id', authenticate, requireRole('super_admin'), (req, res) => {
  const { title, scheduled_date, scheduled_time, session_type, assigned_trainer_id, zoom_link } = req.body;
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Not found' });

  db.prepare(`UPDATE sessions SET title=?, scheduled_date=?, scheduled_time=?, session_type=?, assigned_trainer_id=?, zoom_link=?, updated_at=datetime('now') WHERE id=?`)
    .run(title ?? session.title, scheduled_date ?? session.scheduled_date, scheduled_time ?? session.scheduled_time, session_type ?? session.session_type, assigned_trainer_id ?? session.assigned_trainer_id, zoom_link ?? session.zoom_link, req.params.id);

  res.json({ success: true });
});

// Trainer: mark session complete / add notes
router.patch('/:id/complete', authenticate, requireRole('trainer'), (req, res) => {
  const { notes } = req.body;
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Not found' });
  if (session.assigned_trainer_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

  db.prepare(`UPDATE sessions SET is_completed=1, completed_at=datetime('now'), notes=?, updated_at=datetime('now') WHERE id=?`)
    .run(notes ?? session.notes, req.params.id);

  res.json({ success: true });
});

// Trainer: save notes without completing
router.patch('/:id/notes', authenticate, requireRole('trainer'), (req, res) => {
  const { notes } = req.body;
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Not found' });
  if (session.assigned_trainer_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

  db.prepare(`UPDATE sessions SET notes=?, updated_at=datetime('now') WHERE id=?`).run(notes, req.params.id);
  res.json({ success: true });
});

// Admin: delete session
router.delete('/:id', authenticate, requireRole('super_admin'), (req, res) => {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
