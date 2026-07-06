require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./db');

const email = process.argv[2] || 'admin@oneness.yoga';
const password = process.argv[3] || 'admin1234';
const name = process.argv[4] || 'Super Admin';

const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
if (existing) {
  console.log(`User ${email} already exists (id: ${existing.id})`);
  process.exit(0);
}

const hash = bcrypt.hashSync(password, 10);
const result = db.prepare(
  'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)'
).run(name, email, hash, 'super_admin');

console.log(`Created super_admin: ${email} (id: ${result.lastInsertRowid})`);
console.log('Password:', password);
console.log('CHANGE THIS PASSWORD after first login!');
