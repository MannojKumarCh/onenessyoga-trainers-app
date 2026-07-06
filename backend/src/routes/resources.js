const router = require('express').Router();
const db = require('../db/db');
const { authenticate, requireRole } = require('../middleware/auth');

// All roles: browse resources (by parent folder)
router.get('/', authenticate, (req, res) => {
  const { parent_id } = req.query;
  const parentId = parent_id ? parseInt(parent_id) : null;

  const items = db.prepare(`
    SELECT r.*, u.name AS created_by_name
    FROM resources r LEFT JOIN users u ON r.created_by = u.id
    WHERE ${parentId === null ? 'r.parent_id IS NULL' : 'r.parent_id = ?'}
    ORDER BY r.type DESC, r.sort_order ASC, r.name ASC
  `).all(...(parentId === null ? [] : [parentId]));

  // Build breadcrumb if inside a folder
  const breadcrumb = [];
  if (parentId) {
    let current = db.prepare('SELECT id, name, parent_id FROM resources WHERE id = ?').get(parentId);
    while (current) {
      breadcrumb.unshift({ id: current.id, name: current.name });
      current = current.parent_id ? db.prepare('SELECT id, name, parent_id FROM resources WHERE id = ?').get(current.parent_id) : null;
    }
  }

  res.json({ items, breadcrumb });
});

// Admin: create folder or link
router.post('/', authenticate, requireRole('super_admin'), (req, res) => {
  const { name, type, parent_id, url, thumbnail_url, sort_order } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'name and type required' });
  if (!['folder', 'link'].includes(type)) return res.status(400).json({ error: 'type must be folder or link' });
  if (type === 'link' && !url) return res.status(400).json({ error: 'url required for link type' });

  const result = db.prepare(`
    INSERT INTO resources (name, type, parent_id, url, thumbnail_url, sort_order, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(name.trim(), type, parent_id || null, url || null, thumbnail_url || null, sort_order || 0, req.user.id);

  res.status(201).json({ id: result.lastInsertRowid });
});

// Admin: update resource
router.put('/:id', authenticate, requireRole('super_admin'), (req, res) => {
  const { name, url, thumbnail_url, sort_order } = req.body;
  const item = db.prepare('SELECT * FROM resources WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });

  db.prepare(`UPDATE resources SET name=?, url=?, thumbnail_url=?, sort_order=?, updated_at=datetime('now') WHERE id=?`)
    .run(name ?? item.name, url ?? item.url, thumbnail_url ?? item.thumbnail_url, sort_order ?? item.sort_order, req.params.id);

  res.json({ success: true });
});

// Admin: delete resource (cascades to children via FK)
router.delete('/:id', authenticate, requireRole('super_admin'), (req, res) => {
  db.prepare('DELETE FROM resources WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
