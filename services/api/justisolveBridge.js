import {turnIceServer} from './turn.js';
import {callAccess} from './callAccess.js';
import {createLimitedSession} from './sessionPolicy.js';
import {createHash,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {hashPassword,createSessionToken,tokenHash} from './security.js';
import {createSipAccount,automaticSipSession} from './sipMarketplace.js';
import {ensureDefaultPresence} from './defaultPresence.js';
import {handlePbx} from './pbx.js';
const digest=v=>createHash('sha256').update(v).digest();
export function bridgeAuthorized(req){const key=process.env.JUSTISOLVE_BRIDGE_TOKEN||'',given=String(req.headers.authorization||'').replace(/^Bearer /,'');return /^[a-f0-9]{64}$/.test(key)&&given.length<=100&&timingSafeEqual(digest(key),digest(given));}
export function validateBridgeInput(b){if(!b||!['personal','organization'].includes(b.context)||!/^\d{1,18}$/.test(String(b.contextId))||!/^\d{1,18}$/.test(String(b.accountId)))throw Error('Invalid source identity');if(b.context==='personal'&&String(b.contextId)!==String(b.accountId))throw Error('Personal context must belong to its account');return {context:b.context,contextId:String(b.contextId),accountId:String(b.accountId)};}
export async function migrateJustisolveBridge(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS justisolve_tickets (token_hash CHAR(64) PRIMARY KEY,user_id CHAR(36) NOT NULL,expires_at DATETIME(3) NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB`);
 await pool.query(`CREATE TABLE IF NOT EXISTS justisolve_contexts (context_key VARCHAR(80) PRIMARY KEY,tenant_id CHAR(36) NOT NULL UNIQUE,FOREIGN KEY(tenant_id) REFERENCES tenants(id)) ENGINE=InnoDB`);
 await pool.query(`CREATE TABLE IF NOT EXISTS justisolve_identities (context_key VARCHAR(80) NOT NULL,external_account VARCHAR(24) NOT NULL,user_id CHAR(36) NOT NULL UNIQUE,enabled BOOLEAN NOT NULL DEFAULT FALSE,lease_expires DATETIME(3) NULL,PRIMARY KEY(context_key,external_account),FOREIGN KEY(context_key) REFERENCES justisolve_contexts(context_key),FOREIGN KEY(user_id) REFERENCES users(id)) ENGINE=InnoDB`);
}
export async function provisionJustisolve(pool,b){
 const input=validateBridgeInput(b),contextKey=input.context+':'+input.contextId;
 if(typeof b.name!=='string'||!b.name.trim()||b.name.length>200||typeof b.workspaceName!=='string'||b.workspaceName.length>200||typeof b.userActive!=='boolean'||typeof b.tenantActive!=='boolean')throw Error('Invalid provisioning profile');
 const db=await pool.connect();let locked=false;
 try{locked=Number((await db.query('SELECT GET_LOCK($1,10) AS acquired',['justisolve-'+createHash('sha256').update(contextKey).digest('hex').slice(0,40)])).rows[0]?.acquired)===1;if(!locked)throw Error('Provisioning busy');await db.query('BEGIN');
  let context=(await db.query('SELECT tenant_id FROM justisolve_contexts WHERE context_key=$1',[contextKey])).rows[0];
  if(!context){const tenant=randomUUID(),slug='js-'+createHash('sha256').update(contextKey).digest('hex').slice(0,24);await db.query('INSERT INTO tenants(id,name,slug,status) VALUES($1,$2,$3,$4)',[tenant,(b.workspaceName||b.name).slice(0,100),slug,b.tenantActive?'active':'suspended']);await db.query('INSERT INTO justisolve_contexts(context_key,tenant_id) VALUES($1,$2)',[contextKey,tenant]);await db.query("INSERT INTO user_groups(id,tenant_id,name,features) VALUES($1,$2,'Standard',$3)",[randomUUID(),tenant,JSON.stringify({meetings:true,screen_share:true,messaging:true,billing:true,call_center:input.context==='organization',remote_assist:false})]);await db.query("INSERT INTO tenant_settings(tenant_id,setting_key,value) SELECT $1,setting_key,value FROM tenant_settings WHERE tenant_id='00000000-0000-4000-8000-000000000000' AND setting_key='sip_wss_url'",[tenant]);context={tenant_id:tenant};}
  // Only contexts owned by this integration can be modified; existing email accounts are never adopted.
  await db.query('UPDATE tenants SET name=$2,status=$3 WHERE id=$1',[context.tenant_id,(b.workspaceName||b.name).slice(0,100),b.tenantActive?'active':'suspended']);
  let identity=(await db.query('SELECT user_id FROM justisolve_identities WHERE context_key=$1 AND external_account=$2',[contextKey,input.accountId])).rows[0];
  const role=input.context==='organization'&&b.pbxAdmin===true?'admin':'user';
  if(!identity){const uid=randomUUID(),password=await hashPassword(randomBytes(48).toString('base64url')),alias='js-'+createHash('sha256').update(contextKey+':'+input.accountId).digest('hex').slice(0,40)+'@identity.justisolve.invalid';await db.query('INSERT INTO users(id,tenant_id,display_name,email,password_salt,password_hash,role,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[uid,context.tenant_id,b.name.slice(0,100),alias,password.salt,password.hash,role,b.userActive?'active':'pending_email']);await db.query('INSERT INTO justisolve_identities(context_key,external_account,user_id,enabled) VALUES($1,$2,$3,$4)',[contextKey,input.accountId,uid,b.userActive]);const group=(await db.query("SELECT id FROM user_groups WHERE tenant_id=$1 AND name='Standard'",[context.tenant_id])).rows[0];if(group)await db.query('INSERT INTO user_group_members(user_id,group_id) VALUES($1,$2)',[uid,group.id]);await ensureDefaultPresence(db,uid);identity={user_id:uid};}
  await db.query('UPDATE users SET display_name=$2,role=$3,status=$4 WHERE id=$1 AND tenant_id=$5',[identity.user_id,b.name.slice(0,100),role,b.userActive?'active':'pending_email',context.tenant_id]);await db.query('UPDATE justisolve_identities SET enabled=$3,lease_expires=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 10 MINUTE) WHERE context_key=$1 AND external_account=$2',[contextKey,input.accountId,b.userActive]);if(!b.userActive||!b.tenantActive)await db.query('DELETE FROM sessions WHERE user_id=$1',[identity.user_id]);
  const sip=await createSipAccount(db,identity.user_id,process.env.SIP_ACCOUNT_DOMAIN||'sip.dobhrap.com');
  let extension=null;
  if(input.context==='organization'){
   extension=(await db.query('SELECT d.number FROM pbx_destinations d JOIN pbx_extensions e ON e.destination_id=d.id WHERE e.tenant_id=$1 AND e.user_id=$2',[context.tenant_id,identity.user_id])).rows[0]?.number||null;
   if(!extension){const used=new Set((await db.query('SELECT number FROM pbx_destinations WHERE tenant_id=$1 FOR UPDATE',[context.tenant_id])).rows.map(r=>r.number));let n=1000;while(used.has(String(n))&&n<9999)n++;if(used.has(String(n)))throw Error('Extension capacity reached');extension=String(n);const dest=randomUUID();await db.query("INSERT INTO pbx_destinations(id,tenant_id,number,kind,name) VALUES($1,$2,$3,'extension',$4)",[dest,context.tenant_id,extension,b.name.slice(0,100)]);await db.query('INSERT INTO pbx_extensions(destination_id,tenant_id,user_id,voicemail_enabled) VALUES($1,$2,$3,false)',[dest,context.tenant_id,identity.user_id]);}
  }
  await db.query('COMMIT');return {status:b.userActive&&b.tenantActive?sip.status:'pending_source_approval',tenantId:context.tenant_id,userId:identity.user_id,username:sip.username,domain:process.env.SIP_ACCOUNT_DOMAIN||'sip.dobhrap.com',pbx:input.context==='organization',extension};
 }catch(e){await db.query('ROLLBACK');throw e;}finally{try{if(locked)await db.query('SELECT RELEASE_LOCK($1)',['justisolve-'+createHash('sha256').update(contextKey).digest('hex').slice(0,40)]);}finally{db.release();}}
}
export async function handleJustisolveBridge({req,res,path,pool,send,readJson}){
 if(!bridgeAuthorized(req))return send(res,401,{error:'Integration authorization required'});
 if(req.method!=='POST')return send(res,405,{error:'POST required'});
 if(path==='/api/integrations/justisolve/health')return send(res,200,{status:'ready',version:1,scope:'justisolve_owned_contexts'});
 let b,input;try{b=await readJson(req);input=validateBridgeInput(b);}catch{return send(res,400,{error:'Invalid source identity'});}
 if(path==='/api/integrations/justisolve/provision'){try{return send(res,200,await provisionJustisolve(pool,b));}catch{return send(res,503,{error:'Provisioning incomplete; safe to retry with the same source identity'});}}
 const contextKey=input.context+':'+input.contextId;
 const user=(await pool.query("SELECT u.id,u.tenant_id,u.role FROM justisolve_identities j JOIN users u ON u.id=j.user_id JOIN tenants t ON t.id=u.tenant_id WHERE j.context_key=$1 AND j.external_account=$2 AND j.enabled=true AND j.lease_expires>now() AND u.status='active' AND t.status='active'",[contextKey,input.accountId])).rows[0];if(!user)return send(res,403,{error:'Active provisioned identity required'});
 user.features={call_center:input.context==='organization'};
 if(path==='/api/integrations/justisolve/session'){
  const session=await automaticSipSession(pool,user);let iceServers=[];
  try{iceServers=JSON.parse(process.env.MEETING_ICE_SERVERS_JSON||'[]');if(!Array.isArray(iceServers))throw Error();if(process.env.TURN_SECRET&&process.env.TURN_PUBLIC_HOST)iceServers.push(turnIceServer({secret:process.env.TURN_SECRET,host:process.env.TURN_PUBLIC_HOST,userId:user.id}));}catch{return send(res,503,{error:'Calling media configuration unavailable'});}
  return send(res,200,{...session,iceServers});
 }
 if(path==='/api/integrations/justisolve/authorize'){const result=await callAccess(pool,user,b.target);return send(res,result.allowed?200:403,result);}
 if(path==='/api/integrations/justisolve/portal'){
  const ticket=randomBytes(32).toString('hex');await pool.query('DELETE FROM justisolve_tickets WHERE expires_at<=now() OR user_id=$1',[user.id]);await pool.query("INSERT INTO justisolve_tickets(token_hash,user_id,expires_at) VALUES($1,$2,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 60 SECOND))",[tokenHash(ticket),user.id]);return send(res,200,{url:'https://sip.dobhrap.com/justisolve-connect.html#ticket='+ticket});
 }
 if(path==='/api/integrations/justisolve/pbx'){
  if(input.context!=='organization')return send(res,403,{error:'Organizational PBX required'});
  const routes={overview:['GET','/api/pbx/overview'],extensions:['GET','/api/pbx/extensions'],queues:['GET','/api/pbx/queues'],create_extension:['POST','/api/pbx/extensions'],create_queue:['POST','/api/pbx/queues']};
  const route=routes[b.action];if(!route)return send(res,400,{error:'Unsupported PBX action'});
  return handlePbx({req:{method:route[0]},res,path:route[1],user,pool,send,readJson:async()=>b.payload||{}});
 }
 return send(res,404,{error:'Integration route unavailable'});
}

export async function redeemJustisolveTicket({req,res,pool,readJson,send,origin,sessionCookie}){
 if(req.method!=='POST'||req.headers.origin!==origin)return send(res,403,{error:'Same-origin POST required'});
 const b=await readJson(req);if(typeof b.ticket!=='string'||!/^[a-f0-9]{64}$/.test(b.ticket))return send(res,400,{error:'Invalid or expired connection link'});
 const db=await pool.connect();let userId;
 try{await db.query('BEGIN');const row=(await db.query("SELECT t.user_id FROM justisolve_tickets t JOIN users u ON u.id=t.user_id JOIN tenants o ON o.id=u.tenant_id JOIN justisolve_identities j ON j.user_id=u.id WHERE t.token_hash=$1 AND t.expires_at>now() AND u.status='active' AND o.status='active' AND j.enabled=true AND j.lease_expires>now() FOR UPDATE",[tokenHash(b.ticket)])).rows[0];if(!row){await db.query('ROLLBACK');return send(res,400,{error:'Invalid or expired connection link'});}userId=row.user_id;await db.query('DELETE FROM justisolve_tickets WHERE token_hash=$1',[tokenHash(b.ticket)]);await db.query('COMMIT');}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 const token=createSessionToken();await createLimitedSession(pool,{userId,token,seconds:3600,authMethod:'justisolve'});return send(res,200,{connected:true},{'Set-Cookie':sessionCookie(token,3600),'Cache-Control':'no-store'});
}

export async function expireJustisolveLeases(pool){
 await pool.query("UPDATE users u JOIN justisolve_identities j ON j.user_id=u.id SET u.status='pending_email' WHERE j.enabled=false OR j.lease_expires IS NULL OR j.lease_expires<=UTC_TIMESTAMP(3)");
 await pool.query("DELETE s FROM sessions s JOIN justisolve_identities j ON j.user_id=s.user_id WHERE j.lease_expires<=UTC_TIMESTAMP(3)");
 await pool.query("UPDATE justisolve_identities SET enabled=false WHERE enabled=true AND lease_expires<=UTC_TIMESTAMP(3)");
}
export function startJustisolveLeaseSweep(pool){let running=false;const tick=async()=>{if(running)return;running=true;try{await expireJustisolveLeases(pool);}catch{console.error('JustiSolve lease refresh unavailable');}finally{running=false;}};void tick();const timer=setInterval(tick,30000);timer.unref?.();return ()=>clearInterval(timer);}
