const router = require('express').Router();
const prisma = require('../db/db');
const { authenticate } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

['get', 'post', 'put', 'patch', 'delete'].forEach(method => {
  const original = router[method].bind(router);
  router[method] = (path, ...handlers) => original(path, ...handlers.map(handler => asyncHandler(handler)));
});

// Save push subscription
router.post('/subscribe', authenticate, async (req, res) => {
  const { subscription } = req.body;
  if (!subscription || !subscription.endpoint) return res.status(400).json({ error: 'subscription required' });

  await prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    update: { subscription_json: JSON.stringify(subscription) },
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
  res.json({ key: process.env.VAPID_PUBLIC_KEY });
});

module.exports = router;
