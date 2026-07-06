const router = require('express').Router();
const db = require('../db/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { sendToUser, sendToAll } = require('../utils/push');

// All roles: view sequences (all can see)
router.get('/', authenticate, (req, res) => {
  const { week } = req.query;
  let query = `
    SELECT s.*, t.name AS trainer_name, c.name AS created_by_name
    FROM sequences s
    LEFT JOIN users t ON s.assigned_trainer_id = t.id
    LEFT JOIN users c ON s.created_by = c.id
    WHERE 1=1
  `;
  const params = [];
  if (week) { query += ' AND s.week_start_date = ?'; params.push(week); }
  query += ' ORDER BY s.scheduled_date ASC';
  res.json(db.prepare(query).all(...params));
});

// Get available weeks
router.get('/weeks', authenticate, (req, res) => {
  const weeks = db.prepare(`SELECT DISTINCT week_start_date FROM sequences ORDER BY week_start_date DESC LIMIT 20`).all();
  res.json(weeks.map(w => w.week_start_date));
});

// Get single sequence
router.get('/:id', authenticate, (req, res) => {
  const seq = db.prepare(`
    SELECT s.*, t.name AS trainer_name, c.name AS created_by_name
    FROM sequences s
    LEFT JOIN users t ON s.assigned_trainer_id = t.id
    LEFT JOIN users c ON s.created_by = c.id
    WHERE s.id = ?
  `).get(req.params.id);
  if (!seq) return res.status(404).json({ error: 'Not found' });
  res.json(seq);
});

// Sequence creator / admin: create sequence assignment
router.post('/', authenticate, requireRole('super_admin', 'sequence_creator'), (req, res) => {
  const { week_start_date, scheduled_date, topic, assigned_trainer_id, instructions } = req.body;
  if (!week_start_date || !scheduled_date || !topic || !assigned_trainer_id) {
    return res.status(400).json({ error: 'week_start_date, scheduled_date, topic, assigned_trainer_id required' });
  }

  const result = db.prepare(`
    INSERT INTO sequences (week_start_date, scheduled_date, topic, assigned_trainer_id, instructions, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(week_start_date, scheduled_date, topic.trim(), assigned_trainer_id, instructions || null, req.user.id);

  res.status(201).json({ id: result.lastInsertRowid });
});

// Sequence creator / admin: notify assigned trainer
router.post('/:id/notify-trainer', authenticate, requireRole('super_admin', 'sequence_creator'), async (req, res) => {
  const seq = db.prepare('SELECT * FROM sequences WHERE id = ?').get(req.params.id);
  if (!seq) return res.status(404).json({ error: 'Not found' });

  const trainer = db.prepare('SELECT name FROM users WHERE id = ?').get(seq.assigned_trainer_id);

  await sendToUser(seq.assigned_trainer_id, {
    title: 'Sequence Assignment',
    body: `You have been assigned "${seq.topic}" on ${seq.scheduled_date}. Please prepare and upload your Google Sheet.`,
    url: `/sequences/${seq.id}`
  }).catch(() => {});

  db.prepare(`UPDATE sequences SET notified_trainer_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(seq.id);
  res.json({ success: true });
});

// Sequence creator / admin: notify entire week's trainers at once
router.post('/notify-week', authenticate, requireRole('super_admin', 'sequence_creator'), async (req, res) => {
  const { week_start_date } = req.body;
  if (!week_start_date) return res.status(400).json({ error: 'week_start_date required' });

  const seqs = db.prepare('SELECT * FROM sequences WHERE week_start_date = ?').all(week_start_date);
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

  db.prepare(`UPDATE sequences SET notified_trainer_at = datetime('now'), updated_at = datetime('now') WHERE week_start_date = ?`).run(week_start_date);
  res.json({ success: true });
});

// Assigned trainer: upload Google Sheet link
router.patch('/:id/upload', authenticate, requireRole('trainer'), async (req, res) => {
  const { google_sheet_link } = req.body;
  if (!google_sheet_link) return res.status(400).json({ error: 'google_sheet_link required' });

  const seq = db.prepare('SELECT * FROM sequences WHERE id = ?').get(req.params.id);
  if (!seq) return res.status(404).json({ error: 'Not found' });
  if (seq.assigned_trainer_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

  db.prepare(`UPDATE sequences SET google_sheet_link=?, status='uploaded', uploaded_at=datetime('now'), updated_at=datetime('now') WHERE id=?`)
    .run(google_sheet_link.trim(), req.params.id);

  res.json({ success: true });
});

// Assigned trainer: notify entire team about their uploaded sequence
router.post('/:id/notify-team', authenticate, requireRole('trainer'), async (req, res) => {
  const seq = db.prepare(`
    SELECT s.*, t.name AS trainer_name FROM sequences s
    LEFT JOIN users t ON s.assigned_trainer_id = t.id
    WHERE s.id = ?
  `).get(req.params.id);

  if (!seq) return res.status(404).json({ error: 'Not found' });
  if (seq.assigned_trainer_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  if (seq.status !== 'uploaded') return res.status(400).json({ error: 'Sequence must be uploaded first' });

  await sendToAll({
    title: 'Sequence Uploaded',
    body: `${seq.trainer_name} uploaded the sequence for ${seq.scheduled_date}: "${seq.topic}"`,
    url: `/sequences/${seq.id}`
  }).catch(() => {});

  db.prepare(`UPDATE sequences SET notified_team_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(seq.id);
  res.json({ success: true });
});

// Sequence creator / admin: update sequence
router.put('/:id', authenticate, requireRole('super_admin', 'sequence_creator'), (req, res) => {
  const { topic, scheduled_date, assigned_trainer_id, instructions } = req.body;
  const seq = db.prepare('SELECT * FROM sequences WHERE id = ?').get(req.params.id);
  if (!seq) return res.status(404).json({ error: 'Not found' });

  db.prepare(`UPDATE sequences SET topic=?, scheduled_date=?, assigned_trainer_id=?, instructions=?, updated_at=datetime('now') WHERE id=?`)
    .run(topic ?? seq.topic, scheduled_date ?? seq.scheduled_date, assigned_trainer_id ?? seq.assigned_trainer_id, instructions ?? seq.instructions, req.params.id);

  res.json({ success: true });
});

// Sequence creator / admin: delete
router.delete('/:id', authenticate, requireRole('super_admin', 'sequence_creator'), (req, res) => {
  db.prepare('DELETE FROM sequences WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
