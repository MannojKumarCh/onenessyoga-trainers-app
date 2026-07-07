const webpush = require('web-push');
const prisma = require('../db/db');

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

async function dispatch(subs, payload) {
  return Promise.allSettled(
    subs.map(row =>
      webpush.sendNotification(JSON.parse(row.subscription_json), JSON.stringify(payload))
        .catch(err => {
          if (err.statusCode === 410 || err.statusCode === 404) {
            prisma.pushSubscription.deleteMany({ where: { endpoint: row.endpoint } });
          }
          throw err;
        })
    )
  );
}

async function sendToUser(userId, payload) {
  const subs = await prisma.pushSubscription.findMany({ where: { user_id: userId } });
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
