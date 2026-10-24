import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {handleHostedAccounts} from './hostedAccounts.js';
const hash=v=>createHash('sha256').update(v).digest('hex');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export const bridgeScopes=['status:read','accounts:provision'];
export function bridgeKeyInput(b){
 if(!b||typeof b.label!=='string'||!b.label.trim()||b.label.length>80||!Array.isArray(b.scopes)||!b.scopes.length||b.scopes.some(s=>!bridgeScopes.includes(s))||new Set(b.scopes).size!==b.scopes.length||!Number.isInteger(b.days)||b.days<1||b.days>365||b.instance!==undefined||b.rotateFrom&&!uuid.test(b.rotateFrom))throw Error('Supply a label, allowed scopes, and expiry of 1–365 days');
 return {...b,label:b.label.trim()};
}
export async function migrateApiBridge(db){await db.query(`CREATE TABLE IF NOT EXISTS api_bridge_keys(id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,created_by CHAR(36) NOT NULL,label VARCHAR(80) NOT NULL,token_hash CHAR(64) NOT NULL UNIQUE,token_prefix VARCHAR(16) NOT NULL,instance_id CHAR(36) NOT NULL,scopes JSON NOT NULL,expires_ms BIGINT NOT NULL,revoked_ms BIGINT NULL,last_used_ms BIGINT NULL,window_id BIGINT NOT NULL DEFAULT 0,window_count INT NOT NULL DEFAULT 0,created_ms BIGINT NOT NULL,INDEX bridge_owner(tenant_id),FOREIGN KEY(tenant_id) REFERENCES tenants(id)) ENGINE=InnoDB`);}
export async function authenticateBridge(pool,req,scope,now=Date.now()){
 const token=/^Bearer (obk_[a-f0-9]{64})$/.exec(String(req.headers.authorization||''))?.[1];if(!token)return {status:401};
 const db=await pool.connect();try{
  await db.query('START TRANSACTION');
  const row=(await db.query("SELECT k.* FROM api_bridge_keys k JOIN tenants t ON t.id=k.tenant_id AND t.status='active' WHERE k.token_hash=$1 FOR UPDATE",[hash(token)])).rows[0];
  if(!row||row.revoked_ms!==null&&row.revoked_ms!==undefined||Number(row.expires_ms)<=now){await db.query('ROLLBACK');return {status:401};}
  const scopes=typeof row.scopes==='string'?JSON.parse(row.scopes):row.scopes;
  if(!Array.isArray(scopes)||!scopes.includes(scope)){await db.query('ROLLBACK');return {status:403};}
  const window=Math.floor(now/60000),count=Number(row.window_id)===window?Number(row.window_count):0;
  if(count>=60){await db.query('ROLLBACK');return {status:429};}
  await db.query('UPDATE api_bridge_keys SET last_used_ms=$1,window_id=$2,window_count=$3 WHERE id=$4',[now,window,count+1,row.id]);await db.query('COMMIT');
  return {status:200,principal:{id:row.id,tenantId:row.tenant_id,instance:row.instance_id}};
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
export async function handleApiBridge({req,res,path,pool,send,readJson,user}){
 res.setHeader?.('Cache-Control','no-store');
 if(path.startsWith('/api/admin/api-bridge/')){
  if(user?.role!=='super_admin'||user.must_change_password)return send(res,403,{error:'Super administrator required'});
  if(path==='/api/admin/api-bridge/keys'&&req.method==='GET')return send(res,200,{keys:(await pool.query('SELECT id,label,token_prefix,instance_id,scopes,expires_ms,revoked_ms,last_used_ms,created_ms FROM api_bridge_keys WHERE tenant_id=$1 ORDER BY created_ms DESC LIMIT 200',[user.tenant_id])).rows,baseUrl:'/api/bridge/v1'});
  if(path==='/api/admin/api-bridge/keys'&&req.method==='POST'){
   let b;try{b=bridgeKeyInput(await readJson(req,4096));}catch{return send(res,400,{error:'Supply a label, allowed scopes, and expiry of 1–365 days'});}
   let instance=randomUUID();
   if(b.rotateFrom){const old=(await pool.query('SELECT instance_id FROM api_bridge_keys WHERE id=$1 AND tenant_id=$2',[b.rotateFrom,user.tenant_id])).rows[0];if(!old)return send(res,404,{error:'Source key unavailable'});instance=old.instance_id;}
   const token='obk_'+randomBytes(32).toString('hex'),id=randomUUID(),now=Date.now();
   await pool.query('INSERT INTO api_bridge_keys(id,tenant_id,created_by,label,token_hash,token_prefix,instance_id,scopes,expires_ms,created_ms) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id,user.tenant_id,user.id,b.label,hash(token),token.slice(0,12),instance,JSON.stringify(b.scopes),now+b.days*86400000,now]);
   return send(res,201,{id,key:token,instance,scopes:b.scopes,expiresMs:now+b.days*86400000,note:'Copy now. Only the hash is stored. Revoke the old key after testing a replacement.'});
  }
  if(path==='/api/admin/api-bridge/revoke'&&req.method==='POST'){
   const b=await readJson(req,1024);if(!uuid.test(b.id||''))return send(res,400,{error:'Key ID required'});
   const result=await pool.query('UPDATE api_bridge_keys SET revoked_ms=COALESCE(revoked_ms,$1) WHERE id=$2 AND tenant_id=$3',[Date.now(),b.id,user.tenant_id]);
   return send(res,result.rowCount?200:404,result.rowCount?{revoked:true}:{error:'Key unavailable'});
  }
  return send(res,404,{error:'API bridge management route unavailable'});
 }
 const statusRoute=path==='/api/bridge/v1/status'&&req.method==='GET',accountRoute=path==='/api/bridge/v1/accounts'&&req.method==='POST';
 if(!statusRoute&&!accountRoute)return send(res,404,{error:'API bridge route unavailable'});
 const auth=await authenticateBridge(pool,req,statusRoute?'status:read':'accounts:provision');
 if(auth.status!==200)return send(res,auth.status,{error:auth.status===429?'API key rate limit reached':auth.status===403?'API key scope required':'Valid API key required'},auth.status===429?{'Retry-After':'60'}:{});
 if(statusRoute)return send(res,200,{status:'ready',version:1,instance:auth.principal.instance,capabilities:['status:read','accounts:provision']});
 return handleHostedAccounts({req,res,pool,send,readJson,bridgePrincipal:auth.principal});
}
