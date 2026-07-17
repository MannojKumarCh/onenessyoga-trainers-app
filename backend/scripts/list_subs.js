// Script: list_subs.js
// Usage: node scripts/list_subs.js
// Prints push subscriptions in the database to help debug push notification issues.

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async function main(){
  try {
    console.log('Connecting to database...');
    await prisma.$connect();

    const subs = await prisma.pushSubscription.findMany({ orderBy: { created_at: 'desc' }, take: 100 });
    if (!subs || subs.length === 0) {
      console.log('No push subscriptions found.');
      process.exit(0);
    }

    console.log(`Found ${subs.length} subscription(s):\n`);
    subs.forEach(s => {
      console.log(`id: ${s.id}`);
      console.log(`user_id: ${s.user_id}`);
      console.log(`endpoint: ${s.endpoint}`);
      console.log(`created_at: ${s.created_at.toISOString()}`);
      let json = s.subscription_json;
      try { json = JSON.parse(s.subscription_json); } catch(e) {}
      const endpointPreview = (typeof json === 'object' && json.endpoint) ? json.endpoint : String(s.endpoint).slice(0,80);
      console.log(`endpoint (from JSON preview): ${endpointPreview}`);
      console.log(`subscription_json (truncated): ${String(s.subscription_json).slice(0,200)}\n---\n`);
    });

    await prisma.$disconnect();
  } catch (err) {
    console.error('Error listing subscriptions:', err);
    try { await prisma.$disconnect(); } catch(e){}
    process.exit(1);
  }
})();

