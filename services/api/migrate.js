import fs from 'node:fs/promises';
import { createDatabase } from './db.js';
import { migrateTenancy } from './tenancy.js';
import { migrateAccess } from './access.js';
import { migratePricing } from './pricing.js';
import { migrateBackground } from './background.js';
import { migrateLdap } from './ldap.js';
import { migrateAuthProviders } from './authProviders.js';
import { migrateCatalogControl } from './catalogControl.js';
import { migrateSoftphoneState } from './softphoneState.js';
import { migrateGeofencePolicy } from './geofencePolicy.js';
import { migrateWallet } from './wallet.js';
import { migrateDashboard } from './dashboard.js';
import { migrateSupport } from './support.js';
import { migrateLocales } from './locales.js';

const sql = filename => fs.readFile(new URL(filename, import.meta.url), 'utf8');

// Every step is safe to rerun. A MySQL advisory lock prevents two replicas from
// altering the same tables at the same time during startup or rolling updates.
export async function migrate(pool) {
  const connection = await pool.connect();
  let locked = false;
  try {
    const result = await connection.query("SELECT GET_LOCK('olamide_schema_migration', 60) AS acquired");
    if (Number(result.rows[0]?.acquired) !== 1) throw new Error('Could not acquire database migration lock');
    locked = true;
    await pool.query(`CREATE TABLE IF NOT EXISTS schema_components (
      component VARCHAR(80) PRIMARY KEY,
      applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB`);
    const steps = [
      ['core', () => pool.initialize(awaitSql.core)],
      ['tenancy', () => migrateTenancy(pool)],
      ['access', () => migrateAccess(pool)],
      ['pbx', () => pool.initialize(awaitSql.pbx)],
      ['cdr', () => pool.initialize(awaitSql.cdr)],
      ['dids', () => pool.initialize(awaitSql.dids)],
      ['nigeria', () => pool.initialize(awaitSql.nigeria)],
      ['pricing', () => migratePricing(pool)],
      ['background', () => migrateBackground(pool)],
      ['ldap', () => migrateLdap(pool)],
      ['auth_providers', () => migrateAuthProviders(pool)],
      ['catalog', () => migrateCatalogControl(pool)],
      ['softphone', () => migrateSoftphoneState(pool)],
      ['geofence', () => migrateGeofencePolicy(pool)],
      ['wallet', () => migrateWallet(pool)],
      ['dashboard', () => migrateDashboard(pool)],
      ['support', () => migrateSupport(pool)],
      ['locales', () => migrateLocales(pool)]
    ];
    for (const [name, action] of steps) {
      await action();
      await pool.query('INSERT INTO schema_components(component) VALUES($1) ON DUPLICATE KEY UPDATE applied_at=CURRENT_TIMESTAMP(3)', [name]);
    }
  } finally {
    if (locked) await connection.query("SELECT RELEASE_LOCK('olamide_schema_migration')").finally(() => connection.release());
    else connection.release();
  }
}

const awaitSql = {
  core: await sql('./schema.sql'),
  pbx: await sql('./pbx-schema.sql'),
  cdr: await sql('./cdr-schema.sql'),
  dids: await sql('./dids-schema.sql'),
  nigeria: await sql('./nigeria-schema.sql')
};

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const pool = createDatabase(process.env.MYSQL_URL);
  try { await migrate(pool); console.log('MySQL schema is ready'); }
  finally { await pool.end(); }
}
