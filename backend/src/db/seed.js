require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('./db');

const email = process.argv[2] || 'admin@oneness.yoga';
const password = process.argv[3];
const name = process.argv[4] || 'Super Admin';

if (!password) {
  console.error('Usage: npm run seed -- <email> <password> [name]');
  console.error('A password must be provided explicitly - there is no default.');
  process.exit(1);
}

async function main() {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`User ${email} already exists (id: ${existing.id})`);
    return;
  }

  const hash = bcrypt.hashSync(password, 10);
  const user = await prisma.user.create({
    data: { name, email, password_hash: hash, roles: ['super_admin'] }
  });

  console.log(`Created super_admin: ${email} (id: ${user.id})`);
  console.log('CHANGE THIS PASSWORD after first login!');
}

main()
  .catch(e => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
