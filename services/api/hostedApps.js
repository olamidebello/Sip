// Server-to-server identity provisioning. Never link an existing account by email.
import {createHash,randomUUID,randomBytes,timingSafeEqual} from 'node:crypto';
import {hashPassword} from './security.js';
import {createSipAccount} from './sipMarketplace.js';

export function hostedApp(req, config=process.env.HOSTED_APP_TOKENS_JSON){
 let apps;try{apps=JSON.parse(config||'{}');}catch{return null;}
 const id=req.headers['x-hosted-app'],header=req.headers.authorization||'';
 if(typeof header!=='string'||typeof id!=='string'||!Object.hasOwn(apps,id)||typeof apps[id]!=='string'||apps[id].length<32)return null;
 const expected=Buffer.from(apps[id]),actual=Buffer.from(header.startsWith('Bearer ')?header.slice(7):'');
 return expected.length===actual.length&&timingSafeEqual(expected,actual)?id:null;
}
export function identity(b){
 if(!b||typeof b.subject!=='string'||!/^[a-zA-Z0-9_.:@-]{1,128}$/.test(b.subject)||b.emailVerified!==true||typeof b.email!=='string'||b.email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(b.email)||typeof b.name!=='string'||!b.name.trim()||b.name.length>100||!['individual','business','court','organization'].includes(b.accountType))throw Error('Verified identity and supported account type required');
 if(b.accountType!=='individual'&&(typeof b.organizationId!=='string'||!/^[a-zA-Z0-9_.:@-]{1,128}$/.test(b.organizationId)))throw Error('Stable organization ID required');
 return {...b,email:b.email.toLowerCase().trim(),name:b.name.trim()};
}
export async function migrateHostedApps(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS hosted_app_workspaces(app_id VARCHAR(64) NOT NULL,external_id VARCHAR(140) NOT NULL,tenant_id CHAR(36) NOT NULL,account_type VARCHAR(20) NOT NULL,PRIMARY KEY(app_id,external_id),FOREIGN KEY(tenant_id) REFERENCES tenants(id)) ENGINE=InnoDB`);
 await pool.query(`CREATE TABLE IF NOT EXISTS hosted_app_users(app_id VARCHAR(64) NOT NULL,subject VARCHAR(128) NOT NULL,user_id CHAR(36) NOT NULL,external_workspace VARCHAR(140) NOT NULL,PRIMARY KEY(app_id,subject),FOREIGN KEY(user_id) REFERENCES users(id)) ENGINE=InnoDB`);
}
export async function provisionHostedIdentity(pool,app,b){
 if(!/^[a-z0-9][a-z0-9-]{0,63}$/.test(app))throw Error('Invalid application ID');
 const data=identity(b),workspace=(data.accountType==='individual'?'person:':'org:')+(data.accountType==='individual'?data.subject:data.organizationId);
 const db=await pool.connect();let locked=false;
 try{
  const key='hosted:'+createHash('sha256').update(app).digest('hex').slice(0,48);
  locked=Number((await db.query('SELECT GET_LOCK($1,10) AS acquired',[key])).rows[0]?.acquired)===1;
  if(!locked)throw Error('Provisioning busy');
  await db.query('START TRANSACTION');
  let link=(await db.query('SELECT user_id,external_workspace FROM hosted_app_users WHERE app_id=$1 AND subject=$2',[app,data.subject])).rows[0];
  if(link&&link.external_workspace!==workspace)throw Error('Workspace change requires administrator review');
  if(!link){
   if((await db.query('SELECT id FROM users WHERE email=$1',[data.email])).rows.length){const e=Error('Existing account requires verified linking');e.conflict=true;throw e;}
   let tenant=(await db.query('SELECT tenant_id,account_type FROM hosted_app_workspaces WHERE app_id=$1 AND external_id=$2',[app,workspace])).rows[0];
   if(tenant&&tenant.account_type!==data.accountType)throw Error('Account type change requires administrator review');
   const first=!tenant;
   if(!tenant){
    const tenantId=randomUUID();
    await db.query('INSERT INTO tenants(id,name,slug) VALUES($1,$2,$3)',[tenantId,data.name,'app-'+randomBytes(16).toString('hex')]);
    await db.query('INSERT INTO hosted_app_workspaces(app_id,external_id,tenant_id,account_type) VALUES($1,$2,$3,$4)',[app,workspace,tenantId,data.accountType]);
    const features={meetings:true,screen_share:true,messaging:true,billing:true,call_center:data.accountType!=='individual'};
    await db.query("INSERT INTO user_groups(id,tenant_id,name,features) VALUES($1,$2,'Standard',$3)",[randomUUID(),tenantId,JSON.stringify(features)]);
    tenant={tenant_id:tenantId};
   }
   const id=randomUUID(),{salt,hash}=await hashPassword(randomBytes(48).toString('base64url'));
   const role=first&&data.accountType!=='individual'?'admin':'user';
   await db.query("INSERT INTO users(id,tenant_id,display_name,email,password_salt,password_hash,role,status) VALUES($1,$2,$3,$4,$5,$6,$7,'active')",[id,tenant.tenant_id,data.name,data.email,salt,hash,role]);
   await db.query("INSERT INTO user_group_members(user_id,group_id) SELECT $1,id FROM user_groups WHERE tenant_id=$2 AND name='Standard'",[id,tenant.tenant_id]);
   await db.query('INSERT INTO hosted_app_users(app_id,subject,user_id,external_workspace) VALUES($1,$2,$3,$4)',[app,data.subject,id,workspace]);
   if(data.accountType!=='individual'){
    const rows=await db.query("SELECT number FROM pbx_destinations WHERE tenant_id=$1",[tenant.tenant_id]);
    const used=new Set(rows.rows.map(r=>r.number));let number=1001;while(used.has(String(number))&&number<9999)number++;
    if(used.has(String(number)))throw Error('Extension capacity exhausted');
    const destination=randomUUID();
    await db.query("INSERT INTO pbx_destinations(id,tenant_id,number,kind,name) VALUES($1,$2,$3,'extension',$4)",[destination,tenant.tenant_id,String(number),data.name]);
    await db.query('INSERT INTO pbx_extensions(destination_id,tenant_id,user_id,voicemail_enabled) VALUES($1,$2,$3,FALSE)',[destination,tenant.tenant_id,id]);
   }
   link={user_id:id};
  }
  const user=(await db.query("SELECT u.id,u.tenant_id,u.status,t.status AS tenant_status FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.id=$1",[link.user_id])).rows[0];
  if(!user||user.status!=='active'||user.tenant_status!=='active')throw Error('Account is suspended or unavailable');
  const account=await createSipAccount(db,user.id,process.env.SIP_ACCOUNT_DOMAIN||'sip.dobhrap.com');
  await db.query('COMMIT');
  return {userId:user.id,tenantId:user.tenant_id,sipStatus:account.status,pbxWorkspace:data.accountType!=='individual',portal:'https://sip.dobhrap.com/',signIn:'Use SIP password recovery to set a separate password. No automatic sign-in or paid calling entitlement was granted.'};
 }catch(e){await db.query('ROLLBACK');throw e;}
 finally{try{if(locked)await db.query('SELECT RELEASE_LOCK($1)',['hosted:'+createHash('sha256').update(app).digest('hex').slice(0,48)]);}finally{db.release();}}
}
export async function handleHostedApps({req,res,pool,send,readJson}){
 const app=hostedApp(req);if(!app)return send(res,403,{error:'Application authorization required'});
 if(req.method!=='POST')return send(res,405,{error:'POST required'});
 try{return send(res,200,await provisionHostedIdentity(pool,app,await readJson(req)));}
 catch(e){return send(res,e.conflict?409:400,{error:e.conflict?'Existing SIP account requires verified linking':'Provisioning incomplete; verify identity, workspace and server configuration'});}
}
