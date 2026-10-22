import {randomUUID} from 'node:crypto';
const number=v=>typeof v==='string'&&/^\+[1-9]\d{7,14}$/.test(v),uuid=v=>typeof v==='string'&&/^[a-f0-9-]{36}$/i.test(v);
export async function migrateInboundRouting(db){
 await db.query(`CREATE TABLE IF NOT EXISTS inbound_routing_rules(tenant_id CHAR(36) NOT NULL,number_e164 VARCHAR(16) NOT NULL,channel VARCHAR(8) NOT NULL,action VARCHAR(8) NOT NULL,target_user_id CHAR(36) NULL,version INT NOT NULL DEFAULT 1,updated_by CHAR(36) NOT NULL,updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),PRIMARY KEY(tenant_id,number_e164,channel),FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(target_user_id) REFERENCES users(id),FOREIGN KEY(updated_by) REFERENCES users(id)) ENGINE=InnoDB`);
 await db.query(`CREATE TABLE IF NOT EXISTS inbound_routing_audit(id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,number_e164 VARCHAR(16) NOT NULL,channel VARCHAR(8) NOT NULL,action VARCHAR(8) NOT NULL,target_user_id CHAR(36) NULL,actor_id CHAR(36) NOT NULL,version INT NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),INDEX inbound_audit_recent(tenant_id,created_at)) ENGINE=InnoDB`);
}
export async function resolveInboundRoute(db,{tenantId,number:did,channel,ownerId}){
 if(!ownerId)return {action:'block',userId:null,reason:'No current DID owner'};
 const rule=(await db.query('SELECT action,target_user_id,version FROM inbound_routing_rules WHERE tenant_id=$1 AND number_e164=$2 AND channel=$3',[tenantId,did,channel])).rows[0];
 if(rule?.action==='block')return {action:'block',userId:null,reason:'Blocked by administrator',version:rule.version};
 const userId=rule?.action==='user'?rule.target_user_id:ownerId;
 const active=(await db.query("SELECT id FROM users WHERE id=$1 AND tenant_id=$2 AND status='active'",[userId,tenantId])).rows[0];
 if(!active)return {action:'block',userId:null,reason:'Routing recipient unavailable'};
 return {action:rule?.action||'owner',userId,version:rule?.version||0};
}
export async function routingInventory(db,tenant,channel){if(channel==='sms')return (await db.query('SELECT DISTINCT number_e164,user_id FROM flowroute_sms_numbers WHERE tenant_id=$1 AND enabled=TRUE ORDER BY number_e164',[tenant])).rows;return (await db.query(`SELECT DISTINCT number_e164,user_id FROM (
 SELECT number_e164,user_id FROM flowroute_sms_numbers WHERE tenant_id=$1 AND enabled=TRUE
 UNION SELECT number_e164,user_id FROM inhouse_dids WHERE tenant_id=$1 AND status='assigned' AND user_id IS NOT NULL
 UNION SELECT CONCAT('+',TRIM(LEADING '+' FROM q.number_e164)),q.user_id FROM did_quotes q JOIN users u ON u.id=q.user_id AND u.tenant_id=$1 WHERE q.provider='flowroute' AND q.status='fulfilled'
 ) inventory ORDER BY number_e164,user_id`,[tenant])).rows;}
