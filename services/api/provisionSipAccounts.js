import {createDatabase} from './db.js';
import {backfillSipAccounts,activateTenantSipAccounts} from './sipMarketplace.js';

if (!/^[0-9a-f]{64}$/i.test(process.env.SIP_CREDENTIAL_KEY||'')) {
  console.error('SIP_CREDENTIAL_KEY must already be configured; no account credentials were changed.');
  process.exit(2);
}
if (process.env.SIP_PROVISION_URL) {
  console.error('External SIP provisioner is configured; use its activation workflow.');
  process.exit(2);
}
const pool=createDatabase(process.env.MYSQL_URL);
try {
  await backfillSipAccounts(pool);
  const enabled=await pool.query(`SELECT s.tenant_id,s.domain FROM switch_tenants s
    JOIN tenants t ON t.id=s.tenant_id AND t.status='active' WHERE s.enabled=TRUE`);
  let created=0,activated=0;
  for (const tenant of enabled.rows) {
    const result=await activateTenantSipAccounts(pool,tenant.tenant_id,tenant.domain);
    if (result.pending) throw new Error('An enabled tenant could not be provisioned');
    created+=result.created;activated+=result.activated;
  }
  const invalid=await pool.query(`SELECT COUNT(*) AS total FROM sip_accounts a
    JOIN switch_tenants s ON s.tenant_id=a.tenant_id AND s.enabled=TRUE AND s.domain=a.domain
    JOIN users u ON u.id=a.user_id AND u.status='active'
    LEFT JOIN kamailio_credentials c ON c.account_id=a.id
    WHERE a.status<>'suspended' AND (a.status<>'active' OR c.account_id IS NULL)`);
  if (Number(invalid.rows[0].total)) throw new Error('Active users remain without ready SIP credentials');
  console.log(JSON.stringify({enabledTenants:enabled.rowCount,created,activated,missingCredentials:0}));
} catch (error) {
  console.error('SIP provisioning failed:',error.message);
  process.exitCode=1;
} finally {
  await pool.end();
}
