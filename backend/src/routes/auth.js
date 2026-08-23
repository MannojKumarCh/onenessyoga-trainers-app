const router = require('express').Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { OAuth2Client } = require('google-auth-library');
const prisma = require('../db/db');
const { authenticate } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { notifyUsers } = require('../utils/notify');
const { sendGoogleLinkPendingEmail, sendPasswordResetEmail } = require('../utils/mail');

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

['get', 'post', 'put', 'patch', 'delete'].forEach(method => {
  const original = router[method].bind(router);
  router[method] = (path, ...handlers) => original(path, ...handlers.map(handler => asyncHandler(handler)));
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' }
});

router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = await prisma.user.findFirst({
    where: { email: email.toLowerCase().trim() }
  });
  if (!user) return res.status(401).json({ error: 'No account found with this email address' });
  if (!user.is_active) return res.status(403).json({ error: 'Your account has been deactivated. Please contact an admin' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Incorrect password. Please check and try again' });

  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, roles: user.roles },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, roles: user.roles, zoom_link: user.zoom_link, must_change_password: user.must_change_password }
  });
});

router.post('/google', loginLimiter, async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'credential is required' });

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    payload = ticket.getPayload();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid Google credential' });
  }

  if (!payload?.email_verified) {
    return res.status(401).json({ error: 'Google account email is not verified' });
  }

  const email = payload.email.toLowerCase().trim();
  const sub = payload.sub;

  const user = await prisma.user.findFirst({ where: { email, is_active: true } });
  if (!user) return res.status(404).json({ error: 'No matching account found' });

  if (!user.google_id) {
    await prisma.user.update({
      where: { id: user.id },
      data: { google_id: sub, google_link_status: 'pending' }
    });

    const admins = await prisma.user.findMany({
      where: { roles: { has: 'super_admin' }, is_active: true },
      select: { id: true, name: true, email: true }
    });

    await Promise.allSettled([
      notifyUsers(admins.map(a => a.id), {
        title: 'Google sign-in request',
        body: `${user.name} wants to sign in with Google. Approve or reject in Trainers.`,
        url: '/trainers'
      }),
      ...admins.map(admin => sendGoogleLinkPendingEmail(admin, user))
    ]);

    return res.status(202).json({
      status: 'pending',
      message: 'Request submitted. An admin must approve Google sign-in for your account.'
    });
  }

  if (user.google_link_status === 'pending') {
    return res.status(202).json({ status: 'pending', message: 'Still awaiting admin approval.' });
  }

  if (user.google_link_status === 'rejected') {
    return res.status(403).json({
      status: 'rejected',
      message: 'Google sign-in was rejected for this account. Contact an admin.'
    });
  }

  // approved
  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, roles: user.roles },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, roles: user.roles, zoom_link: user.zoom_link, must_change_password: user.must_change_password }
  });
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password reset requests, please try again later.' }
});

router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const user = await prisma.user.findFirst({ where: { email: email.toLowerCase().trim(), is_active: true } });
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    await prisma.passwordReset.create({
      data: { user_id: user.id, token, expires_at: new Date(Date.now() + RESET_TOKEN_TTL_MS) }
    });
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${token}`;
    sendPasswordResetEmail(user, resetUrl).catch(err => console.error('Failed to send password reset email:', err));
  }

  // Same response whether or not the email matched an account, so this
  // endpoint can't be used to check which emails have accounts.
  res.json({ success: true, message: 'If an account exists for that email, a reset link has been sent.' });
});

router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and password are required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const reset = await prisma.passwordReset.findUnique({ where: { token } });
  if (!reset || reset.used_at || reset.expires_at < new Date()) {
    return res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
  }

  const hash = await bcrypt.hash(password, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: reset.user_id }, data: { password_hash: hash, must_change_password: false } }),
    prisma.passwordReset.update({ where: { id: reset.id }, data: { used_at: new Date() } })
  ]);

  res.json({ success: true });
});

router.get('/me', authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, name: true, email: true, roles: true, zoom_link: true, created_at: true, must_change_password: true }
  });
  res.json(user);
});

router.put('/me', authenticate, async (req, res) => {
  const { name, zoom_link } = req.body;
  await prisma.user.update({
    where: { id: req.user.id },
    data: { name: name || req.user.name, zoom_link: zoom_link ?? null }
  });
  res.json({ success: true });
});

router.put('/me/password', authenticate, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'Both passwords required' });
  if (new_password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!(await bcrypt.compare(current_password, user.password_hash))) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const hash = await bcrypt.hash(new_password, 10);
  await prisma.user.update({ where: { id: req.user.id }, data: { password_hash: hash, must_change_password: false } });
  res.json({ success: true });
});

module.exports = router;
