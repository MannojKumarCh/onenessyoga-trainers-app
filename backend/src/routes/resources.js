const router = require('express').Router();
const prisma = require('../db/db');
const { authenticate, requireRole } = require('../middleware/auth');

// All roles: browse resources (by parent folder)
router.get('/', authenticate, async (req, res) => {
  const { parent_id } = req.query;
  const parentId = parent_id ? parseInt(parent_id) : null;

  const items = await prisma.resource.findMany({
    where: { parent_id: parentId },
    include: { creator: { select: { name: true } } },
    orderBy: [{ type: 'desc' }, { sort_order: 'asc' }, { name: 'asc' }]
  });

  const breadcrumb = [];
  if (parentId) {
    let current = await prisma.resource.findUnique({
      where: { id: parentId },
      select: { id: true, name: true, parent_id: true }
    });
    while (current) {
      breadcrumb.unshift({ id: current.id, name: current.name });
      current = current.parent_id
        ? await prisma.resource.findUnique({ where: { id: current.parent_id }, select: { id: true, name: true, parent_id: true } })
        : null;
    }
  }

  res.json({
    items: items.map(({ creator, ...r }) => ({ ...r, created_by_name: creator?.name ?? null })),
    breadcrumb
  });
});

// Admin: create folder or link
router.post('/', authenticate, requireRole('super_admin'), async (req, res) => {
  const { name, type, parent_id, url, thumbnail_url, sort_order } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'name and type required' });
  if (!['folder', 'link'].includes(type)) return res.status(400).json({ error: 'type must be folder or link' });
  if (type === 'link' && !url) return res.status(400).json({ error: 'url required for link type' });

  const resource = await prisma.resource.create({
    data: {
      name: name.trim(),
      type,
      parent_id: parent_id || null,
      url: url || null,
      thumbnail_url: thumbnail_url || null,
      sort_order: sort_order || 0,
      created_by: req.user.id
    }
  });

  res.status(201).json({ id: resource.id });
});

// Admin: update resource
router.put('/:id', authenticate, requireRole('super_admin'), async (req, res) => {
  const { name, url, thumbnail_url, sort_order } = req.body;
  const id = parseInt(req.params.id);
  const item = await prisma.resource.findUnique({ where: { id } });
  if (!item) return res.status(404).json({ error: 'Not found' });

  await prisma.resource.update({
    where: { id },
    data: {
      name: name ?? item.name,
      url: url ?? item.url,
      thumbnail_url: thumbnail_url ?? item.thumbnail_url,
      sort_order: sort_order ?? item.sort_order
    }
  });

  res.json({ success: true });
});

// Admin: delete resource (cascades to children via FK)
router.delete('/:id', authenticate, requireRole('super_admin'), async (req, res) => {
  await prisma.resource.delete({ where: { id: parseInt(req.params.id) } });
  res.json({ success: true });
});

module.exports = router;
