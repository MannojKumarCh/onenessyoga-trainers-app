const prisma = require('../db/db');
const push = require('./push');

async function notifyUser(userId, payload) {
  await prisma.notification.create({
    data: { user_id: userId, title: payload.title, body: payload.body, url: payload.url }
  });
  return push.sendToUser(userId, payload).catch(err => {
    console.error('[push] Failed to send push to user', userId, ':', err.message || err);
  });
}

async function notifyUsers(userIds, payload) {
  await prisma.notification.createMany({
    data: userIds.map(userId => ({ user_id: userId, title: payload.title, body: payload.body, url: payload.url }))
  });
  return push.sendToUsers(userIds, payload).catch(err => {
    console.error('[push] Failed to send push to users', userIds, ':', err.message || err);
  });
}

async function notifyAll(payload) {
  const users = await prisma.user.findMany({ where: { is_active: true }, select: { id: true } });
  await prisma.notification.createMany({
    data: users.map(u => ({ user_id: u.id, title: payload.title, body: payload.body, url: payload.url }))
  });
  return push.sendToAll(payload).catch(err => {
    console.error('[push] Failed to send push to all users:', err.message || err);
  });
}

module.exports = { notifyUser, notifyUsers, notifyAll };
