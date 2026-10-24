// Narrow service bridge: deterministic external identities, never email-based account takeover.
import {randomUUID,randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {hashPassword} from './security.js';
import {createSipAccount,provisionSipAccount} from './sipMarketplace.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function bridgeAuthorized(req){const expected=process.env.DOBHRAP_BRIDGE_TOKEN||'',given=String(req.headers.authorization||'').replace(/^Bearer /,'');return expected.length>=48&&given.length<=256&&timingSafeEqual(createHash('sha256').update(expected).digest(),createHash('sha256').update(given).digest());}
export async function migrateHostedAccounts(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS hosted_account_tenants(instance_id CHAR(36) NOT NULL,external_tenant VARCHAR(32) NOT NULL,tenant_id CHAR(36) NOT NULL UNIQUE,kind VARCHAR(16) NOT NULL,PRIMARY KEY(instance_id,external_tenant),FOREIGN KEY(tenant_id) REFERENCES tenants(id)) ENGINE=InnoDB`);
 await pool.query(`CREATE TABLE IF NOT EXISTS hosted_accounts(instance_id CHAR(36) NOT NULL,external_owner VARCHAR(32) NOT NULL,user_id CHAR(36) NOT NULL UNIQUE,tenant_id CHAR(36) NOT NULL,PRIMARY KEY(instance_id,external_owner),FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(tenant_id) REFERENCES tenants(id)) ENGINE=InnoDB`);
}
export function validateHostedAccount(b){
 if(!uuid.test(b.instance)||!/^\d{1,18}$/.test(String(b.owner))||!/^\d{1,18}$/.test(String(b.tenant))||!['personal','organization'].includes(b.kind)||!['user','admin'].includes(b.role))throw Error('Invalid external identity');
 if(typeof b.email!=='string'||b.email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)||typeof b.password!=='string'||b.password.length<32||b.password.length>128||!b.password.match(/^[A-Za-z0-9_-]+$/))throw Error('Invalid managed account credentials');
 if(b.kind==='personal'&&b.role!=='user')throw Error('Personal accounts cannot administer a PBX');
 return {...b,owner:String(b.owner),tenant:String(b.tenant),email:b.email.toLowerCase()};
}
export async function handleHostedAccounts({req,res,pool,send,readJson}){
 if(!bridgeAuthorized(req))return send(res,401,{error:'Service bridge authorization required'});
 if(req.method!=='POST')return send(res,405,{error:'POST required'});
 let b;try{b=validateHostedAccount(await readJson(req,8192));}catch{return send(res,400,{error:'Invalid hosted account request'});}
 const db=await pool.connect();let lock=false,userId,tenantId;
 const lockName='ha:'+createHash('sha256').update(b.instance).digest('hex').slice(0,40);
 try{
  lock=Number((await db.query('SELECT GET_LOCK($1,10) AS acquired',[lockName])).rows[0]?.acquired)===1;
  if(!lock)return send(res,409,{error:'Provisioning is busy; retry the same identity'});
  await db.query('BEGIN');
  let tenant=(await db.query('SELECT tenant_id,kind FROM hosted_account_tenants WHERE instance_id=$1 AND external_tenant=$2',[b.instance,b.tenant])).rows[0];
  if(tenant&&tenant.kind!==b.kind){await db.query('ROLLBACK');return send(res,409,{error:'Account type changed; operator review required'});}
  if(!tenant){
   tenantId=randomUUID();const slug='hosted-'+tenantId;
   await db.query('INSERT INTO tenants(id,name,slug) VALUES($1,$2,$3)',[tenantId,String(b.company||'Hosted account').slice(0,100),slug]);
   await db.query('INSERT INTO hosted_account_tenants(instance_id,external_tenant,tenant_id,kind) VALUES($1,$2,$3,$4)',[b.instance,b.tenant,tenantId,b.kind]);
   const group=randomUUID();await db.query("INSERT INTO user_groups(id,tenant_id,name,features) VALUES($1,$2,'Hosted account',$3)",[group,tenantId,JSON.stringify({meetings:true,screen_share:true,remote_assist:false,messaging:true,billing:true,call_center:false})]);
   tenant={tenant_id:tenantId,kind:b.kind};
  }
  tenantId=tenant.tenant_id;
  const active=(await db.query("SELECT id FROM tenants WHERE id=$1 AND status='active'",[tenantId])).rows[0];if(!active){await db.query('ROLLBACK');return send(res,409,{error:'Remote workspace suspended; operator review required'});}
  const old=(await db.query('SELECT user_id,tenant_id FROM hosted_accounts WHERE instance_id=$1 AND external_owner=$2',[b.instance,b.owner])).rows[0];
  if(old){if(old.tenant_id!==tenantId){await db.query('ROLLBACK');return send(res,409,{error:'Remote identity belongs to another workspace'});}userId=old.user_id;}
  else{
   if((await db.query('SELECT id FROM users WHERE email=$1',[b.email])).rows.length){await db.query('ROLLBACK');return send(res,409,{error:'Email already has a SIP account; manual account linking required'});}
   userId=randomUUID();const {salt,hash}=await hashPassword(b.password);
   await db.query("INSERT INTO users(id,tenant_id,display_name,email,password_salt,password_hash,role,status) VALUES($1,$2,$3,$4,$5,$6,$7,'active')",[userId,tenantId,String(b.name||b.email).slice(0,100),b.email,salt,hash,b.role]);
   const group=(await db.query("SELECT id FROM user_groups WHERE tenant_id=$1 AND name='Hosted account'",[tenantId])).rows[0];
   await db.query('INSERT INTO user_group_members(user_id,group_id) VALUES($1,$2)',[userId,group.id]);
   await db.query('INSERT INTO hosted_accounts(instance_id,external_owner,user_id,tenant_id) VALUES($1,$2,$3,$4)',[b.instance,b.owner,userId,tenantId]);
   await createSipAccount(db,userId,process.env.SIP_ACCOUNT_DOMAIN||'sip.dobhrap.com');
   if(b.kind==='organization'){
    // Serialized per source instance. Allocate a fresh extension, never replace an existing PBX entry.
    const row=(await db.query("SELECT MAX(CAST(number AS UNSIGNED)) AS n FROM pbx_destinations WHERE tenant_id=$1 AND kind='extension'",[tenantId])).rows[0];const number=String(Math.max(100,Number(row?.n||99)+1));
    if(number.length>10)throw Error('PBX extension range exhausted');
    const id=randomUUID();await db.query("INSERT INTO pbx_destinations(id,tenant_id,number,kind,name) VALUES($1,$2,$3,'extension',$4)",[id,tenantId,number,String(b.name||b.email).slice(0,100)]);
    await db.query('INSERT INTO pbx_extensions(destination_id,tenant_id,user_id,voicemail_enabled) VALUES($1,$2,$3,FALSE)',[id,tenantId,userId]);
   }
  }
  await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK');if(error.code==='ER_DUP_ENTRY')return send(res,409,{error:'Identity conflict; operator review required'});throw error;}
 finally{try{if(lock)await db.query('SELECT RELEASE_LOCK($1)',[lockName]);}finally{db.release();}}
 await provisionSipAccount(pool,userId);
 const account=(await pool.query("SELECT u.status AS user_status,a.username,a.domain,a.status,d.number AS extension FROM users u JOIN sip_accounts a ON a.user_id=u.id LEFT JOIN pbx_extensions e ON e.user_id=u.id AND e.tenant_id=u.tenant_id LEFT JOIN pbx_destinations d ON d.id=e.destination_id WHERE u.id=$1 AND u.tenant_id=$2",[userId,tenantId])).rows[0];
 return send(res,200,{accountId:userId,tenantId,kind:b.kind,login:b.email,portal:'https://sip.dobhrap.com/',state:account?.user_status==='active'?account.status:'suspended',sipUri:account?'sip:'+account.username+'@'+account.domain:null,extension:account?.extension||null,externalCallsEnabled:false,note:'Internal SIP account; PSTN, DIDs, paid plans and PBX routing require separate activation.'});
}
