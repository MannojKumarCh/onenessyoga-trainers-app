const webpush = require('web-push');
const prisma = require('../db/db');

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_EMAIL) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  console.log('[push] VAPID configured — push notifications enabled.');
} else {
  console.warn('[push] VAPID keys not configured — push notifications disabled.');
}

async function dispatch(subs, payload) {
  if (subs.length === 0) return [];

  return Promise.allSettled(
    subs.map(row => {
      let subscription;
      try {
        subscription = JSON.parse(row.subscription_json);
      } catch (parseErr) {
        console.error('[push] Corrupt subscription JSON for endpoint', row.endpoint, '— deleting row.');
        return prisma.pushSubscription.deleteMany({ where: { endpoint: row.endpoint } });
      }

      return webpush.sendNotification(subscription, JSON.stringify(payload))
        .catch(async err => {
          // 410 Gone or 404 Not Found = subscription expired/invalid, clean up
          if (err.statusCode === 410 || err.statusCode === 404) {
            console.warn('[push] Subscription expired (', err.statusCode, ') — removing endpoint', row.endpoint);
            await prisma.pushSubscription.deleteMany({ where: { endpoint: row.endpoint } });
          } else {
            console.error('[push] sendNotification failed for endpoint', row.endpoint, ':', err.statusCode || err.message);
          }
          throw err;
        });
    })
  );
}

async function sendToUser(userId, payload) {
  const subs = await prisma.pushSubscription.findMany({ where: { user_id: userId } });
  if (subs.length === 0) {
    console.warn('[push] No subscriptions found for user', userId);
    return [];
  }
  return dispatch(subs, payload);
}

async function sendToAll(payload) {
  const subs = await prisma.pushSubscription.findMany();
  return dispatch(subs, payload);
}

async function sendToUsers(userIds, payload) {
  const subs = await prisma.pushSubscription.findMany({ where: { user_id: { in: userIds } } });
  return dispatch(subs, payload);
}

module.exports = { sendToUser, sendToAll, sendToUsers };
