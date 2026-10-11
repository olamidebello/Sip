import {createDatabase} from './db.js';

export function assessCarrierReadiness(rows, endpoint) {
  const blockers = [];
  if (!rows.length) blockers.push('No enabled tenant has an active carrier profile, gateway, trunk, current tariff rate and active SIP credential');
  if (endpoint && rows.length && !rows.some(row => row.host === endpoint))
    blockers.push('The reviewed carrier endpoint does not match an enabled tenant trunk host');
  return {ready: blockers.length === 0, eligiblePaths: rows.length, blockers};
}

export async function inspectCarrierReadiness(pool, endpoint) {
  const result = await pool.query(`SELECT DISTINCT t.tenant_id,p.provider,tr.host
    FROM switch_tenants t
    JOIN tenants n ON n.id=t.tenant_id AND n.status='active'
    JOIN operator_tariffs tariff ON tariff.id=t.tariff_id AND tariff.tenant_id=t.tenant_id AND tariff.enabled=TRUE
    JOIN carrier_provider_profiles p ON p.tenant_id=t.tenant_id AND p.status='active' AND p.routing_mode<>'disabled'
    JOIN switch_gateways g ON g.tenant_id=p.tenant_id AND g.provider=p.provider AND g.enabled=TRUE
    JOIN pbx_trunks tr ON tr.id=p.trunk_id AND tr.tenant_id=p.tenant_id AND tr.enabled=TRUE
      AND tr.host<>'' AND tr.port BETWEEN 1 AND 65535 AND tr.transport IN ('udp','tcp','tls')
    JOIN operator_tariff_rates rate ON rate.tenant_id=t.tenant_id AND rate.tariff_id=tariff.id
      AND rate.provider=p.provider AND rate.enabled=TRUE AND rate.effective_at<=UTC_TIMESTAMP(3)
      AND (rate.expires_at IS NULL OR rate.expires_at>UTC_TIMESTAMP(3))
      AND rate.price_cents>=rate.cost_cents
    JOIN sip_accounts a ON a.tenant_id=t.tenant_id AND a.domain=t.domain AND a.status='active'
    JOIN users u ON u.id=a.user_id AND u.status='active'
    JOIN kamailio_credentials c ON c.account_id=a.id AND c.username=a.username AND c.domain=a.domain
    WHERE t.enabled=TRUE AND t.domain<>'' AND g.gateway_name<>''`);
  return assessCarrierReadiness(result.rows, endpoint);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const pool = createDatabase(process.env.MYSQL_URL);
  try {
    const result = await inspectCarrierReadiness(pool, process.env.CARRIER_ENDPOINT || '');
    console.log(JSON.stringify(result));
    if (!result.ready) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ready:false,blockers:['Carrier database preflight failed'],errorCode:error.code || 'UNKNOWN'}));
    process.exitCode = 1;
  } finally { await pool.end(); }
}
