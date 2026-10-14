import {randomUUID,createDecipheriv} from 'node:crypto';
import {masterKey,seal} from './providerCredentials.js';
const pattern=/^[a-z][a-z0-9-]{1,39}$/;
export async function migrateAdapterTargets(pool){await pool.query(`CREATE TABLE IF NOT EXISTS carrier_adapter_targets(tenant_id CHAR(36) NOT NULL,target_key VARCHAR(40) NOT NULL,ciphertext BLOB NOT NULL,revision INT UNSIGNED NOT NULL,updated_by CHAR(36) NOT NULL,PRIMARY KEY(tenant_id,target_key),FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(updated_by) REFERENCES users(id)) ENGINE=InnoDB`);}
function decode(cipher,tenant,key){const raw=masterKey();if(!raw)throw Error('Provider encryption key unavailable');const b=Buffer.from(cipher),d=createDecipheriv('aes-256-gcm',raw,b.subarray(0,12));d.setAAD(Buffer.from(tenant+':adapter:'+key));d.setAuthTag(b.subarray(-16));return JSON.parse(Buffer.concat([d.update(b.subarray(12,-16)),d.final()]).toString());}
export async function savedTargets(pool,tenant){if(!pool||!tenant)return {};const rows=await pool.query('SELECT target_key,ciphertext,revision FROM carrier_adapter_targets WHERE tenant_id=$1',[tenant]);return Object.fromEntries(rows.rows.map(r=>[r.target_key,{...decode(r.ciphertext,tenant,r.target_key),revision:Number(r.revision)}]));}
export async function handleAdapterTargets({req,res,path,user,pool,send,readJson,environmentTargets}){
 if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
 if(path==='/api/admin/carrier-adapters/targets'&&req.method==='GET'){
  const targets=await savedTargets(pool,user.tenant_id);return send(res,200,{keyReady:!!masterKey(),targets:Object.entries({...environmentTargets,...targets}).map(([key,t])=>({key,url:t.url,revision:t.revision||0,source:Object.hasOwn(targets,key)?'gui':'server'}))});
 }
 const m=/^\/api\/admin\/carrier-adapters\/targets\/([a-z][a-z0-9-]{1,39})$/.exec(path);if(!m||!pattern.test(m[1]))return send(res,404,{error:'Target unavailable'});
 if(!['PUT','DELETE'].includes(req.method))return send(res,405,{error:'PUT or DELETE required'});
 const b=await readJson(req),key=m[1],tenant=user.tenant_id;const encryption=masterKey();if(!encryption)return send(res,409,{error:'Deploy the provider encryption key before saving targets'});
 if(!Number.isSafeInteger(b.expectedRevision)||b.expectedRevision<0)return send(res,400,{error:'Current target revision required'});
 let url;if(req.method==='PUT'){if(typeof b.url!=='string'||b.url.length>1024)return send(res,400,{error:'Valid HTTPS adapter URL required'});try{url=new URL(b.url);}catch{return send(res,400,{error:'Valid HTTPS adapter URL required'});}if(url.protocol!=='https:'||url.username||url.password||url.hash||typeof b.token!=='string'||b.token&&(!/^[\x21-\x7e]{32,4096}$/.test(b.token)))return send(res,400,{error:'HTTPS URL and a token of at least 32 characters required'});}
 const db=await pool.connect();try{
  await db.query('START TRANSACTION');const old=(await db.query('SELECT ciphertext,revision FROM carrier_adapter_targets WHERE tenant_id=$1 AND target_key=$2 FOR UPDATE',[tenant,key])).rows[0];
  if(Number(old?.revision||0)!==b.expectedRevision){await db.query('ROLLBACK');return send(res,409,{error:'Target changed; refresh before saving'});}
  const busy=await db.query('SELECT n.id FROM carrier_adapter_nodes n LEFT JOIN carrier_adapter_assignments a ON a.adapter_id=n.id WHERE n.tenant_id=$1 AND n.target_key=$2 AND (n.enabled=TRUE OR a.adapter_id IS NOT NULL) FOR UPDATE',[tenant,key]);
  if(busy.rowCount){await db.query('ROLLBACK');return send(res,409,{error:'Deactivate assigned gateways and disable their adapter nodes before changing this target'});}
  if(req.method==='DELETE'){
   if(!old){await db.query('ROLLBACK');return send(res,409,{error:'Server environment targets must be removed from the server configuration'});}
   const nodes=await db.query('SELECT id FROM carrier_adapter_nodes WHERE tenant_id=$1 AND target_key=$2',[tenant,key]);if(nodes.rowCount){await db.query('ROLLBACK');return send(res,409,{error:'Delete adapter nodes using this target first'});}
   await db.query('DELETE FROM carrier_adapter_targets WHERE tenant_id=$1 AND target_key=$2',[tenant,key]);
  }else{
   const token=b.token||(old?decode(old.ciphertext,tenant,key).token:environmentTargets[key]?.token);if(!token){await db.query('ROLLBACK');return send(res,400,{error:'A token is required for a new target'});}
   await db.query('INSERT INTO carrier_adapter_targets(tenant_id,target_key,ciphertext,revision,updated_by) VALUES($1,$2,$3,$4,$5) ON DUPLICATE KEY UPDATE ciphertext=VALUES(ciphertext),revision=VALUES(revision),updated_by=VALUES(updated_by)',[tenant,key,seal({url:url.href,token},encryption,tenant,'adapter:'+key),b.expectedRevision+1,user.id]);
   await db.query("UPDATE carrier_adapter_nodes SET health='unknown',last_check_at=NULL,last_error=NULL WHERE tenant_id=$1 AND target_key=$2",[tenant,key]);
  }
  await db.query('INSERT INTO security_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,$4)',[randomUUID(),tenant,user.id,req.method==='DELETE'?'adapter_target_removed':'adapter_target_updated']);await db.query('COMMIT');return send(res,200,{saved:req.method==='PUT',removed:req.method==='DELETE'});
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
