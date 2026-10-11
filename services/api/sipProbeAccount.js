import {automaticSipSession,credentialKey} from './sipMarketplace.js';
export async function prepareSipProbeAccount(pool,id){
 if(!credentialKey())throw Error('SIP credential encryption is not configured in the API container');
 const users=await pool.query(`SELECT u.id,u.tenant_id FROM users u JOIN tenants t ON t.id=u.tenant_id
  LEFT JOIN sip_accounts a ON a.user_id=u.id WHERE u.status='active' AND t.status='active'
  ${id?'AND u.id=$1':''} ORDER BY CASE WHEN a.status='active' THEN 0 ELSE 1 END,u.created_at LIMIT 1`,id?[id]:[]);
 if(!users.rows[0])throw Error('No active user in an active workspace; create or activate a test user first');
 const account=await automaticSipSession(pool,users.rows[0]);
 if(account.status!=='active'){
  console.log('Provisioning mode: '+(process.env.SIP_PROVISION_MODE==='kamailio_local'?'kamailio_local':'remote'));
  const state=await pool.query(`SELECT a.status,COUNT(*) AS count FROM sip_accounts a
   JOIN users u ON u.id=a.user_id JOIN tenants t ON t.id=u.tenant_id
   WHERE u.status='active' AND t.status='active' GROUP BY a.status`);
  console.log('SIP account states: '+JSON.stringify(state.rows));
  throw Error(account.note||'SIP account activation pending');
 }
 return account;
}
