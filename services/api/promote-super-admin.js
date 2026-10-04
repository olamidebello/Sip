import { createDatabase } from "./db.js";
import { migrateTenancy } from "./tenancy.js";
const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
  throw new Error("Usage: MYSQL_URL=... node promote-super-admin.js existing-account@example.com");
const pool = createDatabase(process.env.MYSQL_URL);
try {
  await migrateTenancy(pool);
  const result = await pool.query("UPDATE users SET role='super_admin' WHERE email=$1",[email]);
  if (result.rowCount !== 1) throw new Error("Exactly one existing account required");
  console.log("Promoted existing account to super admin");
} finally {await pool.end();}
