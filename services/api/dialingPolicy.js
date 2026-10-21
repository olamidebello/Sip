import {randomUUID} from 'node:crypto';
export const dialingDefaults=Object.freeze({prefixSeven:true,prefixTen:true,prefixOther:true,stripIdd:true,stripTrunk:true});
const fields=Object.keys(dialingDefaults),uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateDialingSettings(input){
 if(!input||Array.isArray(input)||Object.keys(input).length!==fields.length||fields.some(k=>typeof input[k]!=='boolean'))throw Error('All five dialing controls must be true or false');
 return Object.fromEntries(fields.map(k=>[k,input[k]]));
}
const decode=row=>row?{settings:validateDialingSettings(typeof row.settings==='string'?JSON.parse(row.settings):row.settings),revision:Number(row.revision)}:null;
export async function migrateDialingPolicies(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS dialing_policies (
 tenant_id CHAR(36) NOT NULL,scope_key VARCHAR(36) NOT NULL,settings JSON NOT NULL,
 revision INT UNSIGNED NOT NULL DEFAULT 1,updated_by CHAR(36) NOT NULL,
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 PRIMARY KEY(tenant_id,scope_key),FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(updated_by) REFERENCES users(id)) ENGINE=InnoDB`);
 await pool.query(`CREATE TABLE IF NOT EXISTS dialing_policy_events (
 id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,scope_key VARCHAR(36) NOT NULL,
 actor_id CHAR(36) NOT NULL,action VARCHAR(24) NOT NULL,before_settings JSON NULL,after_settings JSON NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),INDEX dialing_events_tenant(tenant_id,created_at),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(actor_id) REFERENCES users(id)) ENGINE=InnoDB`);
}
export async function readDialingPolicy(db,tenant,user){
 const rows=(await db.query('SELECT scope_key,settings,revision FROM dialing_policies WHERE tenant_id=$1 AND (scope_key=\'default\' OR scope_key=$2)',[tenant,user||'default'])).rows;
 const base=decode(rows.find(r=>r.scope_key==='default')),override=user?decode(rows.find(r=>r.scope_key===user)):null;
 return {settings:override?.settings||base?.settings||{...dialingDefaults},revision:(user?override:base)?.revision||0,inherited:!!user&&!override,tenantRevision:base?.revision||0};
}
export async function handleDialingPolicy({req,res,path,user,pool,send,readJson}){
 if(user?.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
 const root='/api/admin/dialing-policy';
 if(path===root+'/history'&&req.method==='GET')return send(res,200,{events:(await pool.query('SELECT id,scope_key,actor_id,action,before_settings,after_settings,created_at FROM dialing_policy_events WHERE tenant_id=$1 ORDER BY created_at DESC,id DESC LIMIT 50',[user.tenant_id])).rows});
 if(path===root+'/preview'&&req.method==='POST'){
  let b;try{b=await readJson(req);if(!uuid.test(b.userId||'')||!/^\+?\d{3,20}$/.test(b.number||''))throw Error('Select a user and enter a phone number');}catch(e){return send(res,400,{error:e.message});}
  const profile=(await pool.query('SELECT p.country,p.phone_e164 FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id WHERE u.id=$1 AND u.tenant_id=$2',[b.userId,user.tenant_id])).rows[0];
  if(!profile)return send(res,404,{error:'Workspace user unavailable'});
  try{const {expandLocalDestination}=await import('./localDialing.js'),policy=await readDialingPolicy(pool,user.tenant_id,b.userId);
   const number=expandLocalDestination(b.number,profile.country,profile.phone_e164,policy.settings).replace(/^\+/,'');
   return send(res,200,{number,internationalNumber:'+'+number,validE164:/^[1-9]\d{7,14}$/.test(number),country:profile.country,inherited:policy.inherited,previewOnly:true});
  }catch(e){return send(res,400,{error:e.message});}
 }
 const match=new RegExp('^'+root+'(?:/users/([a-f0-9-]{36}))?$','i').exec(path);
 if(!match||match[1]&&!uuid.test(match[1]))return send(res,404,{error:'Dialing control unavailable'});
 const target=match[1]||null,scope=target||'default';
 if(target&&!(await pool.query('SELECT id FROM users WHERE id=$1 AND tenant_id=$2',[target,user.tenant_id])).rows.length)return send(res,404,{error:'Workspace user unavailable'});
 if(req.method==='GET')return send(res,200,{...await readDialingPolicy(pool,user.tenant_id,target),defaults:dialingDefaults});
 if(req.method!=='PUT'&&!(target&&req.method==='DELETE'))return send(res,405,{error:'Use GET, PUT or user DELETE'});
 let body,settings;try{body=await readJson(req);if(!Number.isSafeInteger(body.revision)||body.revision<0)throw Error('Current policy revision required');if(req.method==='PUT')settings=validateDialingSettings(body.settings);}catch(e){return send(res,400,{error:e.message});}
 const db=await pool.connect();try{
  await db.query('START TRANSACTION');
  await db.query('SELECT id FROM tenants WHERE id=$1 FOR UPDATE',[user.tenant_id]);
  const row=(await db.query('SELECT settings,revision FROM dialing_policies WHERE tenant_id=$1 AND scope_key=$2 FOR UPDATE',[user.tenant_id,scope])).rows[0],previous=decode(row);
  if((previous?.revision||0)!==body.revision){await db.query('ROLLBACK');return send(res,409,{error:'Dialing settings changed; refresh before saving'});}
  if(req.method==='DELETE')await db.query('DELETE FROM dialing_policies WHERE tenant_id=$1 AND scope_key=$2',[user.tenant_id,scope]);
  else await db.query('INSERT INTO dialing_policies(tenant_id,scope_key,settings,updated_by) VALUES($1,$2,$3,$4) ON DUPLICATE KEY UPDATE settings=VALUES(settings),revision=revision+1,updated_by=VALUES(updated_by)',[user.tenant_id,scope,JSON.stringify(settings),user.id]);
  await db.query('INSERT INTO dialing_policy_events(id,tenant_id,scope_key,actor_id,action,before_settings,after_settings) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),user.tenant_id,scope,user.id,req.method==='DELETE'?'inherit':'save',previous?JSON.stringify(previous.settings):null,settings?JSON.stringify(settings):null]);
  await db.query('COMMIT');return send(res,200,{saved:true});
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
