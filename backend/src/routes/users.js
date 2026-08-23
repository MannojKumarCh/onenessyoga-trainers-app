const router = require('express').Router();
const bcrypt = require('bcryptjs');
const prisma = require('../db/db');
const { authenticate, requireRole } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { sendWelcomeEmail, sendGoogleLinkDecisionEmail } = require('../utils/mail');
const { notifyUser } = require('../utils/notify');
const { shareSpreadsheetWithTrainer } = require('../utils/sheets');
const validateIdParam = require('../middleware/validateIdParam');

['get', 'post', 'put', 'patch', 'delete'].forEach(method => {
  const original = router[method].bind(router);
  router[method] = (path, ...handlers) => original(path, ...handlers.map(handler => asyncHandler(handler)));
});

router.param('id', validateIdParam);

const VALID_ROLES = ['super_admin', 'sequence_creator', 'trainer'];

function validateRoles(roles) {
  if (!Array.isArray(roles) || roles.length === 0) return 'roles must be a non-empty array';
  if (!roles.every(r => VALID_ROLES.includes(r))) return 'Invalid role';
  if (new Set(roles).size !== roles.length) return 'roles must not contain duplicates';
  return null;
}

// Admin: list all trainers
router.get('/', authenticate, requireRole('super_admin'), async (req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, roles: true, zoom_link: true, is_active: true, google_link_status: true, created_at: true },
    orderBy: { name: 'asc' }
  });
  res.json(users);
});

// Admin: create user
router.post('/', authenticate, requireRole('super_admin'), async (req, res) => {
  const { name, email, password, roles, zoom_link } = req.body;
  if (!name || !email || !password || !roles) return res.status(400).json({ error: 'name, email, password, roles required' });
  const rolesError = validateRoles(roles);
  if (rolesError) return res.status(400).json({ error: rolesError });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const normalizedEmail = email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) return res.status(409).json({ error: 'Email already exists' });

  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name: name.trim(), email: normalizedEmail, password_hash: hash, roles, zoom_link: zoom_link || null, must_change_password: true }
  });

  await sendWelcomeEmail(user).catch(err => console.error('Failed to send welcome email:', err));

  res.status(201).json({ id: user.id });
});

// Admin: update user
router.put('/:id', authenticate, requireRole('super_admin'), async (req, res) => {
  const { name, email, roles, zoom_link, is_active } = req.body;
  const id = parseInt(req.params.id);
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (roles !== undefined) {
    const rolesError = validateRoles(roles);
    if (rolesError) return res.status(400).json({ error: rolesError });
  }

  let normalizedEmail = user.email;
  if (email !== undefined) {
    normalizedEmail = email.toLowerCase().trim();
    if (normalizedEmail !== user.email) {
      const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (existing) return res.status(409).json({ error: 'Email already exists' });
    }
  }

  await prisma.user.update({
    where: { id },
    data: {
      name: name ?? user.name,
      email: normalizedEmail,
      roles: roles ?? user.roles,
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

  const hash = await bcrypt.hash(password, 10);
  await prisma.user.update({ where: { id: parseInt(req.params.id) }, data: { password_hash: hash, must_change_password: true } });
  res.json({ success: true });
});

// Admin: approve or reject a pending Google sign-in link
router.put('/:id/google-link', authenticate, requireRole('super_admin'), async (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'status must be approved or rejected' });
  }

  const id = parseInt(req.params.id);
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.google_link_status !== 'pending') {
    return res.status(400).json({ error: 'Only pending requests can be approved or rejected' });
  }

  await prisma.user.update({
    where: { id },
    data: status === 'approved'
      ? { google_link_status: 'approved', google_linked_at: new Date() }
      : { google_link_status: 'rejected', google_id: null }
  });

  await notifyUser(user.id, {
    title: status === 'approved' ? 'Google Sign-In Approved' : 'Google Sign-In Request Rejected',
    body: status === 'approved'
      ? 'You can now sign in with Google.'
      : 'Your Google sign-in request was not approved. Contact an admin or use your password to log in.',
    url: '/'
  }).catch(err => console.error('Failed to send Google-link decision notification:', err));

  await sendGoogleLinkDecisionEmail(user, status).catch(err => console.error('Failed to send Google-link decision email:', err));

  if (status === 'approved') {
    const now = new Date();
    const year_month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    prisma.monthlySheet.findUnique({ where: { year_month } })
      .then(monthlySheet => {
        if (monthlySheet) {
          return shareSpreadsheetWithTrainer(monthlySheet.spreadsheet_id, user.email);
        }
      })
      .catch(err => console.error('Failed to share monthly sheet:', err));
  }

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
    where: { roles: { has: 'trainer' }, is_active: true },
    select: { id: true, name: true, email: true, zoom_link: true },
    orderBy: { name: 'asc' }
  });
  res.json(trainers);
});

module.exports = router;
