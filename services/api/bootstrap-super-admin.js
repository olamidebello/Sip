import { randomUUID } from 'node:crypto';
import { createDatabase } from './db.js';
import { hashPassword } from './security.js';
import { defaultTenantId } from './tenancy.js';

// Supply the temporary password on stdin; never as a shell argument or environment variable.
const username=process.argv[2] || 'olamidebello';
if(!/^[a-z][a-z0-9_]{2,63}$/.test(username)) throw new Error('Invalid username');
if(process.stdin.isTTY) throw new Error('Pipe a temporary password on stdin from a hidden prompt');
let password='';
for await(const chunk of process.stdin){password+=chunk;if(password.length>1025)throw new Error('Password too long');}
password=password.replace(/\r?\n$/,'');
if(password.length<10 || password.length>1024)throw new Error('Temporary password must have 10–1024 characters');
const pool=createDatabase(process.env.MYSQL_URL);
try {
  const existing=await pool.query('SELECT id FROM users WHERE username=$1 OR email=$2',[username,`${username}@local.invalid`]);
  if(existing.rowCount)throw new Error('Account already exists; use the password reset process instead');
  const {salt,hash}=await hashPassword(password);
  await pool.query(`INSERT INTO users(id,tenant_id,username,display_name,email,password_salt,password_hash,role,status,auth_source,must_change_password)
    VALUES($1,$2,$3,$4,$5,$6,$7,'super_admin','active','local',TRUE)`,
    [randomUUID(),defaultTenantId,username,username,`${username}@local.invalid`,salt,hash]);
  console.log(`Created ${username} as super admin. Password change is required at first login.`);
} finally {await pool.end();}