export async function handleInboundRouting({req,res,path,user,pool,send,readJson}){
 if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
 const root='/api/admin/inbound-routing';res.setHeader('Cache-Control','no-store');
 if(path===root&&req.method==='GET'){
  const inventory=await routingInventory(pool,user.tenant_id);
  const rules=(await pool.query('SELECT number_e164,channel,action,target_user_id,version,updated_at FROM inbound_routing_rules WHERE tenant_id=$1 ORDER BY number_e164,channel',[user.tenant_id])).rows;
  const users=(await pool.query("SELECT id,display_name,email FROM users WHERE tenant_id=$1 AND status='active' ORDER BY display_name,id",[user.tenant_id])).rows;
  const events=(await pool.query("SELECT number_e164,channel,action,target_user_id,actor_id,version,created_at FROM inbound_routing_audit WHERE tenant_id=$1 ORDER BY created_at DESC,id DESC LIMIT 50",[user.tenant_id])).rows;
  return send(res,200,{inventory,rules,users,events,scope:'Flowroute inbound voice and Flowroute SMS/MMS. Existing carrier authentication and DID ownership remain required.'});
 }
 if(![root,root+'/test'].includes(path)||!['PUT','POST'].includes(req.method)||path===root&&req.method!=='PUT'||path.endsWith('/test')&&req.method!=='POST')return send(res,405,{error:'Unsupported routing action'});
 const b=await readJson(req);
 if(!b||!number(b.number)||!['voice','sms'].includes(b.channel))return send(res,400,{error:'E.164 number and voice/sms channel required'});
 const inventory=await routingInventory(pool,user.tenant_id,b.channel),owners=[...new Set(inventory.filter(r=>r.number_e164===b.number).map(r=>r.user_id))];
 if(owners.length!==1)return send(res,409,{error:'Assign a unique DID owner before configuring routing'});
 if(path.endsWith('/test'))return send(res,200,{route:await resolveInboundRoute(pool,{tenantId:user.tenant_id,number:b.number,channel:b.channel,ownerId:owners[0]}),simulation:true});
 if(!['owner','user','block'].includes(b.action)||b.action==='user'&&!uuid(b.targetUserId)||!Number.isInteger(b.version)||b.version<0)return send(res,400,{error:'Valid routing action, recipient and current version required'});
 const db=await pool.connect();try{
  await db.query('START TRANSACTION');
  if(b.action==='user'&&!(await db.query("SELECT id FROM users WHERE id=$1 AND tenant_id=$2 AND status='active' FOR UPDATE",[b.targetUserId,user.tenant_id])).rows.length){await db.query('ROLLBACK');return send(res,400,{error:'Active recipient in this tenant required'});}
  const old=(await db.query('SELECT version FROM inbound_routing_rules WHERE tenant_id=$1 AND number_e164=$2 AND channel=$3 FOR UPDATE',[user.tenant_id,b.number,b.channel])).rows[0];
  if(Number(old?.version||0)!==b.version){await db.query('ROLLBACK');return send(res,409,{error:'Routing changed; refresh before saving'});}
  if(old)await db.query('UPDATE inbound_routing_rules SET action=$1,target_user_id=$2,version=version+1,updated_by=$3 WHERE tenant_id=$4 AND number_e164=$5 AND channel=$6',[b.action,b.action==='user'?b.targetUserId:null,user.id,user.tenant_id,b.number,b.channel]);
  else await db.query('INSERT INTO inbound_routing_rules(tenant_id,number_e164,channel,action,target_user_id,updated_by) VALUES($1,$2,$3,$4,$5,$6)',[user.tenant_id,b.number,b.channel,b.action,b.action==='user'?b.targetUserId:null,user.id]);
  await db.query('INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,$4,$5)',[randomUUID(),user.tenant_id,user.id,b.action==='user'?b.targetUserId:owners[0],'inbound_route_'+b.channel+'_'+b.action]);
  await db.query('INSERT INTO inbound_routing_audit(id,tenant_id,number_e164,channel,action,target_user_id,actor_id,version) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),user.tenant_id,b.number,b.channel,b.action,b.action==='user'?b.targetUserId:owners[0],user.id,b.version+1]);
  await db.query('COMMIT');return send(res,200,{saved:true,version:b.version+1});
 }catch(e){await db.query('ROLLBACK');if(e.code==='ER_DUP_ENTRY')return send(res,409,{error:'Routing changed; refresh before saving'});throw e;}finally{db.release();}
}
