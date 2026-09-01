require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('./db');

const VALID_ROLES = ['super_admin', 'sequence_creator', 'trainer', 'kids_yoga_trainer'];

const email = process.argv[2] || 'admin@oneness.yoga';
const password = process.argv[3];
const name = process.argv[4] || 'Super Admin';
const roles = process.argv[5] ? process.argv[5].split(',').map(r => r.trim()) : ['super_admin'];

if (!password) {
  console.error('Usage: npm run seed -- <email> <password> [name] [roles-comma-separated]');
  console.error('A password must be provided explicitly - there is no default.');
  process.exit(1);
}

if (!roles.every(r => VALID_ROLES.includes(r))) {
  console.error(`Invalid role(s): ${roles.join(', ')}. Valid roles: ${VALID_ROLES.join(', ')}`);
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
    data: { name, email, password_hash: hash, roles, must_change_password: true }
  });

  console.log(`Created user: ${email} (id: ${user.id}, roles: ${roles.join(', ')})`);
  console.log('This account must change its password on first login.');
}

main()
  .catch(e => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
