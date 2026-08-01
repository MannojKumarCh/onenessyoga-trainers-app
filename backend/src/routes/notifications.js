const router = require('express').Router();
const prisma = require('../db/db');
const { authenticate } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { notifyUser } = require('../utils/notify');
const validateIdParam = require('../middleware/validateIdParam');

['get', 'post', 'put', 'patch', 'delete'].forEach(method => {
  const original = router[method].bind(router);
  router[method] = (path, ...handlers) => original(path, ...handlers.map(handler => asyncHandler(handler)));
});

router.param('id', validateIdParam);

// Save push subscription
router.post('/subscribe', authenticate, async (req, res) => {
  const { subscription } = req.body;
  if (!subscription || !subscription.endpoint) return res.status(400).json({ error: 'subscription required' });

  await prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    update: { user_id: req.user.id, subscription_json: JSON.stringify(subscription) },
    create: { user_id: req.user.id, endpoint: subscription.endpoint, subscription_json: JSON.stringify(subscription) }
  });

  res.json({ success: true });
});

// Remove push subscription
router.post('/unsubscribe', authenticate, async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'endpoint required' });
  await prisma.pushSubscription.deleteMany({ where: { user_id: req.user.id, endpoint } });
  res.json({ success: true });
});

// Get VAPID public key (needed by frontend to subscribe)
router.get('/vapid-public-key', (req, res) => {
  if (!process.env.VAPID_PUBLIC_KEY) {
    return res.status(503).json({ error: 'Push notifications are not configured on this server' });
  }
  res.json({ key: process.env.VAPID_PUBLIC_KEY });
});

// Send a test push notification to the current user
router.post('/test-push', authenticate, async (req, res) => {
  await notifyUser(req.user.id, {
    title: '🔔 Push Notification Test',
    body: `Hello ${req.user.name.split(' ')[0]}! Push notifications are working on your device.`,
    url: '/notifications'
  });

  res.json({ success: true, message: 'Test notification sent' });
});

// ─── Notification Health Check (diagnostic endpoint) ───
router.get('/health', authenticate, async (req, res) => {
  const report = {
    vapid: { status: 'ok', configured: true },
    database: { status: 'ok', subscriptions: 0, notifications: 0 },
    userSubscriptions: { status: 'ok', count: 0, endpoints: [] }
  };

  // 1. VAPID config check
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_EMAIL) {
    report.vapid = { status: 'error', configured: false, message: 'VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, or VAPID_EMAIL missing from .env' };
  }

  // 2. Database connectivity + counts
  try {
    const [subCount, notifCount] = await Promise.all([
      prisma.pushSubscription.count(),
      prisma.notification.count()
    ]);
    report.database.subscriptions = subCount;
    report.database.notifications = notifCount;
  } catch (err) {
    report.database = { status: 'error', message: err.message };
  }

  // 3. Current user's subscriptions
  try {
    const userSubs = await prisma.pushSubscription.findMany({
      where: { user_id: req.user.id },
      select: { id: true, endpoint: true, created_at: true }
    });
    report.userSubscriptions.count = userSubs.length;
    report.userSubscriptions.endpoints = userSubs.map(s => ({
      id: s.id,
      endpoint: s.endpoint.substring(0, 80) + '…',
      created_at: s.created_at
    }));
    if (userSubs.length === 0) {
      report.userSubscriptions.status = 'warning';
      report.userSubscriptions.message = 'No push subscriptions found for your account. Enable notifications from the dashboard.';
    }
  } catch (err) {
    report.userSubscriptions = { status: 'error', message: err.message };
  }

  const overallStatus = [report.vapid, report.database, report.userSubscriptions]
    .some(r => r.status === 'error') ? 'error' : 'ok';

  res.json({ status: overallStatus, ...report });
});

// ─── In-app notification inbox ───

// Recent unread notifications, for the bell dropdown
router.get('/unread', authenticate, async (req, res) => {
  const notifications = await prisma.notification.findMany({
    where: { user_id: req.user.id, is_read: false },
    orderBy: { created_at: 'desc' },
    take: 20
  });
  res.json(notifications);
});

// Unread count, for the bell badge
router.get('/unread-count', authenticate, async (req, res) => {
  const count = await prisma.notification.count({ where: { user_id: req.user.id, is_read: false } });
  res.json({ count });
});

// Recent history (read + unread), for the full notifications page
router.get('/history', authenticate, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 30, 30);
  const notifications = await prisma.notification.findMany({
    where: { user_id: req.user.id },
    orderBy: { created_at: 'desc' },
    take: limit
  });
  res.json(notifications);
});

// Mark all unread notifications as read
router.patch('/read-all', authenticate, async (req, res) => {
  await prisma.notification.updateMany({
    where: { user_id: req.user.id, is_read: false },
    data: { is_read: true }
  });
  res.json({ success: true });
});

// Mark one notification as read
router.patch('/:id/read', authenticate, async (req, res) => {
  const id = parseInt(req.params.id);
  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification) return res.status(404).json({ error: 'Not found' });
  if (notification.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

  const updated = await prisma.notification.update({ where: { id }, data: { is_read: true } });
  res.json(updated);
});

module.exports = router;
