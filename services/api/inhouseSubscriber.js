// Subscriber-included numbers and on-net routing. No wallet or invoice mutation.
export function inhouseNumber(value){
 if(typeof value!=='string')return null;let n=value.replace(/^\+/,'');if(n.startsWith('0'))n='234'+n.slice(1);
 return /^23420315[0-4][0-9]{4}$/.test(n)?'+'+n:null;
}
export async function migrateInhouseSubscribers(db){await db.query(`CREATE TABLE IF NOT EXISTS inhouse_subscriber_assignments(did_id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),INDEX inhouse_subscriber_tenant(tenant_id,user_id)) ENGINE=InnoDB`);}
export async function subscriberActive(db,tenant,user){return (await db.query("SELECT 1 FROM subscriptions s JOIN plans p ON p.id=s.plan_id JOIN users u ON u.id=s.user_id JOIN tenants t ON t.id=u.tenant_id WHERE s.user_id=$1 AND u.tenant_id=$2 AND p.tenant_id=$2 AND s.status='active' AND p.active=TRUE AND u.status='active' AND t.status='active' LIMIT 1",[user,tenant])).rows.length>0;}
export async function ensureIncludedDid(pool,user){
 const db=await pool.connect();try{
 await db.query('START TRANSACTION');await db.query('SELECT id FROM users WHERE id=$1 AND tenant_id=$2 FOR UPDATE',[user.id,user.tenant_id]);
 if(!await subscriberActive(db,user.tenant_id,user.id)){await db.query('ROLLBACK');return null;}
 let numbers=(await db.query("SELECT id,number_e164 FROM inhouse_dids WHERE tenant_id=$1 AND user_id=$2 AND status='assigned' AND number_e164 REGEXP '^[+]23420315[0-4][0-9]{4}$' ORDER BY number_e164 FOR UPDATE",[user.tenant_id,user.id])).rows;
 if(!numbers.length){const did=(await db.query("SELECT id,number_e164 FROM inhouse_dids WHERE tenant_id=$1 AND user_id IS NULL AND status='available' AND number_e164 REGEXP '^[+]23420315[0-4][0-9]{4}$' ORDER BY number_e164 LIMIT 1 FOR UPDATE",[user.tenant_id])).rows[0];if(did)numbers=[did];}
 if(!numbers.length){await db.query('ROLLBACK');return null;}
 for(const did of numbers){
  const prior=(await db.query('SELECT user_id,tenant_id FROM inhouse_subscriber_assignments WHERE did_id=$1 FOR UPDATE',[did.id])).rows[0];
  if(prior&&(prior.user_id!==user.id||prior.tenant_id!==user.tenant_id))throw Error('In-house assignment ownership conflict');
  if(!prior)await db.query('INSERT INTO inhouse_subscriber_assignments(did_id,tenant_id,user_id) VALUES($1,$2,$3)',[did.id,user.tenant_id,user.id]);
  await db.query("UPDATE inhouse_dids SET user_id=$1,status='assigned',monthly_cents=0,setup_cents=0 WHERE id=$2 AND tenant_id=$3",[user.id,did.id,user.tenant_id]);
  await db.query("UPDATE smooth_did_rentals SET auto_renew=FALSE,status='included',monthly_cents=0 WHERE did_id=$1 AND tenant_id=$2 AND user_id=$3",[did.id,user.tenant_id,user.id]);
 }
 await db.query('COMMIT');return numbers[0].number_e164;
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
export async function routeIncludedDid(db,{caller,domain,destination}){
 const number=inhouseNumber(destination);if(!number)return null;
 if(!/^[a-zA-Z0-9]{2,64}$/.test(caller||'')||!/^[-a-zA-Z0-9.]{1,253}$/.test(domain||''))return [403,{error:'Authenticated subscriber required'}];
 const actor=(await db.query('SELECT tenant_id,user_id FROM olamide_sip_call_access WHERE username=$1 AND domain=$2',[caller,domain])).rows[0];
 if(!actor||!await subscriberActive(db,actor.tenant_id,actor.user_id))return [403,{error:'Active subscription required for free in-house calls'}];
 const recipient=(await db.query("SELECT d.user_id,d.tenant_id,a.username,a.domain FROM inhouse_dids d JOIN inhouse_subscriber_assignments f ON f.did_id=d.id AND f.user_id=d.user_id AND f.tenant_id=d.tenant_id JOIN sip_accounts a ON a.user_id=d.user_id AND a.tenant_id=d.tenant_id AND a.status='active' WHERE d.number_e164=$1 AND d.status='assigned' AND a.domain=$2 ORDER BY a.username LIMIT 1",[number,domain])).rows[0];
 if(!recipient||!await subscriberActive(db,recipient.tenant_id,recipient.user_id))return [404,{error:'In-house subscriber unavailable; no external fallback'}];
 const presence=(await db.query('SELECT presence FROM user_presence WHERE user_id=$1',[recipient.user_id])).rows[0];if(presence?.presence==='dnd')return [480,{error:'Subscriber is not accepting calls'}];
 return [200,{route:'extension',username:recipient.username,inhouse:true,chargeCents:0}];
}
export async function inboundIncludedDid(db,{sourceIp,destination}){
 if(sourceIp!=='196.216.253.173')return [403,{error:'ICN peer required'}];
 const number=inhouseNumber(destination);if(!number)return [404,{error:'Not an in-house DID'}];
 const rows=(await db.query("SELECT d.user_id,d.tenant_id,a.username,a.domain FROM inhouse_dids d JOIN inhouse_subscriber_assignments f ON f.did_id=d.id AND f.user_id=d.user_id AND f.tenant_id=d.tenant_id JOIN sip_accounts a ON a.user_id=d.user_id AND a.tenant_id=d.tenant_id AND a.status='active' WHERE d.number_e164=$1 AND d.status='assigned' ORDER BY a.username LIMIT 2",[number])).rows;
 if(rows.length!==1||!await subscriberActive(db,rows[0].tenant_id,rows[0].user_id))return [404,{error:'Assigned subscriber unavailable'}];
 const target=rows[0],p=(await db.query('SELECT presence FROM user_presence WHERE user_id=$1',[target.user_id])).rows[0];if(p?.presence==='dnd')return [480,{error:'Subscriber not accepting calls'}];
 return [200,{route:'inhouse-inbound',username:target.username,domain:target.domain,chargeCents:0}];
}
