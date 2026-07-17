// Script: send_test_push.js
// Usage: node scripts/send_test_push.js --all
//        node scripts/send_test_push.js --user 123
// Sends a test push payload to subscriptions in the DB.

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const webpush = require('web-push');
const prisma = new PrismaClient();

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

function usage() {
  console.log('Usage: node scripts/send_test_push.js --all | --user <userId> | --endpoint <endpoint-substring>');
}

(async function main(){
  try {
    const args = process.argv.slice(2);
    if (args.length === 0) { usage(); process.exit(1); }

    await prisma.$connect();

    let subs = [];
    if (args[0] === '--all') {
      subs = await prisma.pushSubscription.findMany();
    } else if (args[0] === '--user' && args[1]) {
      const userId = Number(args[1]);
      subs = await prisma.pushSubscription.findMany({ where: { user_id: userId } });
    } else if (args[0] === '--endpoint' && args[1]) {
      subs = await prisma.pushSubscription.findMany({ where: { endpoint: { contains: args[1] } } });
    } else {
      usage(); process.exit(1);
    }

    if (!subs.length) {
      console.log('No subscriptions found for the given query.');
      process.exit(0);
    }

    console.log(`Sending test push to ${subs.length} subscription(s)`);

    const payload = {
      title: 'Test notification',
      body: 'This is a test push from backend scripts/send_test_push.js',
      url: '/',
      tag: 'test-push'
    };

    const results = await Promise.allSettled(subs.map(s => {
      const subObj = JSON.parse(s.subscription_json);
      return webpush.sendNotification(subObj, JSON.stringify(payload));
    }));

    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        console.log(`OK: subscription id=${subs[i].id} endpoint=${subs[i].endpoint.slice(0,80)}`);
      } else {
        console.error(`FAIL: subscription id=${subs[i].id} endpoint=${subs[i].endpoint.slice(0,80)} ->`, r.reason && r.reason.message ? r.reason.message : r.reason);
      }
    });

    await prisma.$disconnect();
  } catch (err) {
    console.error('Error sending test push:', err);
    try { await prisma.$disconnect(); } catch(e){}
    process.exit(1);
  }
})();

