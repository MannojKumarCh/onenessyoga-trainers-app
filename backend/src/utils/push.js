const webpush = require('web-push');
const db = require('../db/db');

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

async function sendToUser(userId, payload) {
  const subs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId);
  const results = await Promise.allSettled(
    subs.map(row =>
      webpush.sendNotification(JSON.parse(row.subscription_json), JSON.stringify(payload))
        .catch(err => {
          if (err.statusCode === 410 || err.statusCode === 404) {
            db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(row.endpoint);
          }
          throw err;
        })
    )
  );
  return results;
}

async function sendToAll(payload) {
  const subs = db.prepare('SELECT * FROM push_subscriptions').all();
  const results = await Promise.allSettled(
    subs.map(row =>
      webpush.sendNotification(JSON.parse(row.subscription_json), JSON.stringify(payload))
        .catch(err => {
          if (err.statusCode === 410 || err.statusCode === 404) {
            db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(row.endpoint);
          }
          throw err;
        })
    )
  );
  return results;
}

async function sendToUsers(userIds, payload) {
  const placeholders = userIds.map(() => '?').join(',');
  const subs = db.prepare(`SELECT * FROM push_subscriptions WHERE user_id IN (${placeholders})`).all(...userIds);
  const results = await Promise.allSettled(
    subs.map(row =>
      webpush.sendNotification(JSON.parse(row.subscription_json), JSON.stringify(payload))
        .catch(err => {
          if (err.statusCode === 410 || err.statusCode === 404) {
            db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(row.endpoint);
          }
          throw err;
        })
    )
  );
  return results;
}

module.exports = { sendToUser, sendToAll, sendToUsers };
