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
import { migrateOnboarding } from './onboarding.js';
import { migrateSipMarketplace } from './sipMarketplace.js';
import { migrateSipProfiles } from './sipProfiles.js';
import { migratePayments } from './payments.js';
import { migrateCluster } from './cluster.js';
import { migrateProviderWebhooks } from './providerWebhooks.js';
import { migrateDidwwIntegration } from './didwwIntegration.js';
import { migrateCarrierProviders } from './carrierProviders.js';
import { migrateProviderCredentials } from './providerCredentials.js';
import { migrateAdapterRegistry } from './adapterRegistry.js';
import { migrateOperatorControl } from './operatorControl.js';
import { migrateSwitch } from './switch.js';
import { migrateKamailio } from './kamailio.js';
import { migrateServerFleet } from './serverFleet.js';
import { migrateOperationsPolicy } from './operationsPolicy.js';
import { migrateFleetNetwork } from './fleetNetwork.js';
import { migrateFleetFirewall } from './fleetFirewall.js';
import { migrateDashboardViews } from './dashboard.js';
import { migrateWorkspaceShortcuts } from './workspaceShortcuts.js';
import { migrateWorkPlanner } from './workPlanner.js';
import { migrateCampaigns } from './campaigns.js';
import { migratePasskeyPolicy } from './passkeyPolicy.js';
import { migrateTrunkManagement } from './trunkManagement.js';
import { migrateMessagingWebhooks } from './messagingWebhooks.js';
import { migrateFlowrouteRates } from './flowrouteRates.js';
import {migrateAiConfiguration} from './aiConfiguration.js';
import {migrateLiveCalls} from './liveCalls.js';
import {migrateSettlements} from './settlements.js';

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
      ['onboarding', () => migrateOnboarding(pool)],
      ['sip_marketplace', () => migrateSipMarketplace(pool)],
      ['sip_profiles', () => migrateSipProfiles(pool)],
      ['payments', () => migratePayments(pool)],
      ['cluster', () => migrateCluster(pool)],
      ['provider_webhooks', () => migrateProviderWebhooks(pool)],
      ['didww_integration', () => migrateDidwwIntegration(pool)],
      ['pbx', () => pool.initialize(awaitSql.pbx)],
      ['carrier_providers', () => migrateCarrierProviders(pool)],
      ['provider_api_credentials', () => migrateProviderCredentials(pool)],
      ['trunk_management', () => migrateTrunkManagement(pool)],
      ['carrier_adapter_registry', () => migrateAdapterRegistry(pool)],
      ['operator_control', () => migrateOperatorControl(pool)],
      ['freeswitch_bridge', () => migrateSwitch(pool)],
      ['kamailio_bridge', () => migrateKamailio(pool)],
      ['server_fleet', () => migrateServerFleet(pool)],
      ['fleet_network', () => migrateFleetNetwork(pool)],
      ['fleet_firewall', () => migrateFleetFirewall(pool)],
      ['operations_policy', () => migrateOperationsPolicy(pool)],
      ['messaging_webhooks', () => migrateMessagingWebhooks(pool)],
      ['flowroute_rates', () => migrateFlowrouteRates(pool)],
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
      ['dashboard_views', () => migrateDashboardViews(pool)],
      ['workspace_shortcuts', () => migrateWorkspaceShortcuts(pool)],
      ['work_planner', () => migrateWorkPlanner(pool)],
      ['campaigns', () => migrateCampaigns(pool)],
      ['passkey_policy', () => migratePasskeyPolicy(pool)],
      ['support', () => migrateSupport(pool)],
      ['ai_support_configuration', () => migrateAiConfiguration(pool)],
      ['live_call_monitor', () => migrateLiveCalls(pool)],
      ['carrier_settlements', () => migrateSettlements(pool)],
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
