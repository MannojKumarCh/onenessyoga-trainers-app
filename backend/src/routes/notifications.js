const router = require('express').Router();
const db = require('../db/db');
const { authenticate } = require('../middleware/auth');

// Save push subscription
router.post('/subscribe', authenticate, (req, res) => {
  const { subscription } = req.body;
  if (!subscription || !subscription.endpoint) return res.status(400).json({ error: 'subscription required' });

  db.prepare(`
    INSERT INTO push_subscriptions (user_id, endpoint, subscription_json)
    VALUES (?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET subscription_json = excluded.subscription_json
  `).run(req.user.id, subscription.endpoint, JSON.stringify(subscription));

  res.json({ success: true });
});

// Remove push subscription
router.post('/unsubscribe', authenticate, (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'endpoint required' });
  db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').run(req.user.id, endpoint);
  res.json({ success: true });
});

// Get VAPID public key (needed by frontend to subscribe)
router.get('/vapid-public-key', (req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY });
});

module.exports = router;
